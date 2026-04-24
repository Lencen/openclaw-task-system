/**
 * 重试执行器实现 - V6 重试策略组件
 * 
 * 功能：
 * 1. executeWithRetry(task, agentId, options) - 带熔断器的重试执行
 * 2. 执行记录存储到 data/task-executions/
 * 3. 集成到任务执行器
 * 
 * @version 1.0.0
 * @created 2026-03-27
 */

const path = require('path');
const fs = require('fs');

const { CircuitBreaker, CircuitState, getCircuitBreaker } = require('./circuit-breaker');
const { 
  classifyError, 
  categorizeError, 
  shouldRetry, 
  sleep, 
  formatError,
  ErrorType 
} = require('./retry-strategy');

const EXECUTIONS_DIR = path.join(__dirname, '../../../data/task-executions');

// 确保目录存在
if (!fs.existsSync(EXECUTIONS_DIR)) {
  fs.mkdirSync(EXECUTIONS_DIR, { recursive: true });
}

/**
 * 重试执行器
 */
class RetryExecutor {
  constructor() {
    this.executions = new Map();
  }

  /**
   * 执行任务（带重试和熔断）
   * @param {Object} task - 任务对象
   * @param {string} agentId - Agent ID
   * @param {Object} options - 配置选项
   * @param {Function} options.executeFn - 任务执行函数，返回 Promise
   * @param {string} options.name - 任务名称（用于日志）
   * @param {boolean} options.skipCircuitBreaker - 是否跳过熔断器检查
   */
  async executeWithRetry(task, agentId, options = {}) {
    const {
      executeFn,
      name = task.title || 'unknown',
      skipCircuitBreaker = false
    } = options;

    const taskId = task.id;
    const executionId = `${taskId}-${Date.now()}`;
    
    console.log(`[RetryExecutor] 开始执行任务 ${taskId} (${name}) - Execution ID: ${executionId}`);
    
    // 1. 初始化执行记录
    const execution = {
      executionId,
      taskId,
      agentId,
      taskType: task.type,
      taskTitle: task.title,
      startTime: new Date().toISOString(),
      endTime: null,
      status: 'running',
      attempts: [],
      currentAttempt: 0,
      totalRetries: task.retryCount || 0,
      maxRetries: (task.retryCount || 0) + 1,
      error: null,
      circuitBreakerStatus: null
    };
    
    this.executions.set(executionId, execution);
    this.saveExecution(execution);

    // 2. 检查熔断器
    if (!skipCircuitBreaker) {
      const breaker = getCircuitBreaker(taskId);
      await breaker.load();
      
      const cbStatus = await breaker.allowExecute();
      execution.circuitBreakerStatus = cbStatus;
      
      if (!cbStatus.allowed) {
        const errorMsg = `熔断器开启，拒绝执行 (${cbStatus.reason}, ${cbStatus.retryAfter || 0}s 后重试)`;
        execution.status = 'failed';
        execution.error = errorMsg;
        execution.endTime = new Date().toISOString();
        
        console.log(`[RetryExecutor] ${taskId}: ${errorMsg}`);
        this.saveExecution(execution);
        
        return {
          success: false,
          executionId,
          status: 'failed',
          error: errorMsg,
          circuitBreakerStatus: cbStatus
        };
      }
      
      console.log(`[RetryExecutor] ${taskId}: 熔断器状态 ${cbStatus.state}`);
    }

    let lastError = null;
    let attemptNumber = 0;

    // 3. 循环执行，直到成功或达到最大重试次数
    while (true) {
      attemptNumber++;
      execution.currentAttempt = attemptNumber;
      
      const attemptStart = new Date().toISOString();
      console.log(`[RetryExecutor] ${taskId}: 尝试 ${attemptNumber}/${execution.totalRetries + 1}`);
      
      // 4. 执行任务
      try {
        const result = await executeFn(task, agentId, { attempt: attemptNumber });

        // 5. 成功
        const attemptEnd = new Date().toISOString();
        execution.attempts.push({
          attempt: attemptNumber,
          startTime: attemptStart,
          endTime: attemptEnd,
          status: 'success',
          result
        });
        
        // 记录成功到熔断器
        const breaker = getCircuitBreaker(taskId);
        await breaker.recordSuccess();

        execution.status = 'completed';
        execution.endTime = new Date().toISOString();
        
        console.log(`[RetryExecutor] ${taskId}: 执行成功 - Execution ID: ${executionId}`);
        console.log(`[RetryExecutor] ${taskId}: 保存执行状态: ${execution.status}`);
        this.saveExecution(execution);
        this.executions.delete(executionId);

        return {
          success: true,
          executionId,
          status: 'completed',
          result,
          attempts: execution.attempts.length,
          totalRetries: execution.totalRetries
        };

      } catch (error) {
        lastError = error;
        const attemptEnd = new Date().toISOString();
        
        execution.attempts.push({
          attempt: attemptNumber,
          startTime: attemptStart,
          endTime: attemptEnd,
          status: 'failed',
          error: formatError(error)
        });
        
        // 6. 记录失败到熔断器
        const breaker = getCircuitBreaker(taskId);
        await breaker.recordFailure(error);
        
        // 7. 判断是否应该重试
        const retryDecision = await shouldRetry(task, error);
        
        if (!retryDecision.shouldRetry) {
          // 不重试，记录最终失败
          execution.status = retryDecision.reason === 'requires_manual_intervention' 
            ? 'manual_required' 
            : 'failed';
          execution.error = {
            message: error.message,
            reason: retryDecision.reason,
            errorType: retryDecision.errorType,
            attempt: attemptNumber,
            maxRetries: retryDecision.config?.maxRetries || 0
          };
          execution.endTime = new Date().toISOString();
          
          console.log(`[RetryExecutor] ${taskId}: 执行失败 - Reason: ${retryDecision.reason}`);
          this.saveExecution(execution);
          this.executions.delete(executionId);
          
          return {
            success: false,
            executionId,
            status: execution.status,
            error: error.message,
            reason: retryDecision.reason,
            errorType: retryDecision.errorType,
            attempts: execution.attempts,
            totalRetries: execution.totalRetries
          };
        }

        // 8. 更新任务的重试次数
        task.retryCount = retryDecision.retryCount;
        
        console.log(`[RetryExecutor] ${taskId}: 等待 ${retryDecision.delay}ms 后重试`);
        
        // 9. 等待后重试
        await sleep(retryDecision.delay);
      }
    }
  }

  /**
   * 保存执行记录到文件
   */
  saveExecution(execution) {
    try {
      const filePath = path.join(EXECUTIONS_DIR, `${execution.executionId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(execution, null, 2));
      
      // 同时保存到 executions.json 列表（用于快速查询）
      this.saveExecutionList(execution);
      
    } catch (error) {
      console.error('[RetryExecutor] 保存执行记录失败', error.message);
    }
  }

  /**
   * 保存执行记录列表
   */
  saveExecutionList(execution) {
    try {
      const listPath = path.join(EXECUTIONS_DIR, 'executions.json');
      let executions = [];
      
      if (fs.existsSync(listPath)) {
        try {
          executions = JSON.parse(fs.readFileSync(listPath, 'utf-8'));
        } catch {
          executions = [];
        }
      }
      
      // 检查是否已存在相同 executionId 的记录
      const existingIndex = executions.findIndex(e => e.executionId === execution.executionId);
      
      if (existingIndex >= 0) {
        // 更新现有记录
        executions[existingIndex] = {
          executionId: execution.executionId,
          taskId: execution.taskId,
          agentId: execution.agentId,
          taskType: execution.taskType,
          taskTitle: execution.taskTitle,
          startTime: execution.startTime,
          endTime: execution.endTime,
          status: execution.status,
          attempts: execution.attempts.length,
          error: execution.error,
          updatedAt: new Date().toISOString()
        };
      } else {
        // 添加新记录
        executions.push({
          executionId: execution.executionId,
          taskId: execution.taskId,
          agentId: execution.agentId,
          taskType: execution.taskType,
          taskTitle: execution.taskTitle,
          startTime: execution.startTime,
          endTime: execution.endTime,
          status: execution.status,
          attempts: execution.attempts.length,
          error: execution.error,
          createdAt: new Date().toISOString()
        });
      }
      
      fs.writeFileSync(listPath, JSON.stringify(executions, null, 2));
      
    } catch (error) {
      console.error('[RetryExecutor] 保存执行列表失败', error.message);
    }
  }

  /**
   * 获取执行记录
   */
  getExecution(executionId) {
    return this.executions.get(executionId);
  }

  /**
   * 列出所有执行记录
   */
  listExecutions() {
    try {
      const listPath = path.join(EXECUTIONS_DIR, 'executions.json');
      if (fs.existsSync(listPath)) {
        return JSON.parse(fs.readFileSync(listPath, 'utf-8'));
      }
      return [];
    } catch (error) {
      console.error('[RetryExecutor] 列出执行记录失败', error.message);
      return [];
    }
  }

  /**
   * 获取任务的所有执行记录
   */
  getTaskExecutions(taskId) {
    try {
      const executions = this.listExecutions();
      return executions.filter(e => e.taskId === taskId);
    } catch (error) {
      console.error('[RetryExecutor] 获取任务执行记录失败', error.message);
      return [];
    }
  }

  /**
   * 清理旧的执行记录（超过 30 天）
   */
  async cleanupOldExecutions() {
    try {
      const now = Date.now();
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      
      const executions = this.listExecutions();
      let cleanupCount = 0;
      
      for (const execution of executions) {
        const startTime = new Date(execution.startTime).getTime();
        if (now - startTime > THIRTY_DAYS) {
          const filePath = path.join(EXECUTIONS_DIR, `${execution.executionId}.json`);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            cleanupCount++;
          }
        }
      }
      
      console.log(`[RetryExecutor] 清理了 ${cleanupCount} 条旧执行记录`);
      
      return cleanupCount;
    } catch (error) {
      console.error('[RetryExecutor] 清理执行记录失败', error.message);
      return 0;
    }
  }
}

// 创建单例实例
const retryExecutor = new RetryExecutor();

// 导出
module.exports = {
  RetryExecutor,
  retryExecutor,
  EXECUTIONS_DIR
};
