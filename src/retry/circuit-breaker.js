/**
 * 熔断器实现 - V6 重试策略组件
 * 
 * 功能：
 * 1. 按任务监控失败次数
 * 2. 达到阈值后打开熔断
 * 3. 1分钟后进入半开状态尝试恢复
 * 4. 状态: closed | open | half-open
 * 
 * @version 1.0.0
 * @created 2026-03-27
 */

const path = require('path');

// 配置
const BREAKER_DIR = path.join(__dirname, '../../../data/task-executions');
const MAX_FAILURES = 10;           // 连续失败 10 次后熔断
const HALF_OPEN_TIMEOUT = 60000;   // 1 分钟后半开状态尝试恢复

/**
 * 熔断器状态
 */
const CircuitState = {
  CLOSED: 'closed',        // 正常状态，允许执行
  OPEN: 'open',           // 熔断状态，拒绝执行
  HALF_OPEN: 'half-open'  // 半开状态，允许尝试恢复
};

/**
 * 熔断器数据结构
 */
class CircuitBreaker {
  constructor(taskId) {
    this.taskId = taskId;
    this.dataFile = path.join(BREAKER_DIR, `${taskId}.json`);
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.lastStateChangeTime = null;
    this.lastError = null;
  }

  /**
   * 从文件加载熔断器状态
   */
  async load() {
    try {
      if (!require('fs').existsSync(this.dataFile)) {
        console.log(`[CircuitBreaker] ${this.taskId}: 数据文件不存在，使用默认状态`);
        return this;
      }

      const data = JSON.parse(require('fs').readFileSync(this.dataFile, 'utf-8'));
      this.state = data.state || CircuitState.CLOSED;
      this.failureCount = data.failureCount || 0;
      this.lastFailureTime = data.lastFailureTime || null;
      this.lastStateChangeTime = data.lastStateChangeTime || null;
      this.lastError = data.lastError || null;

      console.log(`[CircuitBreaker] ${this.taskId}: 加载状态`, this.state, 
        `失败次数: ${this.failureCount}`);
      
      // 检查是否需要从 OPEN 转换到 HALF_OPEN
      await this.checkStateTransition();
      
    } catch (error) {
      console.error(`[CircuitBreaker] ${this.taskId}: 加载失败`, error.message);
      // 重置为默认状态
      this.state = CircuitState.CLOSED;
      this.failureCount = 0;
    }

    return this;
  }

  /**
   * 检查并转换状态
   */
  async checkStateTransition() {
    if (this.state === CircuitState.OPEN && this.lastStateChangeTime) {
      const elapsed = Date.now() - new Date(this.lastStateChangeTime).getTime();
      if (elapsed >= HALF_OPEN_TIMEOUT) {
        console.log(`[CircuitBreaker] ${this.taskId}: 从 OPEN 转换到 HALF_OPEN`);
        this.state = CircuitState.HALF_OPEN;
        await this.save();
      }
    }
  }

  /**
   * 保存状态到文件
   */
  async save() {
    try {
      require('fs').mkdirSync(BREAKER_DIR, { recursive: true });
      
      const data = {
        taskId: this.taskId,
        state: this.state,
        failureCount: this.failureCount,
        lastFailureTime: this.lastFailureTime,
        lastStateChangeTime: this.lastStateChangeTime,
        lastError: this.lastError,
        updatedAt: new Date().toISOString()
      };

      require('fs').writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
      
    } catch (error) {
      console.error(`[CircuitBreaker] ${this.taskId}: 保存失败`, error.message);
    }
  }

  /**
   * 检查是否允许执行
   */
  async allowExecute() {
    await this.checkStateTransition();

    switch (this.state) {
      case CircuitState.CLOSED:
        return { allowed: true, state: this.state };

      case CircuitState.OPEN:
        return { 
          allowed: false, 
          state: this.state, 
          reason: 'circuit_open',
          retryAfter: Math.ceil((HALF_OPEN_TIMEOUT - (Date.now() - new Date(this.lastStateChangeTime).getTime())) / 1000) 
        };

      case CircuitState.HALF_OPEN:
        return { 
          allowed: true, 
          state: this.state, 
          isTrying: true 
        };

      default:
        return { allowed: false, state: this.state, reason: 'unknown_state' };
    }
  }

  /**
   * 记录成功
   */
  async recordSuccess() {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.lastError = null;

    if (this.state === CircuitState.HALF_OPEN) {
      console.log(`[CircuitBreaker] ${this.taskId}: 成功恢复，从 HALF_OPEN 转换到 CLOSED`);
      this.state = CircuitState.CLOSED;
    }

    await this.save();
  }

  /**
   * 记录失败
   */
  async recordFailure(error) {
    this.failureCount++;
    this.lastFailureTime = new Date().toISOString();
    this.lastError = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };

    if (this.failureCount >= MAX_FAILURES) {
      console.log(`[CircuitBreaker] ${this.taskId}: 失败次数达到 ${MAX_FAILURES}，熔断_OPEN`);
      this.state = CircuitState.OPEN;
    }

    this.lastStateChangeTime = new Date().toISOString();
    await this.save();
  }

  /**
   * 获取当前状态
   */
  async getState() {
    await this.checkStateTransition();
    return {
      taskId: this.taskId,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      lastError: this.lastError,
      halfOpenTimeout: HALF_OPEN_TIMEOUT / 1000
    };
  }

  /**
   * 重置熔断器
   */
  async reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.lastError = null;
    this.lastStateChangeTime = null;

    try {
      if (require('fs').existsSync(this.dataFile)) {
        require('fs').unlinkSync(this.dataFile);
        console.log(`[CircuitBreaker] ${this.taskId}: 已重置`);
      }
    } catch (error) {
      console.error(`[CircuitBreaker] ${this.taskId}: 删除文件失败`, error.message);
    }

    return this;
  }

  /**
   * 获取所有熔断器状态
   */
  static async getAllStates() {
    try {
      if (!require('fs').existsSync(BREAKER_DIR)) {
        return [];
      }

      const files = require('fs').readdirSync(BREAKER_DIR);
      const states = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const data = JSON.parse(require('fs').readFileSync(path.join(BREAKER_DIR, file), 'utf-8'));
          states.push(data);
        } catch (e) {
          console.error(`[CircuitBreaker] 读取 ${file} 失败`, e.message);
        }
      }

      return states;
    } catch (error) {
      console.error('[CircuitBreaker] 获取所有状态失败', error.message);
      return [];
    }
  }
}

/**
 * 获取指定任务的熔断器
 */
function getCircuitBreaker(taskId) {
  return new CircuitBreaker(taskId);
}

// 导出
module.exports = {
  CircuitBreaker,
  CircuitState,
  getMaxFailures: () => MAX_FAILURES,
  getHalfOpenTimeout: () => HALF_OPEN_TIMEOUT,
  getCircuitBreaker
};
