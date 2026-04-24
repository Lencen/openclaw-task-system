/**
 * 重试策略实现 - V6 重试策略组件
 * 
 * 功能：
 * 1. 指数退避重试延迟计算
 * 2. 根据任务类型和错误类型配置重试策略
 * 3. 判断是否应该重试
 * 
 * @version 1.0.0
 * @created 2026-03-27
 */

// 默认重试配置
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,      // 首次重试延迟 1 秒
  maxDelay: 60000,         // 最大延迟 1 分钟
  backoffMultiplier: 2,    // 指数退避系数
  jitter: 0.1,             // 抖动系数（10%）
  retryableErrors: [
    'timeout',
    'network_error',
    'agent_unavailable',
    'rate_limit',
    'temporary_failure',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED'
  ]
};

// 按任务类型的重试策略
const RETRY_CONFIG_BY_TYPE = {
  bug_fix: {
    maxRetries: 5,
    initialDelay: 5000,
    maxDelay: 300000  // 5 分钟
  },
  feature: {
    maxRetries: 2,
    initialDelay: 2000,
    maxDelay: 60000
  },
  test: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000
  },
  deployment: {
    maxRetries: 4,
    initialDelay: 15000,
    maxDelay: 120000
  }
};

// 按错误类型的重试策略
const RETRY_CONFIG_BY_ERROR = {
  rate_limit: {
    maxRetries: 5,
    initialDelay: 60000,  // 限流时等待 1 分钟
    maxDelay: 600000
  },
  agent_unavailable: {
    maxRetries: 3,
    initialDelay: 30000,  // Agent 不可用时等待 30 秒
    maxDelay: 180000
  }
};

/**
 * 错误分类
 */
const ErrorType = {
  RETRYABLE: 'retryable',
  NON_RETRYABLE: 'non_retryable',
  MANUAL_REQUIRED: 'manual_required'
};

/**
 * 分类错误
 */
function classifyError(error) {
  const errorMessage = (error.message || '').toLowerCase();
  const errorCode = (error.code || '').toLowerCase();

  // 先检查错误代码（更准确）
  if (errorCode.includes('etimedout')) return 'timeout';
  if (errorCode.includes('econnreset')) return 'network_error';
  if (errorCode.includes('econnrefused')) return 'network_error';
  if (errorCode.includes('erate_limit') || errorCode.includes('etoomanyrequests')) return 'rate_limit';
  if (errorCode.includes('econnaborted')) return 'network_error';
  if (errorCode.includes('enotfound') || errorCode.includes('e404')) return 'resource_not_found';
  if (errorCode.includes('e403') || errorCode.includes('eperm')) return 'permission_denied';
  if (errorCode.includes('e400')) return 'invalid_input';
  
  // 再检查错误消息
  const retryablePatterns = [
    { key: 'timeout', patterns: ['timeout', 'timed out', 'gateway timeout', 'upstream timeout'] },
    { key: 'network_error', patterns: ['network error', 'connection reset', 'connection refused', 'network unreachable'] },
    { key: 'rate_limit', patterns: ['rate limit', 'too many requests'] },
    { key: 'temporary_failure', patterns: ['temporary failure', 'service unavailable', 'gateway error'] }
  ];

  for (const { key, patterns } of retryablePatterns) {
    for (const pattern of patterns) {
      if (errorMessage.includes(pattern)) {
        return key;
      }
    }
  }

  // 检查是否是不可重试错误
  const nonRetryablePatterns = [
    { key: 'validation_error', patterns: ['validation error', 'invalid input', 'bad request'] },
    { key: 'permission_denied', patterns: ['permission denied', 'forbidden', 'unauthorized'] },
    { key: 'resource_not_found', patterns: ['not found', '404', 'no such resource'] },
    { key: 'business_error', patterns: ['business error', 'invalid parameter', 'missing required field'] }
  ];

  for (const { key, patterns } of nonRetryablePatterns) {
    for (const pattern of patterns) {
      if (errorMessage.includes(pattern)) {
        return key;
      }
    }
  }

  return 'unknown';
}

/**
 * 获取错误分类
 */
function categorizeError(errorType) {
  const retryableErrors = [
    'timeout', 'network_error', 'agent_unavailable', 
    'rate_limit', 'temporary_failure', 'etimedout',
    'econnreset', 'econnrefused'
  ];

  const manualErrors = [
    'validation_error', 'permission_denied', 'resource_not_found',
    'invalid_input', 'business_error', 'not found', 'forbidden',
    'unauthorized', 'bad request'
  ];

  if (retryableErrors.includes(errorType)) return ErrorType.RETRYABLE;
  if (manualErrors.includes(errorType)) return ErrorType.NON_RETRYABLE;
  return ErrorType.MANUAL_REQUIRED;
}

/**
 * 计算重试延迟（指数退避 + 抖动）
 */
function calculateRetryDelay(retryCount, config) {
  const baseDelay = config.initialDelay * Math.pow(config.backoffMultiplier, retryCount);
  const cappedDelay = Math.min(baseDelay, config.maxDelay);
  
  // 添加抖动（避免同时重试）
  const jitter = config.jitter || 0.1;
  const randomJitter = Math.random() * jitter * cappedDelay;
  
  return Math.floor(cappedDelay + randomJitter);
}

/**
 * 获取重试配置
 */
function getRetryConfig(taskType, errorType) {
  // 1. 首先检查错误类型专用配置
  if (errorType && RETRY_CONFIG_BY_ERROR[errorType]) {
    return { ...DEFAULT_RETRY_CONFIG, ...RETRY_CONFIG_BY_ERROR[errorType] };
  }

  // 2. 然后检查任务类型专用配置
  if (taskType && RETRY_CONFIG_BY_TYPE[taskType]) {
    return { ...DEFAULT_RETRY_CONFIG, ...RETRY_CONFIG_BY_TYPE[taskType] };
  }

  // 3. 使用默认配置
  return DEFAULT_RETRY_CONFIG;
}

/**
 * 判断是否应该重试
 */
async function shouldRetry(task, error) {
  // 1. 获取配置
  const config = getRetryConfig(task.type, classifyError(error));
  
  // 2. 检查重试次数
  const retryCount = task.retryCount || 0;
  
  if (retryCount >= config.maxRetries) {
    return { 
      shouldRetry: false, 
      reason: 'max_retries_exceeded',
      retryCount,
      maxRetries: config.maxRetries
    };
  }

  // 3. 检查错误类型
  const errorType = classifyError(error);
  const errorCategory = categorizeError(errorType);
  
  if (errorCategory === ErrorType.MANUAL_REQUIRED) {
    return { 
      shouldRetry: false, 
      reason: 'requires_manual_intervention',
      errorType,
      errorCategory
    };
  }

  if (errorCategory === ErrorType.NON_RETRYABLE) {
    return { 
      shouldRetry: false, 
      reason: 'non_retryable_error',
      errorType,
      errorCategory
    };
  }

  // 4. 计算重试延迟
  const delay = calculateRetryDelay(retryCount, config);

  return { 
    shouldRetry: true, 
    delay,
    retryCount: retryCount + 1,
    errorType,
    errorCategory,
    config: {
      maxRetries: config.maxRetries,
      initialDelay: config.initialDelay,
      maxDelay: config.maxDelay
    }
  };
}

/**
 * 执行重试睡眠
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 格式化错误信息
 */
function formatError(error) {
  return {
    message: error.message,
    code: error.code,
    stack: error.stack,
    timestamp: new Date().toISOString()
  };
}

// 导出
module.exports = {
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
};
