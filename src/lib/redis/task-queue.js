/**
 * Redis 任务队列管理器
 * 
 * 功能：
 * 1. Redis 队列作为消息队列（主模式）
 * 2. SQLite 队列为降级模式（Redis 不可用时）
 * 3. 文件轮询为最终兜底（降级模式也不可用时）
 * 
 * 实现三层兜底策略：
 * 联邦通信 → Redis 队列 → SQLite 队列 → 文件轮询
 * 
 * @version 2.0.0
 * @created 2026-03-28
 * @updated 2026-03-28 - 实现 Redis 任务队列
 */

const RedisPool = require('./redis-pool');
const SQLitePool = require('./sqlite-pool');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 队列配置
const QUEUE_CONFIG = {
  // Redis 队列键名
  redisQueueKey: 'task:queue:pending',
  redisProcessedKey: 'task:queue:processed',
  redisErrorKey: 'task:queue:error',
  
  // SQLite 表名
  sqliteTable: 'task_queue',
  
  // 文件队列路径
  fileQueuePath: path.join(__dirname, '../../data/task-queue.jsonl'),
  
  // 降级配置
  degradeThreshold: 3,  // 连续失败次数阈值
  maxRetries: 3         // 最多重试次数
};

// 缓存状态
let redisFailureCount = 0;
let isRedisAvailable = true;

/**
 * 获取 Redis 实例
 */
function getRedis() {
  try {
    return RedisPool.initPool();
  } catch (error) {
    console.error('[TaskQueue] 获取 Redis 实例失败:', error.message);
    return null;
  }
}

/**
 * 获取 SQLite 实例
 */
function getSQLite() {
  try {
    return SQLitePool.getInstance();
  } catch (error) {
    console.error('[TaskQueue] 获取 SQLite 实例失败:', error.message);
    return null;
  }
}

/**
 * 检查 Redis 连接状态
 */
async function checkRedisHealthy() {
  try {
    const redis = getRedis();
    if (!redis) {
      return false;
    }
    
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('[TaskQueue] Redis 健康检查失败:', error.message);
    return false;
  }
}

/**
 * 记录 Redis 失败
 */
function recordRedisFailure() {
  redisFailureCount++;
  
  if (redisFailureCount >= QUEUE_CONFIG.degradeThreshold) {
    isRedisAvailable = false;
    console.warn('[TaskQueue] Redis 连续失败，切换到降级模式');
  }
}

/**
 * 重置 Redis 失败计数
 */
function resetRedisFailure() {
  redisFailureCount = 0;
  if (!isRedisAvailable) {
    isRedisAvailable = true;
    console.log('[TaskQueue] Redis 恢复可用，切换回主模式');
  }
}

/**
 * Redis 队列操作
 */
const RedisQueue = {
  /**
   * 入队（Redis 模式）
   */
  async push(task) {
    const redis = getRedis();
    if (!redis) {
      throw new Error('Redis 未初始化');
    }
    
    const queueItem = {
      id: uuidv4(),
      taskId: task.id,
      agentType: task.agentType,
      priority: task.priority || 'P2',
      payload: {
        title: task.title,
        description: task.description || task.user_description || '',
        user_description: task.user_description
      },
      createdAt: Date.now(),
      status: 'pending',
      retries: 0
    };
    
    // 使用 RPUSH 添加到队列末尾
    const result = await redis.rpush(QUEUE_CONFIG.redisQueueKey, JSON.stringify(queueItem));
    
    return queueItem;
  },
  
  /**
   * 出队（Redis 模式）
   * 
   * @param {number} timeout - 阻塞超时时间（秒），0 表示非阻塞
   */
  async pop(timeout = 0) {
    const redis = getRedis();
    if (!redis) {
      throw new Error('Redis 未初始化');
    }
    
    if (timeout > 0) {
      // 阻塞弹出（BRPOP）
      const result = await redis.brpop(QUEUE_CONFIG.redisQueueKey, timeout);
      if (result) {
        const [, itemJson] = result;
        return JSON.parse(itemJson);
      }
      return null;
    } else {
      // 非阻塞弹出（LPOP）
      const itemJson = await redis.lpop(QUEUE_CONFIG.redisQueueKey);
      return itemJson ? JSON.parse(itemJson) : null;
    }
  },
  
  /**
   * 查看队列长度
   */
  async length() {
    const redis = getRedis();
    if (!redis) {
      return 0;
    }
    
    try {
      return await redis.llen(QUEUE_CONFIG.redisQueueKey);
    } catch (error) {
      return 0;
    }
  },
  
  /**
   * 清空队列
   */
  async clear() {
    const redis = getRedis();
    if (!redis) {
      return;
    }
    
    await redis.del(QUEUE_CONFIG.redisQueueKey);
  },
  
  /**
   * 移动到已处理队列
   */
  async moveToProcessed(queueItem, result) {
    const redis = getRedis();
    if (!redis) {
      return;
    }
    
    queueItem.status = 'processed';
    queueItem.result = result;
    queueItem.processedAt = Date.now();
    
    await redis.rpush(QUEUE_CONFIG.redisProcessedKey, JSON.stringify(queueItem));
  },
  
  /**
   * 移动到错误队列
   */
  async moveToError(queueItem, error) {
    const redis = getRedis();
    if (!redis) {
      return;
    }
    
    queueItem.status = 'error';
    queueItem.error = error.message || 'Unknown error';
    queueItem.errorAt = Date.now();
    
    await redis.rpush(QUEUE_CONFIG.redisErrorKey, JSON.stringify(queueItem));
  },
  
  /**
   * 查看错误队列
   */
  async getErrorQueue(start = 0, end = -1) {
    const redis = getRedis();
    if (!redis) {
      return [];
    }
    
    const items = await redis.lrange(QUEUE_CONFIG.redisErrorKey, start, end);
    return items.map(item => JSON.parse(item));
  }
};

/**
 * SQLite 队列操作（降级模式）
 */
const SQLiteQueue = {
  /**
   * 初始化表
   */
  async initTable() {
    const sqlite = getSQLite();
    if (!sqlite) {
      throw new Error('SQLite 未初始化');
    }
    
    const table = QUEUE_CONFIG.sqliteTable;
    
    // 创建表
    await sqlite.run(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        agentType TEXT,
        priority TEXT DEFAULT 'P2',
        payload TEXT,
        status TEXT DEFAULT 'pending',
        retries INTEGER DEFAULT 0,
        createdAt INTEGER,
        processedAt INTEGER,
        error TEXT,
        INDEX idx_taskId (taskId),
        INDEX idx_status (status),
        INDEX idx_priority (priority)
      )
    `);
  },
  
  /**
   * 入队（SQLite 模式）
   */
  async push(task) {
    const sqlite = getSQLite();
    if (!sqlite) {
      throw new Error('SQLite 未初始化');
    }
    
    const itemId = uuidv4();
    const queueItem = {
      id: itemId,
      taskId: task.id,
      agentType: task.agentType,
      priority: task.priority || 'P2',
      payload: JSON.stringify({
        title: task.title,
        description: task.description || task.user_description || '',
        user_description: task.user_description
      }),
      createdAt: Date.now(),
      status: 'pending',
      retries: 0
    };
    
    // 插入记录
    await sqlite.run(
      `INSERT INTO ${QUEUE_CONFIG.sqliteTable} 
       (id, taskId, agentType, priority, payload, status, createdAt, retries) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [itemId, task.id, task.agentType, queueItem.priority, queueItem.payload, 'pending', queueItem.createdAt, 0]
    );
    
    return queueItem;
  },
  
  /**
   * 出队（SQLite 模式）
   * 
   * @param {boolean} blocking - 是否阻塞（模拟）
   */
  async pop(blocking = false) {
    const sqlite = getSQLite();
    if (!sqlite) {
      throw new Error('SQLite 未初始化');
    }
    
    // 过滤出最早的一条待处理任务
    const rows = await sqlite.all(
      `SELECT * FROM ${QUEUE_CONFIG.sqliteTable} 
       WHERE status = 'pending' 
       ORDER BY createdAt ASC 
       LIMIT 1`
    );
    
    if (rows.length === 0) {
      return null;
    }
    
    const item = rows[0];
    
    // 更新状态为处理中
    await sqlite.run(
      `UPDATE ${QUEUE_CONFIG.sqliteTable} SET status = 'processing' WHERE id = ?`,
      [item.id]
    );
    
    return {
      id: item.id,
      taskId: item.taskId,
      agentType: item.agentType,
      priority: item.priority,
      payload: JSON.parse(item.payload),
      createdAt: item.createdAt,
      status: item.status
    };
  },
  
  /**
   * 查看队列长度
   */
  async length() {
    const sqlite = getSQLite();
    if (!sqlite) {
      return 0;
    }
    
    const rows = await sqlite.all(
      `SELECT COUNT(*) as count FROM ${QUEUE_CONFIG.sqliteTable} WHERE status = 'pending'`
    );
    
    return rows[0]?.count || 0;
  },
  
  /**
   * 移动到已处理队列
   */
  async moveToProcessed(queueItem, result) {
    const sqlite = getSQLite();
    if (!sqlite) {
      return;
    }
    
    await sqlite.run(
      `UPDATE ${QUEUE_CONFIG.sqliteTable} 
       SET status = 'processed', processedAt = ?, error = ? 
       WHERE id = ?`,
      [Date.now(), null, queueItem.id]
    );
  },
  
  /**
   * 移动到错误队列
   */
  async moveToError(queueItem, error) {
    const sqlite = getSQLite();
    if (!sqlite) {
      return;
    }
    
    await sqlite.run(
      `UPDATE ${QUEUE_CONFIG.sqliteTable} 
       SET status = 'error', error = ?, errorAt = ? 
       WHERE id = ?`,
      [error.message || 'Unknown error', Date.now(), queueItem.id]
    );
  }
};

/**
 * 文件队列操作（最终兜底）
 */
const FileQueue = {
  /**
   * 入队（文件模式）
   */
  async push(task) {
    const queueItem = {
      id: uuidv4(),
      taskId: task.id,
      agentType: task.agentType,
      priority: task.priority || 'P2',
      payload: {
        title: task.title,
        description: task.description || task.user_description || ''
      },
      createdAt: Date.now(),
      status: 'pending',
      retries: 0
    };
    
    try {
      // 追加写入文件
      fs.appendFileSync(QUEUE_CONFIG.fileQueuePath, JSON.stringify(queueItem) + '\n', 'utf8');
      return queueItem;
    } catch (error) {
      console.error('[FileQueue] 写入失败:', error.message);
      throw error;
    }
  },
  
  /**
   * 出队（文件模式）
   */
  async pop() {
    try {
      if (!fs.existsSync(QUEUE_CONFIG.fileQueuePath)) {
        return null;
      }
      
      const content = fs.readFileSync(QUEUE_CONFIG.fileQueuePath, 'utf8').trim();
      if (!content) {
        return null;
      }
      
      const lines = content.split('\n');
      if (lines.length === 0) {
        return null;
      }
      
      // 取第一条
      const firstLine = lines[0];
      const item = JSON.parse(firstLine);
      
      // 从文件中移除（重写文件）
      if (lines.length > 1) {
        const remaining = lines.slice(1).join('\n');
        fs.writeFileSync(QUEUE_CONFIG.fileQueuePath, remaining + '\n', 'utf8');
      } else {
        fs.writeFileSync(QUEUE_CONFIG.fileQueuePath, '', 'utf8');
      }
      
      return item;
    } catch (error) {
      console.error('[FileQueue] 读取失败:', error.message);
      return null;
    }
  },
  
  /**
   * 查看队列长度
   */
  async length() {
    try {
      if (!fs.existsSync(QUEUE_CONFIG.fileQueuePath)) {
        return 0;
      }
      
      const content = fs.readFileSync(QUEUE_CONFIG.fileQueuePath, 'utf8').trim();
      if (!content) {
        return 0;
      }
      
      return content.split('\n').length;
    } catch (error) {
      return 0;
    }
  }
};

/**
 * 统一队列接口（优化版）
 */
const TaskQueue = {
  /**
   * 入队（自动选择最佳模式）
   */
  async push(task) {
    try {
      // 尝试 Redis（主模式）
      if (isRedisAvailable && await checkRedisHealthy()) {
        resetRedisFailure();
        return await RedisQueue.push(task);
      }
      
      // 降级到 SQLite
      const sqlite = getSQLite();
      if (sqlite) {
        recordRedisFailure();
        await SQLiteQueue.initTable();
        return await SQLiteQueue.push(task);
      }
      
      // 最终兜底：文件
      recordRedisFailure();
      return await FileQueue.push(task);
    } catch (error) {
      console.error('[TaskQueue] 入队失败:', error.message);
      
      // 兜底：直接写文件
      return await FileQueue.push(task);
    }
  },
  
  /**
   * 出队（自动选择最佳模式）
   */
  async pop(options = {}) {
    const { timeout = 0 } = options;
    
    try {
      // 尝试 Redis（主模式）
      if (isRedisAvailable && await checkRedisHealthy()) {
        resetRedisFailure();
        return await RedisQueue.pop(timeout);
      }
      
      // 降级到 SQLite
      const sqlite = getSQLite();
      if (sqlite) {
        recordRedisFailure();
        await SQLiteQueue.initTable();
        return await SQLiteQueue.pop();
      }
      
      // 最终兜底：文件
      recordRedisFailure();
      return await FileQueue.pop();
    } catch (error) {
      console.error('[TaskQueue] 出队失败:', error.message);
      
      // 兜底：直接读文件
      return await FileQueue.pop();
    }
  },
  
  /**
   * 查看队列长度
   */
  async length() {
    try {
      if (isRedisAvailable && await checkRedisHealthy()) {
        resetRedisFailure();
        return await RedisQueue.length();
      }
      
      const sqlite = getSQLite();
      if (sqlite) {
        recordRedisFailure();
        await SQLiteQueue.initTable();
        return await SQLiteQueue.length();
      }
      
      recordRedisFailure();
      return await FileQueue.length();
    } catch (error) {
      return await FileQueue.length();
    }
  },
  
  /**
   * 移动到已处理队列
   */
  async moveToProcessed(queueItem, result) {
    try {
      if (isRedisAvailable && await checkRedisHealthy()) {
        resetRedisFailure();
        return await RedisQueue.moveToProcessed(queueItem, result);
      }
      
      const sqlite = getSQLite();
      if (sqlite) {
        recordRedisFailure();
        await SQLiteQueue.initTable();
        return await SQLiteQueue.moveToProcessed(queueItem, result);
      }
    } catch (error) {
      console.error('[TaskQueue] 移动到已处理队列失败:', error.message);
    }
  },
  
  /**
   * 移动到错误队列
   */
  async moveToError(queueItem, error) {
    try {
      if (isRedisAvailable && await checkRedisHealthy()) {
        resetRedisFailure();
        return await RedisQueue.moveToError(queueItem, error);
      }
      
      const sqlite = getSQLite();
      if (sqlite) {
        recordRedisFailure();
        await SQLiteQueue.initTable();
        return await SQLiteQueue.moveToError(queueItem, error);
      }
    } catch (error) {
      console.error('[TaskQueue] 移动到错误队列失败:', error.message);
    }
  },
  
  /**
   * 检查是否可用
   */
  async checkAvailable() {
    if (isRedisAvailable && await checkRedisHealthy()) {
      return 'redis';
    }
    
    const sqlite = getSQLite();
    if (sqlite) {
      return 'sqlite';
    }
    
    return 'file';
  },
  
  /**
   * 清空队列
   */
  async clear() {
    try {
      if (isRedisAvailable && await checkRedisHealthy()) {
        resetRedisFailure();
        return await RedisQueue.clear();
      }
    } catch (error) {
      console.error('[TaskQueue] 清空队列失败:', error.message);
    }
  }
};

/**
 * 获取队列统计信息
 */
async function getQueueStats() {
  return {
    redis: {
      available: isRedisAvailable && await checkRedisHealthy(),
      length: isRedisAvailable ? await RedisQueue.length() : null
    },
    sqlite: {
      available: !!getSQLite(),
      length: getSQLite() ? await SQLiteQueue.length() : null
    },
    file: {
      exists: fs.existsSync(QUEUE_CONFIG.fileQueuePath),
      length: await FileQueue.length()
    },
    currentMode: await TaskQueue.checkAvailable()
  };
}

/**
 * 优雅关闭
 */
async function close() {
  RedisPool.closePool();
}

/**
 * 导出模块
 */
module.exports = {
  TaskQueue,
  RedisQueue,
  SQLiteQueue,
  FileQueue,
  getQueueStats,
  close,
  
  // 配置
  QUEUE_CONFIG,
  
  // 状态查询
  getStatus: () => ({
    isRedisAvailable,
    redisFailureCount
  })
};
