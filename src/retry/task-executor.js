/**
 * 任务执行器 - 集成重试执行器和熔断器
 * 
 * 功能：
 * 1. executeTask(taskId, agentId, options) - 执行任务
 * 2. executeStep(taskId, step, agentId) - 执行单个步骤
 * 3. 集成重试策略和熔断器
 * 
 * @version 1.0.0
 * @created 2026-03-27
 */

const { retryExecutor, CircuitBreaker, CircuitState } = require('./index');

/**
 * 任务执行器
 */
class TaskExecutor {
  constructor() {
    this.retryExecutor = retryExecutor;
  }

  /**
   * 执行任务
   * @param {Object} task - 任务对象
   * @param {string} agentId - Agent ID
   * @param {Object} options - 配置选项
   */
  async executeTask(task, agentId, options = {}) {
    const {
      executeFn,
      ...retryOptions
    } = options;

    console.log(`[TaskExecutor] 开始执行任务: ${task.id} (${task.title})`);

    // 执行任务（带重试和熔断）
    const result = await this.retryExecutor.executeWithRetry(task, agentId, {
      ...retryOptions,
      name: task.title,
      executeFn: async (t, a) => {
        if (executeFn) {
          return executeFn(t, a);
        }
        // 默认执行逻辑（可以根据任务类型分发）
        return this.defaultTaskHandler(t, a);
      }
    });

    return result;
  }

  /**
   * 执行单个步骤
   * @param {Object} task - 任务对象
   * @param {Object} step - 步骤对象
   * @param {string} agentId - Agent ID
   */
  async executeStep(task, step, agentId) {
    const stepName = step.name || 'unknown';
    
    console.log(`[TaskExecutor] 开始执行步骤: ${stepName}`);

    const result = await this.retryExecutor.executeWithRetry(task, agentId, {
      name: stepName,
      executeFn: async (t, a) => {
        return this.executeStepAction(t, step, a);
      }
    });

    return result;
  }

  /**
   * 执行步骤动作
   */
  async executeStepAction(task, step, agentId) {
    const action = step.action || 'default';
    
    // 根据动作类型分发执行
    switch (action) {
      case 'read_file':
        return this.handleReadFile(task, step, agentId);
      case 'write_file':
        return this.handleWriteFile(task, step, agentId);
      case 'run_command':
        return this.handleRunCommand(task, step, agentId);
      case 'api_call':
        return this.handleApiCall(task, step, agentId);
      case 'default':
      default:
        return this.handleDefault(task, step, agentId);
    }
  }

  /**
   * 默认任务处理器
   */
  async defaultTaskHandler(task, agentId) {
    // 这里可以根据任务类型分发到不同的处理器
    // 例如：bug_fix, feature, test, deployment 等
    
    console.log(`[TaskExecutor] 默认处理器: 任务 ${task.id}`);
    
    return {
      success: true,
      message: '任务执行完成',
      taskId: task.id
    };
  }

  /**
   * 处理读取文件
   */
  async handleReadFile(task, step, agentId) {
    const fs = require('fs');
    const path = require('path');
    
    const filePath = step.args?.filePath || step.args?.path;
    if (!filePath) {
      throw new Error('缺少文件路径参数');
    }

    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(__dirname, '../../../', filePath);

    const content = fs.readFileSync(fullPath, 'utf-8');
    
    return {
      success: true,
      content,
      filePath: fullPath
    };
  }

  /**
   * 处理写入文件
   */
  async handleWriteFile(task, step, agentId) {
    const fs = require('fs');
    const path = require('path');
    
    const filePath = step.args?.filePath || step.args?.path;
    const content = step.args?.content;
    
    if (!filePath || content === undefined) {
      throw new Error('缺少文件路径或内容参数');
    }

    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(__dirname, '../../../', filePath);

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    
    return {
      success: true,
      filePath: fullPath,
      contentLength: content.length
    };
  }

  /**
   * 处理运行命令
   */
  async handleRunCommand(task, step, agentId) {
    const { exec } = require('child_process');
    
    const command = step.args?.command || step.args?.shell;
    if (!command) {
      throw new Error('缺少命令参数');
    }

    return new Promise((resolve, reject) => {
      exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          return reject(error);
        }
        
        resolve({
          success: true,
          stdout,
          stderr
        });
      });
    });
  }

  /**
   * 处理 API 调用
   */
  async handleApiCall(task, step, agentId) {
    const http = require('http');
    
    const url = step.args?.url || step.args?.endpoint;
    const method = step.args?.method || 'GET';
    const body = step.args?.body;
    const headers = step.args?.headers || {};

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const httpModule = urlObj.protocol === 'https:' ? require('https') : http;

      const requestOptions = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      const req = httpModule.request(url, requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve({
              success: true,
              status: res.statusCode,
              data: jsonData
            });
          } catch {
            resolve({
              success: true,
              status: res.statusCode,
              data: data
            });
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }

  /**
   * 处理默认动作
   */
  async handleDefault(task, step, agentId) {
    // 自定义处理逻辑
    console.log(`[TaskExecutor] 处理默认动作: ${step.action}`);
    
    return {
      success: true,
      message: '默认动作执行完成'
    };
  }

  /**
   * 获取任务的熔断器状态
   */
  async getCircuitBreakerStatus(taskId) {
    const breaker = new CircuitBreaker(taskId);
    await breaker.load();
    return breaker.getState();
  }

  /**
   * 重置任务的熔断器
   */
  async resetCircuitBreaker(taskId) {
    const breaker = new CircuitBreaker(taskId);
    return breaker.reset();
  }

  /**
   * 获取任务的所有执行记录
   */
  getTaskExecutions(taskId) {
    return this.retryExecutor.getTaskExecutions(taskId);
  }
}

// 创建单例实例
const taskExecutor = new TaskExecutor();

// 导出
module.exports = {
  TaskExecutor,
  taskExecutor
};
