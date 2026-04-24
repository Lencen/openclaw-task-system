/**
 * Redis 故障降级管理器
 * 
 * 功能：
 * 1. Redis不可用时降级到SQLite
 * 2. 实现乐观锁机制
 * 3. 提供 fallback 版本的锁操作
 * 
 * @version 1.0.0
 * @created 2026-03-28
 */

const SQLitePool = require('./sqlite-pool');
const fs = require('fs');
const path = require('path');

// 缓存降级状态
let isRedisAvailable = true;
let redisFailureCount = 0;

/**
 * 降级配置
 */
const DEGRADE_CONFIG = {
  redisFailureThreshold: 3, // 连续失败次数阈值
  sqliteFallbackPath: path.join(__dirname, '../../data/locks.db'), // SQLite数据库路径
  enableOptimisticLock: true // 是否启用乐观锁
};

/**
 * 检查 Redis 是否可用
 */
async function checkRedisHealth() {
  try {
    // 尝试执行一个简单操作
    const result = await SQLitePool.getInstance().get('health_check');
    return result !== null;
  } catch (error) {
    return false;
  }
}

/**
 * 获取 SQLite 连接池实例
 */
function getSQLitePool() {
  try {
    return SQLitePool.getInstance();
  } catch (error) {
    console.error('[FallbackManager] SQLite 初始化失败:', error.message);
    return null;
  }
}

/**
 * 生成乐观锁版本号
 */
function generateVersion() {
  return Date.now();
}

/**
 * 任务锁降级管理器
 */
class FallbackLockManager {
  constructor() {
    this.config = DEGRADE_CONFIG;
    this.locks = new Map(); // 本地缓存锁信息
  }

  /**
   * 尝试获取锁（降级模式）
   * 
   * @param {string} taskId - 任务 ID
   * @param {object} lockData - 锁数据
   * @param {number} ttl - 过期时间（毫秒）
   */
  async acquireFallbackLock(taskId, lockData, ttl = 600000) {
    // 检查 SQLite 是否可用
    const sqlite = getSQLitePool();
    if (!sqlite) {
      return {
        success: false,
        reason: 'sqlite_unavailable'
      };
    }

    const key = `lock:${taskId}`;
    const now = Date.now();
    
    try {
      // 检查是否已存在锁
      const existingLock = await sqlite.get(key);
      
      // 如果存在锁，检查是否已过期
      if (existingLock) {
        if (now < existingLock.expiry) {
          // 锁未过期，获取失败
          return {
            success: false,
            reason: 'lock_exists',
            currentOwner: existingLock.agentId
          };
        }
        
        // 锁已过期，可以竞争
        // 乐观锁：只有版本号匹配时才能获得锁
        if (this.config.enableOptimisticLock && existingLock.version && existingLock.version !== lockData.version) {
          return {
            success: false,
            reason: 'version_mismatch',
            currentOwner: existingLock.agentId
          };
        }
      }
      
      // 创建新锁
      const newLock = {
        ...lockData,
        acquiredAt: now,
        expiry: now + ttl,
        version: lockData.version || generateVersion(),
        isFallback: true
      };
      
      // 写入锁
      await sqlite.set(key, newLock, ttl);
      
      // 缓存锁信息
      this.locks.set(taskId, newLock);
      
      return {
        success: true,
        key,
        lock: newLock
      };
    } catch (error) {
      console.error('[FallbackManager] 获取锁失败:', error.message);
      return {
        success: false,
        reason: 'error',
        error: error.message
      };
    }
  }

  /**
   * 尝试释放锁（降级模式）
   * 
   * @param {string} taskId - 任务 ID
   * @param {string} agentId - Agent ID
   * @param {string} sessionId - 会话 ID
   */
  async releaseFallbackLock(taskId, agentId, sessionId) {
    const sqlite = getSQLitePool();
    if (!sqlite) {
      return {
        success: false,
        reason: 'sqlite_unavailable'
      };
    }

    const key = `lock:${taskId}`;
    
    try {
      // 获取锁信息
      const lock = await sqlite.get(key);
      
      if (!lock) {
        return {
          success: true,
          reason: 'no_lock'
        };
      }
      
      // 验证所有者
      if (lock.agentId !== agentId) {
        return {
          success: false,
          reason: 'not_owner',
          currentOwner: lock.agentId
        };
      }
      
      if (lock.sessionId !== sessionId) {
        return {
          success: false,
          reason: 'session_mismatch',
          currentSession: lock.sessionId
        };
      }
      
      // 删除锁
      await sqlite.del(key);
      
      // 删除缓存
      this.locks.delete(taskId);
      
      return {
        success: true,
        key
      };
    } catch (error) {
      console.error('[FallbackManager] 释放锁失败:', error.message);
      return {
        success: false,
        reason: 'error',
        error: error.message
      };
    }
  }

  /**
   * 延长锁过期时间（降级模式）
   * 
   * @param {string} taskId - 任务 ID
   * @param {number} ttl - 新的过期时间（毫秒）
   */
  async extendFallbackLock(taskId, ttl = 600000) {
    const sqlite = getSQLitePool();
    if (!sqlite) {
      return {
        success: false,
        reason: 'sqlite_unavailable'
      };
    }

    const key = `lock:${taskId}`;
    
    try {
      // 获取锁信息
      const lock = await sqlite.get(key);
      
      if (!lock) {
        return {
          success: false,
          reason: 'no_lock'
        };
      }
      
      // 延长过期时间
      const newExpiry = Date.now() + ttl;
      
      // 检查是否超出最大 TTL
      const maxTtl = 3600000; // 1小时
      if (ttl > maxTtl) {
        return {
          success: false,
          reason: 'ttl_too_large',
          maxTtl
        };
      }
      
      // 更新锁
      lock.expiry = newExpiry;
      await sqlite.set(key, lock, ttl);
      
      // 更新缓存
      this.locks.set(taskId, lock);
      
      return {
        success: true,
        key,
        expiry: newExpiry
      };
    } catch (error) {
      console.error('[FallbackManager] 延长锁过期时间失败:', error.message);
      return {
        success: false,
        reason: 'error',
        error: error.message
      };
    }
  }

  /**
   * 检查锁是否存在（降级模式）
   * 
   * @param {string} taskId - 任务 ID
   */
  async checkFallbackLock(taskId) {
    const sqlite = getSQLitePool();
    if (!sqlite) {
      return {
        exists: false,
        reason: 'sqlite_unavailable'
      };
    }

    const key = `lock:${taskId}`;
    
    try {
      const lock = await sqlite.get(key);
      const now = Date.now();
      
      // 检查锁是否存在且未过期
      if (lock && now < lock.expiry) {
        return {
          exists: true,
          key,
          lock
        };
      }
      
      // 锁不存在或已过期
      if (lock) {
        // 清理过期锁
        await sqlite.del(key);
        this.locks.delete(taskId);
      }
      
      return {
        exists: false,
        key
      };
    } catch (error) {
      console.error('[FallbackManager] 检查锁失败:', error.message);
      return {
        exists: false,
        reason: 'error',
        error: error.message
      };
    }
  }

  /**
   * 获取锁信息（降级模式）
   * 
   * @param {string} taskId - 任务 ID
   */
  async getFallbackLockInfo(taskId) {
    const sqlite = getSQLitePool();
    if (!sqlite) {
      return {
        lock: null,
        reason: 'sqlite_unavailable'
      };
    }

    const key = `lock:${taskId}`;
    
    try {
      const lock = await sqlite.get(key);
      const now = Date.now();
      
      // 检查锁是否有效
      if (lock && now < lock.expiry) {
        return {
          key,
          lock
        };
      }
      
      // 锁已过期
      if (lock) {
        await sqlite.del(key);
        this.locks.delete(taskId);
      }
      
      return {
        key,
        lock: null
      };
    } catch (error) {
      console.error('[FallbackManager] 获取锁信息失败:', error.message);
      return {
        reason: 'error',
        error: error.message
      };
    }
  }

  /**
   * 检查是否处于降级模式
   */
  isDegradeMode() {
    return !isRedisAvailable;
  }

  /**
   * 切换回 Redis 模式
   */
  async switchToRedis() {
    isRedisAvailable = true;
    redisFailureCount = 0;
    console.log('[FallbackManager] 切换回 Redis 模式');
  }

  /**
   * 切换到降级模式
   */
  async switchToDegrade() {
    isRedisAvailable = false;
    redisFailureCount = 0;
    console.log('[FallbackManager] 切换到降级模式');
  }

  /**
   * 记录 Redis 失败
   */
  recordRedisFailure() {
    redisFailureCount++;
    
    if (redisFailureCount >= this.config.redisFailureThreshold) {
      this.switchToDegrade();
    }
  }

  /**
   * 重置失败计数
   */
  resetFailureCount() {
    redisFailureCount = 0;
  }
}

// 创建单例实例
const fallbackLockManager = new FallbackLockManager();

// 监听 Redis 错误
if (require('./redis-pool').getPool) {
  const pool = require('./redis-pool').getPool();
  
  if (pool) {
    pool.on('error', (error) => {
      fallbackLockManager.recordRedisFailure();
    });
    
    pool.on('close', () => {
      fallbackLockManager.recordRedisFailure();
    });
  }
}

module.exports = fallbackLockManager;
