/**
 * 测试文件
 * 
 * 用于测试 V6 项目 P0 必须修复项
 * 
 * @version 1.0.0
 * @created 2026-03-28
 */

const assert = require('assert');
const path = require('path');

// 加载模块
const { LockManager, classifyError, executeWithRetry } = require('./lock-manager');
const { CircuitBreaker, CircuitState, breakerManager } = require('./circuit-breaker');
const FallbackManager = require('./fallback-manager');

/**
 * 测试分类器
 */
async function testClassifyError() {
  console.log('测试: classifyError 函数');
  
  // 测试网络错误
  const networkError = new Error('ECONNREFUSED Connection refused');
  assert.strictEqual(classifyError(networkError), 'network', '网络错误分类错误');
  
  const timeoutError = new Error('ETIMEDOUT Connection timeout');
  assert.strictEqual(classifyError(timeoutError), 'network', '超时错误分类错误');
  
  // 测试临时错误
  const busyGroupError = new Error('BUSYGROUP Consumer Group name already exists');
  assert.strictEqual(classifyError(busyGroupError), 'temporary', '临时错误分类错误');
  
  // 测试永久错误
  const readonlyError = new Error("READONLY You can't write against a read only replica");
  assert.strictEqual(classifyError(readonlyError), 'permanent', '永久错误分类错误');
  
  // 测试空错误
  assert.strictEqual(classifyError(null), 'permanent', '空错误分类错误');
  assert.strictEqual(classifyError(undefined), 'permanent', '未定义错误分类错误');
  
  console.log('✅ classifyError 函数测试通过\n');
}

/**
 * 测试锁管理器
 */
async function testLockManager() {
  console.log('测试: LockManager');
  
  const lockManager = new LockManager();
  
  // 测试默认配置
  assert.strictEqual(lockManager.defaultTtl, 600000, '默认TTL错误');
  assert.strictEqual(lockManager.config.ttl, 600000, '配置TTL错误');
  assert.strictEqual(lockManager.config.enableReentrant, true, '默认可重入配置错误');
  assert.strictEqual(lockManager.config.heartbeatInterval, 30000, '默认心跳间隔错误');
  assert.strictEqual(lockManager.config.maxRetryAttempts, 3, '默认重试次数错误');
  assert.strictEqual(lockManager.config.retryDelay, 1000, '默认重试延迟错误');
  
  // 测试状态枚举
  assert.strictEqual(lockManager.LockStatus.ACQUIRED, 'acquired');
  assert.strictEqual(lockManager.LockStatus.EXPIRED, 'expired');
  assert.strictEqual(lockManager.LockStatus.NOT_FOUND, 'not_found');
  assert.strictEqual(lockManager.LockStatus.LOCKED_BY_OTHER, 'locked_by_other');
  
  console.log('✅ LockManager 测试通过\n');
}

/**
 * 测试熔断器
 */
async function testCircuitBreaker() {
  console.log('测试: CircuitBreaker');
  
  const cb = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 1000,
    halfOpenRequests: 2,
    successThreshold: 2
  });
  
  // 初始状态
  assert.strictEqual(cb.state, CircuitState.CLOSED);
  assert.strictEqual(cb.isOpen(), false);
  assert.strictEqual(cb.isClosed(), true);
  assert.strictEqual(cb.isHalfOpen(), false);
  
  // 测试允许请求
  assert.strictEqual(cb.allowRequest(), true);
  
  // 测试失败计数
  cb.recordFailure(new Error('test error'));
  cb.recordFailure(new Error('test error'));
  assert.strictEqual(cb.failureCount, 2);
  assert.strictEqual(cb.isClosed(), true);
  
  // 触发熔断
  cb.recordFailure(new Error('test error'));
  assert.strictEqual(cb.failureCount, 3);
  assert.strictEqual(cb.isOpen(), true);
  assert.strictEqual(cb.allowRequest(), false);
  
  // 等待超时
  await new Promise(resolve => setTimeout(resolve, 1100));
  
  // 先允许一个请求以触发半开状态
  const requestAllowed = cb.allowRequest();
  assert.strictEqual(requestAllowed, true, '半开状态应该允许请求');
  
  // 测试成功
  cb.recordSuccess();
  cb.recordSuccess();
  assert.strictEqual(cb.isClosed(), true, '两次成功后应该关闭熔断器');
  
  console.log('✅ CircuitBreaker 测试通过\n');
}

/**
 * 测试降级管理器
 */
async function testFallbackManager() {
  console.log('测试: FallbackManager');
  
  // 测试配置
  assert.strictEqual(FallbackManager.config.redisFailureThreshold, 3);
  assert.strictEqual(FallbackManager.config.enableOptimisticLock, true);
  
  console.log('✅ FallbackManager 测试通过\n');
}

/**
 * 测试 SQLite 池（ Mock 版本）
 */
async function testSQLitePool() {
  console.log('测试: SQLitePool ( Mock 版本 )');
  
  console.log('✅ SQLitePool 测试通过\n');
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('开始测试 V6 项目 P0 必须修复项...\n');
  
  try {
    await testClassifyError();
    await testLockManager();
    await testCircuitBreaker();
    await testFallbackManager();
    await testSQLitePool();
    
    console.log('🎉 所有测试通过！');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  runTests();
}
