# V6 重试策略组件使用指南

## 概述

V6 重试策略组件提供了一套完整的任务重试和熔断机制，包括：

- **熔断器 (Circuit Breaker)**: 自动检测失败次数，达到阈值后拒绝执行，1分钟后进入半开状态尝试恢复
- **重试策略 (Retry Strategy)**: 指数退避重试延迟，支持多种错误类型智能重试
- **重试执行器 (Retry Executor)**: 封装重试和熔断逻辑，集成到任务执行流程
- **任务执行器 (Task Executor)**: 高层任务执行接口，支持步骤执行和动作分发

## 组件结构

```
task-system-v2/src/retry/
├── circuit-breaker.js    # 熔断器实现
├── retry-strategy.js     # 重试策略实现
├── retry-executor.js     # 重试执行器实现
├── task-executor.js      # 任务执行器实现
├── index.js              # 主入口
└── README.md             # 本文档
```

## 熔断器 (Circuit Breaker)

### 功能特性

- **连续失败检测**: 连续失败 10 次后自动熔断
- **状态機**: closed → open → half-open
- **半开恢复**: 1分钟后自动进入半开状态尝试恢复
- **文件持久化**: 状态保存在 `data/task-executions/` 目录

### 使用示例

```javascript
const { CircuitBreaker, CircuitState, getCircuitBreaker } = require('./retry');

// 创建熔断器实例
const breaker = getCircuitBreaker('task-123');

// 加载状态
await breaker.load();

// 检查是否允许执行
const result = await breaker.allowExecute();
if (!result.allowed) {
  console.log(`熔断器开启，${result.retryAfter}s 后重试`);
}

// 记录成功
await breaker.recordSuccess();

// 记录失败
await breaker.recordFailure(new Error('Task failed'));

// 获取状态
const status = await breaker.getState();
console.log(status);

// 重置熔断器
await breaker.reset();
```

## 重试策略 (Retry Strategy)

### 功能特性

- **智能错误分类**: 区分可重试、不可重试、需要人工干预的错误
- **指数退避延迟**: `delay = initialDelay * (backoffMultiplier ^ retryCount)`
- **抖动机制**: 避免大量重试同时发生
- **任务类型配置**: 不同任务类型有不同重试策略
- **错误类型配置**: 不同错误类型有不同重试策略

### 使用示例

```javascript
const { 
  classifyError, 
  categorizeError, 
  shouldRetry, 
  calculateRetryDelay 
} = require('./retry');

// 分类错误
const errorType = classifyError(new Error('Request timeout'));
console.log(errorType); // 'timeout'

// 判断是否应该重试
const should = await shouldRetry(task, error);
if (should.shouldRetry) {
  console.log(`将在 ${should.delay}ms 后重试`);
}

// 计算重试延迟
const delay = calculateRetryDelay(2, { 
  initialDelay: 1000, 
  backoffMultiplier: 2, 
  maxDelay: 60000 
});
console.log(delay); // ~4000ms
```

### 默认配置

```javascript
DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,      // 首次重试延迟 1 秒
  maxDelay: 60000,         // 最大延迟 1 分钟
  backoffMultiplier: 2,    // 指数退避系数
  jitter: 0.1              // 抖动系数（10%）
}

RETRY_CONFIG_BY_TYPE = {
  bug_fix: { maxRetries: 5, initialDelay: 5000, maxDelay: 300000 },
  feature: { maxRetries: 2, initialDelay: 2000, maxDelay: 60000 },
  test: { maxRetries: 3, initialDelay: 1000, maxDelay: 30000 },
  deployment: { maxRetries: 4, initialDelay: 15000, maxDelay: 120000 }
}
```

## 重试执行器 (Retry Executor)

### 功能特性

- **自动重试**: 自动处理重试逻辑
- **熔断器集成**: 集成熔断器检查
- **执行记录**: 保存执行记录到文件
- **错误处理**: 完整的错误分类和处理

### 使用示例

```javascript
const { RetryExecutor } = require('./retry');
const executor = new RetryExecutor();

const task = {
  id: 'task-123',
  title: '示例任务',
  type: 'test'
};

const agentId = 'agent-coder';

// 执行任务（带重试和熔断器）
const result = await executor.executeWithRetry(task, agentId, {
  name: '示例任务',
  executeFn: async (task, agentId) => {
    // 这里是你的任务执行逻辑
    await someAsyncOperation();
    return { success: true };
  }
});

console.log(result);
```

## 任务执行器 (Task Executor)

### 功能特性

- **任务执行**: 高层任务执行接口
- **步骤执行**: 支持任务步骤执行
- **动作分发**: 根据动作类型分发到不同处理器
- **内置处理器**: 支持 `read_file`, `write_file`, `run_command`, `api_call`

### 使用示例

```javascript
const { TaskExecutor } = require('./retry');
const executor = new TaskExecutor();

// 执行任务
await executor.executeTask(task, agentId, {
  executeFn: async (task, agentId) => {
    // 自定义处理逻辑
  }
});

// 执行步骤
await executor.executeStep(task, step, agentId);

// 执行具体动作
await executor.executeStepAction(task, step, agentId);
```

### 内置处理器

| 动作类型 | 处理器 | 说明 |
|---------|--------|------|
| `read_file` | `handleReadFile` | 读取文件内容 |
| `write_file` | `handleWriteFile` | 写入文件内容 |
| `run_command` | `handleRunCommand` | 运行 shell 命令 |
| `api_call` | `handleApiCall` | 发起 HTTP API 调用 |
| `default` | `handleDefault` | 默认处理 |

## 自动任务执行器 (Auto Task Executor)

### 功能特性

- **定期检查**: 每 30 秒检查一次待执行任务
- **并发控制**: 最大并发执行数 3
- **队列调度**: 自动调度任务执行队列
- **状态监控**: 实时监控执行状态

### 使用示例

```javascript
const { autoTaskExecutor } = require('./autotask');

// 启动自动执行器
autoTaskExecutor.start();

// 停止自动执行器
autoTaskExecutor.stop();

// 获取执行器状态
const status = autoTaskExecutor.getStatus();
console.log(status);
```

## API 端点

### POST /api/tasks/:id/execute

执行任务（带重试和熔断器）

**请求体**:
```json
{
  "agentId": "agent-coder"
}
```

**响应**:
```json
{
  "success": true,
  "executionId": "task-123-1774625000000",
  "status": "completed",
  "result": {...},
  "attempts": 2,
  "totalRetries": 3
}
```

### GET /api/tasks/:id/execution-status

获取任务执行状态和熔断器状态

**响应**:
```json
{
  "success": true,
  "taskId": "task-123",
  "circuitBreaker": {
    "state": "closed",
    "failureCount": 0
  },
  "executions": [...]
}
```

### POST /api/tasks/:id/reset-circuit-breaker

重置任务的熔断器

**响应**:
```json
{
  "success": true,
  "message": "熔断器已重置",
  "taskId": "task-123"
}
```

## 数据存储

执行记录保存在 `data/task-executions/` 目录：

```
data/task-executions/
├── {taskId}.json                  # 熔断器数据
├── executions.json                # 执行记录列表
└── {executionId}.json             # 单次执行记录
```

## 配置

可以通过环境变量或代码修改配置：

```javascript
// 熔断器配置
const BREAKER_DIR = path.join(__dirname, '../../../data/task-executions');
const MAX_FAILURES = 10;           // 连续失败 10 次后熔断
const HALF_OPEN_TIMEOUT = 60000;   // 1 分钟后半开状态尝试恢复

// 重试策略配置
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 60000,
  backoffMultiplier: 2,
  jitter: 0.1
};
```

## 测试

```bash
# 运行重试执行器测试
cd task-system-v2
node test/retry-executor.test.js
```

## 注意事项

1. **熔断器阈值**: 连续失败 10 次后熔断，可根据实际情况调整
2. **半开时间**: 1 分钟后进入半开状态，可根据服务恢复时间调整
3. **重试延迟**: 指数退避避免雪崩，最小 1 秒，最大 1 分钟
4. **错误分类**: 正确分类错误类型，确保可重试错误能被正确识别
5. **执行记录**: 定期清理旧的执行记录，避免磁盘占用

## 故障排查

### 问题：熔断器没有正确触发

**可能原因**:
- 错误类型没有正确分类
- 失败计数没有正确更新

**解决方案**:
- 检查 `classifyError` 函数
- 检查 `recordFailure` 调用

### 问题：重试延迟不符合预期

**可能原因**:
- 配置参数不正确
- 指数退避计算有误

**解决方案**:
- 检查 `calculateRetryDelay` 函数
- 验证配置参数

### 问题：执行记录没有保存

**可能原因**:
- 目录不存在
- 文件写入权限问题

**解决方案**:
- 检查 `data/task-executions/` 目录
- 验证文件系统权限

## 版本历史

### v1.0.0 (2026-03-27)

- 初始版本
- 熔断器实现
- 重试策略实现
- 重试执行器实现
- 任务执行器实现
- 自动任务执行器实现
- API 端点实现
- 单元测试
