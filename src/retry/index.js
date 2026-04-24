/**
 * V6 重试策略组件 - 主入口
 * 
 * 包含：
 * 1. 熔断器 (Circuit Breaker)
 * 2. 重试策略 (Retry Strategy)
 * 3. 重试执行器 (Retry Executor)
 * 4. 任务执行器 (Task Executor)
 * 
 * @version 1.0.0
 * @created 2026-03-27
 */

const { CircuitBreaker, CircuitState, getCircuitBreaker } = require('./circuit-breaker');
const { 
  classifyError, 
  categorizeError, 
  calculateRetryDelay, 
  getRetryConfig,
  shouldRetry,
  sleep,
  formatError,
  ErrorType,
  DEFAULT_RETRY_CONFIG,
  RETRY_CONFIG_BY_TYPE,
  RETRY_CONFIG_BY_ERROR
} = require('./retry-strategy');
const { RetryExecutor, retryExecutor, EXECUTIONS_DIR } = require('./retry-executor');
const { TaskExecutor, taskExecutor } = require('./task-executor');

// 导出所有模块
module.exports = {
  // 熔断器
  CircuitBreaker,
  CircuitState,
  getCircuitBreaker,
  
  // 重试策略
  classifyError,
  categorizeError,
  calculateRetryDelay,
  getRetryConfig,
  shouldRetry,
  sleep,
  formatError,
  ErrorType,
  DEFAULT_RETRY_CONFIG,
  RETRY_CONFIG_BY_TYPE,
  RETRY_CONFIG_BY_ERROR,
  
  // 重试执行器
  RetryExecutor,
  retryExecutor,
  EXECUTIONS_DIR,
  
  // 任务执行器
  TaskExecutor,
  taskExecutor
};

// 默认导出重试执行器
module.exports.default = retryExecutor;
