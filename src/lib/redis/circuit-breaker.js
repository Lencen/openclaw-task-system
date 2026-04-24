/**
 * 熔断器实现
 * 
 * 功能：
 * 1. 三态：closed/open/half_open
 * 2. 失败次数达到阈值时打开
 * 3. 半开状态允许试探性请求
 * 4. 保护系统免受连续失败影响
 * 
 * @version 1.0.0
 * @created 2026-03-28
 */

/**
 * 熔断器状态枚举
 */
const CircuitState = {
  CLOSED: 'closed',      // 关闭状态，正常处理请求
  OPEN: 'open',          // 打开状态，拒绝所有请求
  HALF_OPEN: 'half_open' // 半开状态，允许试探性请求
};

/**
 * 熔断器配置
 */
const DEFAULT_CONFIG = {
  failureThreshold: 5,      // 失败次数阈值
  resetTimeout: 60000,      // 重置超时时间（毫秒）
  halfOpenRequests: 3,      // 半开状态允许的请求数
  halfOpenTimeout: 10000,   // 半开状态超时时间
  successThreshold: 3       // 半开状态成功次数阈值
};

/**
 * 熔断器
 */
class CircuitBreaker {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // 状态
    this.state = CircuitState.CLOSED;
    
    // 计数器
    this.failureCount = 0;
    this.successCount = 0;
    
    // 时间戳
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    
    // 半开状态
    this.halfOpenRequests = 0;
    
    // 统计信息
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    
    // 错误记录
    this.errors = [];
  }

  /**
   * 检查是否允许请求
   */
  allowRequest() {
    this.totalRequests++;
    
    switch (this.state) {
      case CircuitState.CLOSED:
        return this._checkClosedState();
      
      case CircuitState.OPEN:
        return this._checkOpenState();
      
      case CircuitState.HALF_OPEN:
        return this._checkHalfOpenState();
      
      default:
        return false;
    }
  }

  /**
   * 处理成功
   */
  recordSuccess() {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();
    this.successCount++;
    
    switch (this.state) {
      case CircuitState.HALF_OPEN:
        // 半开状态成功次数达到阈值，关闭熔断器
        if (this.successCount >= this.config.successThreshold) {
          this._closeCircuit();
        }
        break;
      
      case CircuitState.CLOSED:
        // 成功时重置失败计数
        this.failureCount = 0;
        break;
    }
  }

  /**
   * 处理失败
   */
  recordFailure(error = null) {
    this.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    // 记录错误
    if (error) {
      this.errors.push({
        time: Date.now(),
        message: error.message || String(error),
        stack: error.stack || null
      });
      
      // 限制错误记录数量
      if (this.errors.length > 100) {
        this.errors.shift();
      }
    }
    
    switch (this.state) {
      case CircuitState.CLOSED:
        // 失败次数达到阈值，打开熔断器
        if (this.failureCount >= this.config.failureThreshold) {
          this._openCircuit();
        }
        break;
      
      case CircuitState.HALF_OPEN:
        // 半开状态失败，重新打开熔断器
        this._openCircuit();
        break;
    }
  }

  /**
   * 关闭状态检查
   */
  _checkClosedState() {
    return true;
  }

  /**
   * 打开状态检查
   */
  _checkOpenState() {
    // 检查是否超过重置超时时间
    if (this.lastFailureTime && 
        Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
      this._halfOpenCircuit();
      return true;
    }
    
    return false;
  }

  /**
   * 半开状态检查
   */
  _checkHalfOpenState() {
    // 检查是否超过半开超时时间
    if (this.lastSuccessTime && 
        Date.now() - this.lastSuccessTime >= this.config.halfOpenTimeout) {
      this._openCircuit();
      return false;
    }
    
    // 检查是否达到半开请求数限制
    if (this.halfOpenRequests >= this.config.halfOpenRequests) {
      return false;
    }
    
    this.halfOpenRequests++;
    return true;
  }

  /**
   * 打开熔断器
   */
  _openCircuit() {
    this.state = CircuitState.OPEN;
    this.halfOpenRequests = 0;
    console.warn('[CircuitBreaker] 熔断器已打开', {
      failureCount: this.failureCount,
      resetTimeout: this.config.resetTimeout
    });
  }

  /**
   * 半开熔断器
   */
  _halfOpenCircuit() {
    this.state = CircuitState.HALF_OPEN;
    this.halfOpenRequests = 0;
    this.successCount = 0;
    console.log('[CircuitBreaker] 熔断器进入半开状态');
  }

  /**
   * 关闭熔断器
   */
  _closeCircuit() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.halfOpenRequests = 0;
    this.successCount = 0;
    console.log('[CircuitBreaker] 熔断器已关闭');
  }

  /**
   * 重置熔断器
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenRequests = 0;
    this.errors = [];
  }

  /**
   * 获取当前状态
   */
  getState() {
    return {
      ...this.config,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      halfOpenRequests: this.halfOpenRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      errors: this.errors.slice(-5) // 最近5个错误
    };
  }

  /**
   * 序列化状态
   */
  toJSON() {
    return this.getState();
  }

  /**
   * 获取状态字符串
   */
  toString() {
    return `CircuitBreaker(${this.state})`;
  }

  /**
   * 判断是否打开
   */
  isOpen() {
    return this.state === CircuitState.OPEN;
  }

  /**
   * 判断是否关闭
   */
  isClosed() {
    return this.state === CircuitState.CLOSED;
  }

  /**
   * 判断是否半开
   */
  isHalfOpen() {
    return this.state === CircuitState.HALF_OPEN;
  }
}

/**
 * 全局熔断器管理器
 */
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * 获取或创建熔断器
   */
  getBreaker(name, config = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(config));
    }
    return this.breakers.get(name);
  }

  /**
   * 删除熔断器
   */
  removeBreaker(name) {
    this.breakers.delete(name);
  }

  /**
   * 获取所有熔断器状态
   */
  getAllStates() {
    const states = {};
    for (const [name, breaker] of this.breakers) {
      states[name] = breaker.getState();
    }
    return states;
  }
}

// 创建全局管理器
const breakerManager = new CircuitBreakerManager();

module.exports = {
  CircuitState,
  CircuitBreaker,
  CircuitBreakerManager,
  breakerManager,
  
  // 导出默认配置
  DEFAULT_CONFIG
};
