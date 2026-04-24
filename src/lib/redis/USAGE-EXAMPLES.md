# Redis 连接池模块使用示例

## 基础使用

### 1. 初始化连接池

```javascript
const RedisPool = require('./lib/redis');

// 初始化连接池
const pool = RedisPool.initPool();
```

### 2. 任务锁使用

```javascript
const lockManager = require('./lib/redis').LockManager;

// 获取任务锁
const result = await lockManager.acquireLock(taskId, {
  agentId: 'coder',
  sessionId: 'xxx-xxx',
  ttl: 600000  // 10 分钟
});

if (!result.success) {
  console.log('无法获取锁，任务可能正在被其他 Agent 执行');
  return;
}

// 任务执行完成，释放锁
await lockManager.releaseLock(taskId, agentId, sessionId);
```

### 3. 消息去重使用

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

### 4. 健康检查

```javascript
// 检查连接状态
const health = RedisPool.checkConnection();

// 启动定时健康检查
const intervalId = RedisPool.startHealthCheck(10000); // 10 秒检查一次

// 停止健康检查
clearInterval(intervalId);
```

### 5. 优雅关闭

```javascript
// 关闭连接池
await RedisPool.closePool();
```

## 完整示例：任务执行流程

```javascript
const lockManager = require('./lib/redis').LockManager;
const dedupManager = require('./lib/redis').DedupManager;

// 任务执行函数
async function executeTask(task) {
  // 1. 消息去重检查
  const dedupResult = await dedupManager.deduplicateTask(task);
  if (dedupResult.isDuplicate) {
    console.log('任务已存在，跳过执行');
    return { skipped: true };
  }

  // 2. 获取任务锁
  const lockResult = await lockManager.acquireLock(task.id, {
    agentId: 'coder',
    sessionId: 'session-123',
    ttl: 600000  // 10 分钟
  });

  if (!lockResult.success) {
    console.log('无法获取任务锁，可能正在被其他 Agent 执行');
    return { success: false, reason: 'cannot_acquire_lock' };
  }

  try {
    // 3. 执行任务
    const result = await doActualTask(task);
    
    // 4. 记录执行
    const executionId = dedupManager.generateExecutionId(task.id, 'coder');
    await dedupManager.recordExecution(executionId, result);
    
    return { success: true, result };
  } catch (error) {
    console.error('任务执行失败:', error);
    throw error;
  } finally {
    // 5. 释放锁
    await lockManager.releaseLock(task.id, 'coder', 'session-123');
  }
}
```

## 配置说明

### redis.json 配置项

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
  }
}
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| host | string | localhost | Redis 服务器地址 |
| port | number | 6379 | Redis 服务器端口 |
| password | string | - | Redis 密码（无密码则为空） |
| db | number | 0 | Redis 数据库编号 |
| maxConnections | number | 10 | 最大连接数 |
| minConnections | number | 2 | 最小连接数 |
| connectionTimeout | number | 5000 | 连接超时时间（毫秒） |
| maxIdleTime | number | 30000 | 连接最大空闲时间（毫秒） |
| queueSize | number | 100 | 请求队列大小 |
| retryStrategy | object | - | 重连策略配置 |

## 任务锁 API

### acquireLock(taskId, options)

获取任务锁

参数：
- `taskId` (string): 任务 ID
- `options` (object): 锁选项
  - `agentId` (string): Agent ID
  - `sessionId` (string): 会话 ID
  - `ttl` (number): 过期时间（毫秒），默认 600000 (10 分钟)

返回：
```javascript
{
  success: true,
  key: "task:lock:task-123",
  acquireTime: 1234567890
}
```

### releaseLock(taskId, agentId, sessionId)

释放任务锁

参数：
- `taskId` (string): 任务 ID
- `agentId` (string): Agent ID
- `sessionId` (string): 会话 ID

返回：
```javascript
{
  success: true,
  reason: "released"  // 或 "no_lock", "not_owner"
}
```

### extendLock(taskId, ttl)

延长锁过期时间

参数：
- `taskId` (string): 任务 ID
- `ttl` (number): 新的过期时间（毫秒），默认 600000

返回：
```javascript
{
  success: true,
  key: "task:lock:task-123",
  ttl: 600000
}
```

## 消息去重 API

### deduplicateMessage(message, window)

消息去重

参数：
- `message` (string): 消息原文
- `window` (number): 去重窗口时间（秒），默认 300 (5 分钟)

返回：
```javascript
{
  isDuplicate: false,
  messageHash: "abc123",
  key: "msg:dedup:abc123"
}
```

### deduplicateTask(task, window)

任务去重

参数：
- `task` (object): 任务数据
- `window` (number): 去重窗口时间（秒），默认 3600 (1 小时)

返回：
```javascript
{
  isDuplicate: false,
  signature: "task-signature-xyz",
  key: "task:dedup:task-signature-xyz"
}
```

## 错误处理

```javascript
try {
  await RedisPool.initPool();
} catch (error) {
  console.error('连接池初始化失败:', error);
}

try {
  const result = await lockManager.acquireLock(taskId, options);
  if (!result.success) {
    console.log('获取锁失败:', result.reason);
  }
} catch (error) {
  console.error('锁操作失败:', error);
}
```

## 监控指标

### 健康检查

```javascript
// 定时检查连接状态
const intervalId = RedisPool.startHealthCheck(10000);

// 监控连接状态
redisPool.on('error', (err) => {
  console.error('[Redis] 连接错误:', err.message);
});

redisPool.on('reconnecting', () => {
  console.log('[Redis] 正在重连...');
});
```
