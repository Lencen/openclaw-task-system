/**
 * Redis 模块入口
 * 
 * @version 2.0.0
 * @created 2026-03-27
 * @updated 2026-03-28 - 添加 Redis 任务队列
 */

// 导出连接池
const RedisPool = require('./redis-pool');

// 导出工具函数
const LockManager = require('./lock-manager');
const DedupManager = require('./dedup-manager');
const TaskDedupManager = require('./task-dedup-manager');

// 导出任务队列
const TaskQueue = require('./task-queue');

// 导出 P0 修复项
const CircuitBreaker = require('./circuit-breaker').CircuitBreaker;
const circuitBreakerManager = require('./circuit-breaker').breakerManager;
const FallbackManager = require('./fallback-manager');
const { classifyError, executeWithRetry } = require('./lock-manager');

module.exports = {
  // 连接池
  ...RedisPool,
  
  // 锁管理器
  LockManager,
  
  // 去重管理器
  DedupManager,
  
  // Redis 类
  Redis: RedisPool.Redis,
  
  // 任务去重管理器
  TaskDedupManager,
  
  // 消息去重管理器（别名）
  MessageDedupManager: DedupManager,
  
  // 任务队列
  TaskQueue,
  TaskQueueRedis: TaskQueue.RedisQueue,
  TaskQueueSQLite: TaskQueue.SQLiteQueue,
  TaskQueueFile: TaskQueue.FileQueue,
  
  // P0 修复项
  CircuitBreaker,
  circuitBreakerManager,
  FallbackManager,
  
  // 导出工具函数
  classifyError,
  executeWithRetry,
  
  // 导出状态检查
  getQueueStats: TaskQueue.getQueueStats
};
