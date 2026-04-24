/**
 * 自动任务执行器 - 集成重试策略和熔断器
 * 
 * 功能：
 * 1. 检查待执行任务
 * 2. 分配 Agent 执行任务
 * 3. 支持自动重试（带重试策略）
 * 4. 支持熔断器机制
 * 5. 记录执行日志
 * 
 * @version 1.0.0
 * @created 2026-03-27
 */

const { db } = require('./db');
const { TaskExecutor } = require('./retry');

// 配置
const EXECUTION_INTERVAL = 30000; // 30 秒检查一次
const MAX_CONCURRENT_EXECUTIONS = 3; // 最大并发执行数

/**
 * 自动任务执行器
 */
class AutoTaskExecutor {
  constructor() {
    this.taskExecutor = new TaskExecutor();
    this.running = false;
    this.executionQueue = [];
    this.activeExecutions = new Map();
  }

  /**
   * 启动自动执行器
   */
  start() {
    if (this.running) {
      console.log('[AutoTaskExecutor] 已经在运行');
      return;
    }

    this.running = true;
    console.log('[AutoTaskExecutor] 启动 - 检查间隔: 30秒');

    // 启动检查循环
    this.checkAndExecute();
    
    // 每 30 秒检查一次
    this.intervalId = setInterval(() => {
      this.checkAndExecute();
    }, EXECUTION_INTERVAL);
  }

  /**
   * 停止自动执行器
   */
  stop() {
    if (!this.running) {
      return;
    }

    this.running = false;
    clearInterval(this.intervalId);
    console.log('[AutoTaskExecutor] 停止');
  }

  /**
   * 检查并执行任务
   */
  async checkAndExecute() {
    try {
      // 获取待执行的任务
      const tasks = await db.all(
        `SELECT * FROM tasks 
         WHERE status = 'pending' 
         AND assigned_agent IS NOT NULL 
         ORDER BY priority ASC, created_at ASC 
         LIMIT 10`
      );

      console.log(`[AutoTaskExecutor] 检查到 ${tasks.length} 个待执行任务`);

      for (const task of tasks) {
        await this.queueTask(task);
      }

      // 执行队列中的任务
      await this.processQueue();

    } catch (error) {
      console.error('[AutoTaskExecutor] 检查任务失败:', error.message);
    }
  }

  /**
   * 将任务加入执行队列
   */
  async queueTask(task) {
    // 检查任务是否已有活跃执行
    if (this.activeExecutions.has(task.id)) {
      console.log(`[AutoTaskExecutor] 任务 ${task.id} 正在执行中，跳过`);
      return;
    }

    // 检查熔断器状态
    const cbStatus = await this.taskExecutor.getCircuitBreakerStatus(task.id);
    
    if (cbStatus.state === 'open') {
      console.log(`[AutoTaskExecutor] 任务 ${task.id} 熔断器开启，跳过执行 (${cbStatus.retryAfter}s 后重试)`);
      return;
    }

    // 检查队列是否已满
    if (this.executionQueue.length >= MAX_CONCURRENT_EXECUTIONS) {
      console.log(`[AutoTaskExecutor] 队列已满，等待中...`);
      return;
    }

    // 加入队列
    this.executionQueue.push(task);
    console.log(`[AutoTaskExecutor] 将任务 ${task.id} 加入执行队列`);
  }

  /**
   * 处理执行队列
   */
  async processQueue() {
    while (this.executionQueue.length > 0) {
      const task = this.executionQueue.shift();
      
      // 检查执行器是否繁忙
      if (this.activeExecutions.size >= MAX_CONCURRENT_EXECUTIONS) {
        // 队列重新加入
        this.executionQueue.unshift(task);
        break;
      }

      await this.executeTask(task);
    }
  }

  /**
   * 执行任务
   */
  async executeTask(task) {
    const taskId = task.id;
    const agentId = task.assigned_agent;

    if (!agentId) {
      console.log(`[AutoTaskExecutor] 任务 ${taskId} 未分配 Agent，跳过`);
      return;
    }

    console.log(`[AutoTaskExecutor] 开始执行任务: ${taskId} (Agent: ${agentId})`);

    // 标记为正在执行
    this.activeExecutions.set(taskId, {
      startTime: new Date().toISOString(),
      task
    });

    try {
      // 执行任务（带重试和熔断器）
      const result = await this.taskExecutor.executeTask(task, agentId, {
        executeFn: async (t, a) => {
          // 执行任务的 default handler
          return this.taskExecutor.defaultTaskHandler(t, a);
        }
      });

      console.log(`[AutoTaskExecutor] 任务 ${taskId} 执行完成:`, result.success ? '成功' : '失败');

      // 更新任务状态
      await db.run(
        `UPDATE tasks 
         SET status = ?, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [result.success ? 'completed' : 'failed', taskId]
      );

      // 记录执行日志
      await db.run(
        `INSERT INTO execution_logs (task_id, agent_id, action, level, message)
         VALUES (?, ?, ?, ?, ?)`,
        [taskId, agentId, 'execute', result.success ? 'info' : 'error', 
         result.success ? '任务执行完成' : `任务执行失败: ${result.error}`]
      );

    } catch (error) {
      console.error(`[AutoTaskExecutor] 任务 ${taskId} 执行异常:`, error.message);

      // 更新任务状态
      await db.run(
        `UPDATE tasks 
         SET status = 'failed', 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [taskId]
      );

      // 记录执行日志
      await db.run(
        `INSERT INTO execution_logs (task_id, agent_id, action, level, message)
         VALUES (?, ?, ?, ?, ?)`,
        [taskId, agentId, 'execute', 'error', error.message]
      );

    } finally {
      // 移除执行标记
      this.activeExecutions.delete(taskId);
    }
  }

  /**
   * 获取执行器状态
   */
  getStatus() {
    return {
      running: this.running,
      queueLength: this.executionQueue.length,
      activeExecutions: this.activeExecutions.size,
      activeExecutionIds: Array.from(this.activeExecutions.keys()),
      interval: EXECUTION_INTERVAL,
      maxConcurrent: MAX_CONCURRENT_EXECUTIONS
    };
  }
}

// 创建单例实例
const autoTaskExecutor = new AutoTaskExecutor();

// 导出
module.exports = {
  AutoTaskExecutor,
  autoTaskExecutor
};

// 如果直接运行此文件，则启动执行器
if (require.main === module) {
  console.log('[AutoTaskExecutor] 启动自动任务执行器');
  autoTaskExecutor.start();

  // 处理退出信号
  process.on('SIGINT', () => {
    console.log('\n[AutoTaskExecutor] 收到退出信号');
    autoTaskExecutor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[AutoTaskExecutor] 收到终止信号');
    autoTaskExecutor.stop();
    process.exit(0);
  });
}
