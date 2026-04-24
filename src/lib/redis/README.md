# Redis 连接池模块

## 概述

This module provides Redis connection pool management with automatic reconnection, health checks, and support for task locking and deduplication.

## 功能特性

- ✅ 连接池配置（最大连接数、超时时间）
- ✅ 自动重连机制（断线后自动重连）
- ✅ 连接健康检查（定时检查）
- ✅ 优雅关闭
- ✅ 任务锁管理
- ✅ 消息去重管理
- ✅ 任务去重管理
- ✅ 执行记录管理

## 目录结构

```
lib/redis/
├── index.js          # 模块入口
├── redis-pool.js     # Redis 连接池核心模块
├── lock-manager.js   # 任务锁管理器
├── dedup-manager.js  # 消息去重管理器
├── redis-pool.test.js  # 单元测试
└── README.md         # 本文档
```

## 使用方法

### 初始化连接池

```javascript
const RedisPool = require('./lib/redis');

// 初始化连接池
const pool = RedisPool.initPool();
```

### 任务锁使用

```javascript
const lockManager = require('./lib/redis').LockManager;

// 获取任务锁
const result = await lockManager.acquireLock(taskId, {
  agentId: 'coder',
  sessionId: 'xxx-xxx',
  ttl: 600000  // 10 分钟
});

// 释放任务锁
await lockManager.releaseLock(taskId, agentId, sessionId);

// 延长锁过期时间
await lockManager.extendLock(taskId, 600000);
```

### 消息去重使用

```javascript
const dedupManager = require('./lib/redis').DedupManager;

// 消息去重
const result = await dedupManager.deduplicateMessage(message);

if (result.isDuplicate) {
  console.log('消息已处理，跳过');
  return;
}

// 任务去重
const taskResult = await dedupManager.deduplicateTask(task);

if (taskResult.isDuplicate) {
  console.log('任务已存在，跳过创建');
  return;
}
```

### 健康检查

```javascript
// 检查连接状态
const health = RedisPool.checkConnection();

// 启动定时健康检查
const intervalId = RedisPool.startHealthCheck(10000); // 10 秒检查一次

// 停止健康检查
clearInterval(intervalId);
```

### 优雅关闭

```javascript
// 关闭连接池
await RedisPool.closePool();
```

## 配置文件

配置文件位置：`config/redis.json`

```json
{
  "host": "localhost",
  "port": 6379,
  "password": "",
  "db": 0,
  "maxConnections": 10,
  "minConnections": 2,
  "connectionTimeout": 5000,
  "maxIdleTime": 30000,
  "queueSize": 100,
  "retryStrategy": {
    "type": "exponential",
    "minDelay": 100,
    "maxDelay": 2000,
    "randomize": true
  },
  "sentinel": {
    "enabled": false,
    "masterName": "mymaster",
    "sentinels": [
      {
        "host": "localhost",
        "port": 26379
      }
    ]
  }
}
```

## API 文档

### RedisPool

| 方法 | 参数 | 说明 |
|------|------|------|
| `initPool()` | 无 | 初始化连接池 |
| `createConnection()` | 无 | 创建新的连接 |
| `closePool()` | 无 | 关闭连接池（优雅关闭） |
| `checkConnection()` | 无 | 检查连接状态 |
| `startHealthCheck(interval)` | `interval: number` | 启动定时健康检查 |
| `createLock(taskId, lockData, ttl)` | `taskId: string`, `lockData: object`, `ttl: number` | 创建任务锁 |
| `releaseLock(taskId)` | `taskId: string` | 释放任务锁 |
| `extendLock(taskId, ttl)` | `taskId: string`, `ttl: number` | 延长锁过期时间 |
| `checkLock(taskId)` | `taskId: string` | 检查锁是否存在 |
| `getLockInfo(taskId)` | `taskId: string` | 获取锁信息 |
| `addMessageDedupe(messageHash, ttl)` | `messageHash: string`, `ttl: number` | 添加消息去重记录 |
| `checkMessageDedupe(messageHash)` | `messageHash: string` | 检查消息是否已去重 |

### LockManager

| 方法 | 参数 | 说明 |
|------|------|------|
| `acquireLock(taskId, options)` | `taskId: string`, `options: { agentId, sessionId, ttl }` | 获取任务锁 |
| `releaseLock(taskId, agentId, sessionId)` | `taskId: string`, `agentId: string`, `sessionId: string` | 释放任务锁 |
| `extendLock(taskId, ttl)` | `taskId: string`, `ttl: number` | 延长锁过期时间 |
| `checkLock(taskId)` | `taskId: string` | 检查锁是否存在 |
| `getLockInfo(taskId)` | `taskId: string` | 获取锁信息 |
| `handleLockExpired(taskId, onExpired)` | `taskId: string`, `onExpired: function` | 处理锁过期 |

### DedupManager

| 方法 | 参数 | 说明 |
|------|------|------|
| `deduplicateMessage(message, window)` | `message: string`, `window: number` | 消息去重 |
| `deduplicateTask(task, window)` | `task: object`, `window: number` | 任务去重 |
| `generateExecutionId(taskId, agentId, attemptNumber)` | `taskId: string`, `agentId: string`, `attemptNumber: number` | 生成执行 ID |
| `recordExecution(executionId, result)` | `executionId: string`, `result: object` | 记录执行结果 |
| `isExecutionCompleted(executionId)` | `executionId: string` | 检查执行是否已完成 |
| `getExecutionRecord(executionId)` | `executionId: string` | 获取执行记录 |

## 单元测试

运行测试：

```bash
cd ~/.openclaw/workspace/task-system-v2
npm test lib/redis/redis-pool.test.js
```

测试覆盖：

- ✅ 连接管理测试
- ✅ 健康检查测试
- ✅ 任务锁测试
- ✅ 消息去重测试
- ✅ 并发锁测试
- ✅ 定时器测试

## 注意事项

1. **连接超时**：建议 `connectionTimeout` 设置为 5000ms 以上，避免网络抖动导致连接失败

2. **重试策略**：使用指数退避重连，最大延迟不超过 2000ms

3. **锁过期时间**：根据任务执行时间合理设置 TTL，建议至少 10 分钟

4. **消息去重窗口**：默认 5 分钟，可根据业务需求调整

5. **执行记录**：永久存储，定期清理过期记录避免占用过多内存

## 维护记录

- v1.0.0 (2026-03-27) - 初始版本，支持连接池、任务锁、消息去重
