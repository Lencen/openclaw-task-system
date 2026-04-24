/**
 * Redis 连接池模块
 * 
 * 功能：
 * 1. 连接池配置（最大连接数、超时时间）
 * 2. 自动重连机制（断线后自动重连）
 * 3. 连接健康检查
 * 4. 优雅关闭
 * 
 * @version 1.0.0
 * @created 2026-03-27
 */

const Redis = require('ioredis');
const path = require('path');
const fs = require('fs');

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, '../../config/redis.json');

/**
 * Redis 连接池配置
 */
const DEFAULT_CONFIG = {
  host: 'localhost',
  port: 6379,
  password: '',
  db: 0,
  maxConnections: 10,
  minConnections: 2,
  connectionTimeout: 5000,
  maxIdleTime: 30000,
  queueSize: 100,
  retryStrategy: (times) => {
    // 指数退避重连
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  // 哨兵模式配置（可选）
  sentinel: {
    enabled: false,
    masterName: 'mymaster',
    sentinels: [
      { host: 'localhost', port: 26379 }
    ]
  }
};

/**
 * 全局实例
 */
let redisPool = null;
let config = null;

/**
 * 加载配置文件
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      config = { ...DEFAULT_CONFIG, ...fileConfig };
      console.log('[RedisPool] 配置文件加载成功');
    } else {
      config = { ...DEFAULT_CONFIG };
      console.log('[RedisPool] 使用默认配置');
    }
  } catch (error) {
    console.error('[RedisPool] 配置文件加载失败:', error.message);
    config = { ...DEFAULT_CONFIG };
  }
  
  return config;
}

/**
 * 创建连接
 */
function createConnection() {
  const pool = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    maxRetriesPerRequest: 5,
    retryStrategy: config.retryStrategy,
    // 建立连接超时
    connectTimeout: config.connectionTimeout,
    // 空闲超时
    maxIdleTime: config.maxIdleTime,
    // 队列大小
    queueSize: config.queueSize,
    // 哨兵模式
    ...(config.sentinel.enabled ? {
      sentinels: config.sentinel.sentinels,
      name: config.sentinel.masterName,
      role: 'master'
    } : {})
  });

  return pool;
}

/**
 * 初始化连接池
 */
function initPool() {
  if (redisPool) {
    return redisPool;
  }

  loadConfig();

  // 创建连接池
  redisPool = createConnection();

  // 监听连接事件
  redisPool.on('connect', () => {
    console.log('[RedisPool] Redis 连接成功');
  });

  redisPool.on('reconnecting', () => {
    console.log('[RedisPool] 正在重新连接 Redis...');
  });

  redisPool.on('close', () => {
    console.log('[RedisPool] Redis 连接已关闭');
  });

  // 错误处理
  redisPool.on('error', (err) => {
    console.error('[RedisPool] Redis 错误:', err.message);
    // 重连失败时，记录日志
    if (redisPool.status === 'close' || redisPool.status === 'end') {
      console.warn('[RedisPool] Redis 连接已关闭，等待重连...');
    }
  });

  // 连接超时
  redisPool.on('timeout', () => {
    console.warn('[RedisPool] Redis 连接超时');
  });
  
  // 连接断开
  redisPool.on('close', () => {
    console.log('[RedisPool] Redis 连接已关闭');
  });
  
  // 重连中
  redisPool.on('reconnecting', (info) => {
    console.log(`[RedisPool] 正在重新连接 Redis: 重连次数 ${info.attempt}`);
  });

  // 检查连接状态
  setTimeout(checkConnection, 1000);

  return redisPool;
}

/**
 * 检查连接状态（健康检查）
 */
function checkConnection() {
  if (!redisPool) {
    console.warn('[RedisPool] 连接池未初始化');
    return false;
  }

  // 获取连接状态
  const status = redisPool.status;
  
  if (status === 'close' || status === 'end') {
    console.warn('[RedisPool] Redis 连接已关闭，正在尝试重连...');
    return false;
  }

  // 使用 PING 命令检查连接
  redisPool.ping()
    .then(() => {
      console.log('[RedisPool] 连接健康检查通过');
    })
    .catch((err) => {
      console.error('[RedisPool] 连接健康检查失败:', err.message);
    });

  return true;
}

/**
 * 启动健康检查（定时执行）
 */
function startHealthCheck(interval = 10000) {
  return setInterval(() => {
    checkConnection();
  }, interval);
}

/**
 * 创建任务锁
 * 
 * @param {string} taskId - 任务 ID
 * @param {object} lockData - 锁数据
 * @param {number} ttl - 过期时间（毫秒）
 * @param {object} options - 选项
 * @param {string} options.currentAgentId - 当前 Agent ID（用于可重入）
 */
async function createLock(taskId, lockData, ttl = 600000, options = {}) {
  const redis = initPool();
  const key = `task:lock:${taskId}`;
  
  try {
    const { currentAgentId } = options;
    
    // 检查锁是否已存在
    const existingLock = await getLockInfo(taskId);
    
    // 如果锁存在且持有者是当前 Agent，支持可重入（延长 TTL）
    if (existingLock.lock && existingLock.lock.agentId === currentAgentId) {
      // 可重入：延长 TTL
      await extendLock(taskId, ttl);
      return {
        success: true,
        key,
        acquireTime: existingLock.lock.acquiredAt,
        reentrant: true
      };
    }
    
    // 原子操作：只在 key 不存在时设置
    const result = await redis.set(
      key,
      JSON.stringify({
        ...lockData,
        acquiredAt: Date.now()
      }),
      'NX',  // 只在 key 不存在时设置
      'PX', ttl  // 过期时间（毫秒）
    );
    
    return {
      success: result === 'OK',
      key,
      acquireTime: Date.now(),
      reentrant: false
    };
  } catch (error) {
    console.error('[RedisPool] 创建锁失败:', error.message);
    throw error;
  }
}

/**
 * 释放任务锁
 * 
 * @param {string} taskId - 任务 ID
 * @param {string} agentId - Agent ID（验证所有者）
 * @param {string} sessionId - 会话 ID（验证所有者）
 */
async function releaseLock(taskId, agentId, sessionId) {
  const redis = initPool();
  const key = `task:lock:${taskId}`;
  
  try {
    // 获取锁信息
    const lockInfo = await getLockInfo(taskId);
    
    // 检查锁是否存在
    if (!lockInfo.lock) {
      return {
        success: true,
        reason: 'no_lock'
      };
    }
    
    // 验证锁的所有者
    if (agentId && lockInfo.lock.agentId !== agentId) {
      return {
        success: false,
        reason: 'not_owner',
        currentOwner: lockInfo.lock.agentId
      };
    }
    
    if (sessionId && lockInfo.lock.sessionId !== sessionId) {
      return {
        success: false,
        reason: 'session_mismatch',
        currentSession: lockInfo.lock.sessionId
      };
    }
    
    // 释放锁
    const result = await redis.del(key);
    return {
      success: result === 1,
      key
    };
  } catch (error) {
    console.error('[RedisPool] 释放锁失败:', error.message);
    throw error;
  }
}

/**
 * 延长锁过期时间
 * 
 * @param {string} taskId - 任务 ID
 * @param {number} ttl - 新的过期时间（毫秒）
 */
async function extendLock(taskId, ttl = 600000) {
  const redis = initPool();
  const key = `task:lock:${taskId}`;
  
  try {
    const result = await redis.pexpire(key, ttl);
    return {
      success: result === 1,
      key,
      ttl
    };
  } catch (error) {
    console.error('[RedisPool] 延长锁过期时间失败:', error.message);
    throw error;
  }
}

/**
 * 检查锁是否存在
 * 
 * @param {string} taskId - 任务 ID
 */
async function checkLock(taskId) {
  const redis = initPool();
  const key = `task:lock:${taskId}`;
  
  try {
    const exists = await redis.exists(key);
    return {
      exists: exists === 1,
      key
    };
  } catch (error) {
    console.error('[RedisPool] 检查锁失败:', error.message);
    throw error;
  }
}

/**
 * 获取锁信息
 * 
 * @param {string} taskId - 任务 ID
 */
async function getLockInfo(taskId) {
  const redis = initPool();
  const key = `task:lock:${taskId}`;
  
  try {
    const value = await redis.get(key);
    return {
      key,
      lock: value ? JSON.parse(value) : null
    };
  } catch (error) {
    console.error('[RedisPool] 获取锁信息失败:', error.message);
    throw error;
  }
}

/**
 * 添加消息去重记录
 * 
 * @param {string} messageHash - 消息hash
 * @param {number} ttl - 过期时间（秒） 默认5分钟
 */
async function addMessageDedupe(messageHash, ttl = 300) {
  const redis = initPool();
  const key = `msg:dedup:${messageHash}`;
  
  try {
    const result = await redis.set(
      key,
      JSON.stringify({
        processedAt: Date.now()
      }),
      'NX',
      'EX', ttl
    );
    
    return {
      success: result === 'OK',
      key
    };
  } catch (error) {
    console.error('[RedisPool] 添加消息去重记录失败:', error.message);
    throw error;
  }
}

/**
 * 检查消息是否已处理
 * 
 * @param {string} messageHash - 消息hash
 */
async function checkMessageDedupe(messageHash) {
  const redis = initPool();
  const key = `msg:dedup:${messageHash}`;
  
  try {
    const exists = await redis.exists(key);
    return {
      isDeduped: exists === 1,
      key
    };
  } catch (error) {
    console.error('[RedisPool] 检查消息去重失败:', error.message);
    throw error;
  }
}

/**
 * 关闭连接池（优雅关闭）
 */
async function closePool() {
  if (redisPool) {
    console.log('[RedisPool] 正在关闭 Redis 连接池...');
    
    try {
      // 等待所有命令执行完毕
      await redisPool.quit();
      console.log('[RedisPool] Redis 连接池已关闭');
    } catch (error) {
      console.error('[RedisPool] 关闭连接池失败:', error.message);
    } finally {
      redisPool = null;
    }
  }
}

/**
 * 导出模块
 */
module.exports = {
  // 初始化
  initPool,
  
  // 连接管理
  createConnection,
  closePool,
  
  // 健康检查
  checkConnection,
  startHealthCheck,
  
  // 任务锁操作
  createLock,
  releaseLock,
  extendLock,
  checkLock,
  getLockInfo,
  
  // 消息去重
  addMessageDedupe,
  checkMessageDedupe,
  
  // 获取配置
  getConfig: () => config,
  
  // 获取连接池实例
  getPool: () => redisPool
};

// 导出 Redis 类供其他模块使用
module.exports.Redis = Redis;
