/**
 * 任务锁管理器
 * 
 * 功能：
 * 1. 获取任务锁（支持 Redis SETNX 原子操作）
 * 2. 释放任务锁（验证所有者）
 * 3. 延长锁过期时间
 * 4. 锁过期处理
 * 5. 支持可重入锁（同一 Agent 可重复获取）
 * 6. 看门狗机制（自动续期）
 * 7. 重试机制
 * 8. 错误分类
 * 
 * @version 1.2.0
 * @created 2026-03-27
 * @updated 2026-03-28 - 添加看门狗机制、重试机制、错误分类
 */

const RedisPool = require('./redis-pool');
const { breakerManager } = require('./circuit-breaker');

// 看门狗定时器集合
const heartbeats = new Map();

/**
 * 错误分类
 * 
 * @param {Error} error - 错误对象
 * @returns {string} 错误类型：'temporary' | 'permanent' | 'network'
 */
function classifyError(error) {
  if (!error) return 'permanent';
  
  const message = error.message || '';
  const code = error.code || '';
  
  // 网络错误
  if (
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ECONNRESET') ||
    message.includes('ENOTFOUND') ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND'
  ) {
    return 'network';
  }
  
  // 临时错误
  if (
    message.includes('BUSYGROUP') ||
    message.includes('NOGROUP') ||
    code === 'BUSYGROUP' ||
    code === 'NOGROUP' ||
    message.includes('TRYAGAIN') ||
    code === 'TRYAGAIN'
  ) {
    return 'temporary';
  }
  
  // 永久错误
  if (
    message.includes('READONLY') ||
    message.includes('NOPERM') ||
    message.includes('ERR') ||
    code === 'READONLY' ||
    code === 'NOPERM'
  ) {
    return 'permanent';
  }
  
  // 默认：网络错误
  return 'network';
}

/**
 * 任务锁管理器
 */
class LockManager {
  constructor() {
    this.defaultTtl = 600000; // 10 分钟
    this.config = {
      ttl: 600000, // 可配置的 TTL
      enableReentrant: true, // 是否启用可重入锁
      heartbeatInterval: 30000, // 看门狗心跳间隔（毫秒）
      maxRetryAttempts: 3, // 最大重试次数
      retryDelay: 1000 // 重试延迟（毫秒）
    };
    
    // 熔断器实例
    this.circuitBreaker = breakerManager.getBreaker('LockManager', {
      failureThreshold: 5,
      resetTimeout: 60000,
      halfOpenRequests: 3
    });
  }

  /**
   * 获取任务锁
   * 
   * @param {string} taskId - 任务 ID
   * @param {object} options - 锁选项
   * @param {string} options.agentId - Agent ID
   * @param {string} options.sessionId - 会话 ID
   * @param {number} options.ttl - 过期时间（毫秒）
   * @param {boolean} options.reentrant - 是否允许重入
   * @param {boolean} options.startHeartbeat - 是否启动看门狗
   */
  async acquireLock(taskId, options = {}) {
    const {
      agentId,
      sessionId,
      ttl = this.config.ttl,
      reentrant = this.config.enableReentrant,
      startHeartbeat = true
    } = options;

    if (!agentId) {
      throw new Error('agentId is required');
    }

    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    const lockData = {
      agentId,
      sessionId,
      acquiredAt: Date.now()
    };

    const createOptions = reentrant ? { currentAgentId: agentId } : {};
    
    const result = await RedisPool.createLock(taskId, lockData, ttl, createOptions);
    
    // 如果成功获取锁且启动看门狗
    if (result.success && startHeartbeat) {
      this.startHeartbeat(taskId, ttl / 2);
    }
    
    return result;
  }

  /**
   * 释放任务锁
   * 
   * @param {string} taskId - 任务 ID
   * @param {string} agentId - Agent ID
   * @param {string} sessionId - 会话 ID
   */
  async releaseLock(taskId, agentId, sessionId) {
    // 停止看门狗
    this.stopHeartbeat(taskId);
    
    // 验证锁的所有者
    const lockInfo = await RedisPool.getLockInfo(taskId);

    if (!lockInfo.lock) {
      return {
        success: true,
        reason: 'no_lock'
      };
    }

    if (lockInfo.lock.agentId !== agentId) {
      return {
        success: false,
        reason: 'not_owner',
        currentOwner: lockInfo.lock.agentId
      };
    }

    if (lockInfo.lock.sessionId !== sessionId) {
      return {
        success: false,
        reason: 'session_mismatch',
        currentSession: lockInfo.lock.sessionId
      };
    }

    // 释放锁
    return RedisPool.releaseLock(taskId, agentId, sessionId);
  }

  /**
   * 延长锁过期时间
   * 
   * @param {string} taskId - 任务 ID
   * @param {number} ttl - 新的过期时间（毫秒）
   */
  async extendLock(taskId, ttl = this.config.ttl) {
    return RedisPool.extendLock(taskId, ttl);
  }

  /**
   * 启动看门狗心跳
   * 
   * @param {string} taskId - 任务 ID
   * @param {number} interval - 心跳间隔（毫秒）
   */
  startHeartbeat(taskId, interval = this.config.heartbeatInterval) {
    // 如果已存在心跳，先停止
    this.stopHeartbeat(taskId);
    
    const heartbeat = setInterval(async () => {
      try {
        // 检查锁是否存在
        const lockInfo = await RedisPool.getLockInfo(taskId);
        
        if (!lockInfo.lock) {
          // 锁不存在，停止看门狗
          this.stopHeartbeat(taskId);
          return;
        }
        
        // 延长锁过期时间
        await RedisPool.extendLock(taskId, this.config.ttl);
        console.log(`[LockManager] 看门狗续期: ${taskId}`);
      } catch (error) {
        console.error(`[LockManager] 看门狗续期失败: ${taskId}`, error.message);
      }
    }, interval);
    
    // 保存心跳定时器
    heartbeats.set(taskId, {
      timer: heartbeat,
      interval,
      lastHeartbeat: Date.now()
    });
  }

  /**
   * 停止看门狗心跳
   * 
   * @param {string} taskId - 任务 ID
   */
  stopHeartbeat(taskId) {
    const heartbeat = heartbeats.get(taskId);
    
    if (heartbeat) {
      clearInterval(heartbeat.timer);
      heartbeats.delete(taskId);
      console.log(`[LockManager] 看门狗已停止: ${taskId}`);
    }
  }

  /**
   * 检查锁是否存在
   * 
   * @param {string} taskId - 任务 ID
   */
  async checkLock(taskId) {
    return RedisPool.checkLock(taskId);
  }

  /**
   * 获取锁信息
   * 
   * @param {string} taskId - 任务 ID
   */
  async getLockInfo(taskId) {
    return RedisPool.getLockInfo(taskId);
  }

  /**
   * 处理锁过期
   * 
   * @param {string} taskId - 任务 ID
   * @param {function} onExpired - 过期处理回调
   * @param {object} options - 选项
   * @param {string} options.agentId - Agent ID（可选，用于验证）
   * @param {string} options.sessionId - 会话 ID（可选，用于验证）
   */
  async handleLockExpired(taskId, onExpired, options = {}) {
    const lockInfo = await RedisPool.getLockInfo(taskId);

    if (!lockInfo.lock) {
      return { handled: false, reason: 'no_lock' };
    }

    const elapsed = Date.now() - lockInfo.lock.acquiredAt;
    const ttl = this.defaultTtl;

    if (elapsed >= ttl) {
      // 锁已过期
      await onExpired(lockInfo.lock);
      
      // 自动释放过期锁（不验证所有者，因为锁已过期）
      await RedisPool.releaseLock(taskId, options.agentId, options.sessionId);

      return {
        handled: true,
        reason: 'expired',
        lock: lockInfo.lock
      };
    }

    return {
      handled: false,
      elapsed,
      ttl
    };
  }

  /**
   * 带重试的锁操作
   * 
   * @param {string} operation - 操作类型：'acquire' | 'release' | 'extend'
   * @param {string} taskId - 任务 ID
   * @param {object} params - 操作参数
   */
  async executeWithRetry(operation, taskId, params = {}) {
    const maxAttempts = this.config.maxRetryAttempts;
    const retryDelay = this.config.retryDelay;
    
    // 检查熔断器是否初始化
    if (!this.circuitBreaker || typeof this.circuitBreaker.allowRequest !== 'function') {
      // 没有熔断器，直接执行
      return this._executeOperation(operation, taskId, params, 1);
    }
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // 检查熔断器状态
        if (!this.circuitBreaker.allowRequest()) {
          throw new Error('Circuit breaker is open');
        }
        
        // 执行操作
        let result = await this._executeOperation(operation, taskId, params, attempt);
        
        // 请求成功，重置熔断器
        this.circuitBreaker.recordSuccess();
        
        return result;
      } catch (error) {
        // 分类错误
        const errorType = classifyError(error);
        
        // 记录失败
        this.circuitBreaker.recordFailure(error);
        
        // 如果是永久错误，不重试
        if (errorType === 'permanent') {
          throw error;
        }
        
        // 如果是最后一次重试，抛出错误
        if (attempt === maxAttempts) {
          throw error;
        }
        
        // 等待后重试
        console.log(`[LockManager] 重试 ${operation} (${attempt}/${maxAttempts})`, error.message);
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }
  
  /**
   * 执行锁操作
   * 
   * @param {string} operation - 操作类型
   * @param {string} taskId - 任务 ID
   * @param {object} params - 操作参数
   * @param {number} attempt - 尝试次数
   */
  async _executeOperation(operation, taskId, params, attempt) {
    switch (operation) {
      case 'acquire':
        return await this.acquireLock(taskId, params);
      case 'release':
        return await this.releaseLock(taskId, params.agentId, params.sessionId);
      case 'extend':
        return await this.extendLock(taskId, params.ttl);
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * 锁状态枚举
   */
  get LockStatus() {
    return {
      ACQUIRED: 'acquired',
      EXPIRED: 'expired',
      NOT_FOUND: 'not_found',
      LOCKED_BY_OTHER: 'locked_by_other'
    };
  }
}

// 创建单例实例
const lockManager = new LockManager();

// 导出类和实例
module.exports = lockManager;
module.exports.LockManager = LockManager;

// 导出基础工具函数
module.exports.classifyError = classifyError;
module.exports.executeWithRetry = lockManager.executeWithRetry.bind(lockManager);
