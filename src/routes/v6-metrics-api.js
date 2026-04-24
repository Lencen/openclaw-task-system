/**
 * V6 Metrics API - Prometheus Format Monitoring
 * 
 * 提供 V6 项目监控指标，支持 Prometheus 格式
 * 
 * @version 1.0.0
 * @date 2026-03-27
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

// ============================================
// 监控指标定义
// ============================================

/**
 * 获取锁获取成功率（v6_lock_acquire_success_rate）
 * 
 * 计算逻辑：
 * - 从任务执行日志中统计锁获取尝试次数
 * - 统计成功次数
 * - 成功率 = 成功次数 / 尝试次数
 */
function getLockAcquireSuccessRate() {
  // 从任务执行日志统计
  const tasks = db.tasks.list();
  let totalAttempts = 0;
  let successCount = 0;
  
  tasks.forEach(task => {
    // 检查任务的 execution_log 中是否有锁相关操作
    if (task.execution_log) {
      task.execution_log.forEach(log => {
        if (log.action && log.action.includes('lock')) {
          totalAttempts++;
          if (log.result && (log.result.includes('success') || log.result.includes('acquired'))) {
            successCount++;
          }
        }
      });
    }
  });
  
  const successRate = totalAttempts > 0 ? (successCount / totalAttempts) : 1;
  
  return {
    totalAttempts,
    successCount,
    successRate
  };
}

/**
 * 获取锁续期次数（v6_lock_heartbeat_count）
 * 
 * 统计所有任务的锁续期次数
 */
function getLockHeartbeatCount() {
  const tasks = db.tasks.list();
  let heartbeatCount = 0;
  
  tasks.forEach(task => {
    if (task.execution_log) {
      task.execution_log.forEach(log => {
        if (log.action && (log.action.includes('heartbeat') || log.action.includes('续期'))) {
          heartbeatCount++;
        }
      });
    }
  });
  
  return {
    heartbeatCount
  };
}

/**
 * 获取去重命中率（v6_dedup_hit_rate）
 * 
 * 计算逻辑：
 * - 从任务创建日志中统计去重检查次数
 * - 统计命中次数（message_hash 相同的任务创建被阻止）
 * - 命中率 = 命中次数 / 检查次数
 */
function getDedupHitRate() {
  // 从 tasks-from-chat-sqlite 路由统计
  const dedupLogPath = require('path').join(__dirname, '../data/dedup-log.jsonl');
  
  let totalChecks = 0;
  let hitCount = 0;
  
  try {
    if (require('fs').existsSync(dedupLogPath)) {
      const content = require('fs').readFileSync(dedupLogPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      lines.forEach(line => {
        try {
          const record = JSON.parse(line);
          totalChecks++;
          if (record.alreadyExists) {
            hitCount++;
          }
        } catch (e) {}
      });
    }
  } catch (e) {}
  
  const hitRate = totalChecks > 0 ? (hitCount / totalChecks) : 1;
  
  return {
    totalChecks,
    hitCount,
    hitRate
  };
}

/**
 * 获取重试成功率（v6_retry_success_rate）
 * 
 * 统计重试次数和成功次数
 */
function getRetrySuccessRate() {
  const tasks = db.tasks.list();
  let retryAttempts = 0;
  let retrySuccess = 0;
  
  tasks.forEach(task => {
    if (task.execution_log) {
      task.execution_log.forEach(log => {
        if (log.action && log.action.includes('retry')) {
          retryAttempts++;
          if (log.result && (log.result.includes('success') || log.result.includes('done'))) {
            retrySuccess++;
          }
        }
      });
    }
  });
  
  const successRate = retryAttempts > 0 ? (retrySuccess / retryAttempts) : 1;
  
  return {
    retryAttempts,
    retrySuccess,
    successRate
  };
}

/**
 * 获取熔断器状态（v6_circuit_breaker_state）
 * 
 * 状态值：
 * - 0: closed (关闭)
 * - 1: open (打开)
 * - 2: half_open (半开)
 */
function getCircuitBreakerState() {
  // 检查系统是否存在熔断器配置
  const cbConfig = {
    enabled: false,
    failureThreshold: 5,
    recoveryTimeout: 30000,
    state: 'closed' // closed, open, half_open
  };
  
  // 检查是否有最近的失败任务
  const tasks = db.tasks.list();
  const recentFailures = tasks.filter(t => {
    if (!t.completed_at) return false;
    const completedTime = new Date(t.completed_at).getTime();
    return completedTime > Date.now() - 300000 && t.status === 'failed';
  });
  
  if (recentFailures.length >= cbConfig.failureThreshold) {
    cbConfig.state = 'open';
  } else if (recentFailures.length > 0) {
    cbConfig.state = 'half_open';
  } else {
    cbConfig.state = 'closed';
  }
  
  // 状态码映射
  const stateMap = {
    closed: 0,
    open: 1,
    half_open: 2
  };
  
  return {
    enabled: cbConfig.enabled,
    state: cbConfig.state,
    stateCode: stateMap[cbConfig.state],
    failureThreshold: cbConfig.failureThreshold,
    recoveryTimeout: cbConfig.recoveryTimeout,
    recentFailures: recentFailures.length
  };
}

// ============================================
// Prometheus 格式输出
// ============================================

/**
 * 将指标转换为 Prometheus 文本格式
 * 
 * Prometheus 格式示例：
 * # HELP v6_lock_acquire_success_rate 锁获取成功率
 * # TYPE v6_lock_acquire_success_rate gauge
 * v6_lock_acquire_success_rate{agentId="",taskId="",errorType=""} 0.95
 */
function formatMetric(name, type, help, value, labels = {}) {
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  
  return `# HELP ${name} ${help}
# TYPE ${name} ${type}
${name}${labelStr ? '{' + labelStr + '}' : ''} ${value}
`;
}

/**
 * 生成 Prometheus 格式的指标数据
 */
function generatePrometheusMetrics() {
  const metrics = [];
  
  // 1. 锁获取成功率
  const lockAcquire = getLockAcquireSuccessRate();
  metrics.push(formatMetric(
    'v6_lock_acquire_success_rate',
    'gauge',
    'V6 lock acquire success rate (0-1)',
    lockAcquire.successRate,
    { agentId: 'v6-lock-manager', taskId: 'all', errorType: 'none' }
  ));
  
  // 辅助指标：尝试次数和成功次数
  metrics.push(formatMetric(
    'v6_lock_acquire_total_attempts',
    'counter',
    'Total lock acquire attempts',
    lockAcquire.totalAttempts,
    { agentId: 'v6-lock-manager', taskId: 'all', errorType: 'none' }
  ));
  
  metrics.push(formatMetric(
    'v6_lock_acquire_success_count',
    'counter',
    'Successful lock acquire count',
    lockAcquire.successCount,
    { agentId: 'v6-lock-manager', taskId: 'all', errorType: 'none' }
  ));
  
  // 2. 锁续期次数
  const heartbeat = getLockHeartbeatCount();
  metrics.push(formatMetric(
    'v6_lock_heartbeat_count',
    'counter',
    'V6 lock heartbeat count (renewal次数)',
    heartbeat.heartbeatCount,
    { agentId: 'v6-lock-manager', taskId: 'all', errorType: 'none' }
  ));
  
  // 3. 去重命中率
  const dedup = getDedupHitRate();
  metrics.push(formatMetric(
    'v6_dedup_hit_rate',
    'gauge',
    'V6 deduplication hit rate (0-1)',
    dedup.hitRate,
    { agentId: 'v6-dedup', taskId: 'all', errorType: 'none' }
  ));
  
  // 辅助指标：检查次数和命中次数
  metrics.push(formatMetric(
    'v6_dedup_total_checks',
    'counter',
    'Total deduplication checks',
    dedup.totalChecks,
    { agentId: 'v6-dedup', taskId: 'all', errorType: 'none' }
  ));
  
  metrics.push(formatMetric(
    'v6_dedup_hit_count',
    'counter',
    'Deduplication hit count (duplicate prevented)',
    dedup.hitCount,
    { agentId: 'v6-dedup', taskId: 'all', errorType: 'none' }
  ));
  
  // 4. 重试成功率
  const retry = getRetrySuccessRate();
  metrics.push(formatMetric(
    'v6_retry_success_rate',
    'gauge',
    'V6 retry success rate (0-1)',
    retry.successRate,
    { agentId: 'v6-retry', taskId: 'all', errorType: 'none' }
  ));
  
  // 辅助指标：重试次数和成功次数
  metrics.push(formatMetric(
    'v6_retry_total_attempts',
    'counter',
    'Total retry attempts',
    retry.retryAttempts,
    { agentId: 'v6-retry', taskId: 'all', errorType: 'none' }
  ));
  
  metrics.push(formatMetric(
    'v6_retry_success_count',
    'counter',
    'Successful retry count',
    retry.retrySuccess,
    { agentId: 'v6-retry', taskId: 'all', errorType: 'none' }
  ));
  
  // 5. 熔断器状态
  const circuitBreaker = getCircuitBreakerState();
  
  // 熔断器状态（0=closed, 1=open, 2=half_open）
  metrics.push(formatMetric(
    'v6_circuit_breaker_state',
    'gauge',
    'V6 circuit breaker state (0=closed,1=open,2=half_open)',
    circuitBreaker.stateCode,
    { agentId: 'v6-circuit-breaker', taskId: 'all', errorType: 'none' }
  ));
  
  // 辅助指标：最近失败次数
  metrics.push(formatMetric(
    'v6_circuit_breaker_recent_failures',
    'gauge',
    'Recent task failure count',
    circuitBreaker.recentFailures,
    { agentId: 'v6-circuit-breaker', taskId: 'all', errorType: 'none' }
  ));
  
  // 熔断器启用状态
  metrics.push(formatMetric(
    'v6_circuit_breaker_enabled',
    'gauge',
    'V6 circuit breaker enabled (0=false,1=true)',
    circuitBreaker.enabled ? 1 : 0,
    { agentId: 'v6-circuit-breaker', taskId: 'all', errorType: 'none' }
  ));
  
  return metrics.join('\n');
}

// ============================================
// 告警规则检查
// ============================================

/**
 * 检查告警规则
 */
function checkAlertRules() {
  const alerts = [];
  
  // 1. 锁获取失败率 > 10%
  const lockAcquire = getLockAcquireSuccessRate();
  const lockFailureRate = 1 - lockAcquire.successRate;
  if (lockFailureRate > 0.1) {
    alerts.push({
      id: `alt-lock-${Date.now()}`,
      name: '锁获取失败率过高',
      level: 'critical',
      condition: `锁获取失败率 ${Math.round(lockFailureRate * 100)}% > 10%`,
      value: lockFailureRate,
      metric: 'v6_lock_acquire_success_rate'
    });
  }
  
  // 2. 去重命中率 < 50%
  const dedup = getDedupHitRate();
  if (dedup.hitRate < 0.5) {
    alerts.push({
      id: `alt-dedup-${Date.now()}`,
      name: '去重命中率过低',
      level: 'warning',
      condition: `去重命中率 ${Math.round(dedup.hitRate * 100)}% < 50%`,
      value: dedup.hitRate,
      metric: 'v6_dedup_hit_rate'
    });
  }
  
  // 3. 重试成功率 < 70%
  const retry = getRetrySuccessRate();
  if (retry.successRate < 0.7) {
    alerts.push({
      id: `alt-retry-${Date.now()}`,
      name: '重试成功率过低',
      level: 'warning',
      condition: `重试成功率 ${Math.round(retry.successRate * 100)}% < 70%`,
      value: retry.successRate,
      metric: 'v6_retry_success_rate'
    });
  }
  
  // 4. 熔断器处于 open 状态
  const circuitBreaker = getCircuitBreakerState();
  if (circuitBreaker.state === 'open') {
    alerts.push({
      id: `alt-cb-${Date.now()}`,
      name: '熔断器打开',
      level: 'critical',
      condition: '熔断器处于 open 状态',
      value: circuitBreaker.stateCode,
      metric: 'v6_circuit_breaker_state'
    });
  }
  
  return alerts;
}

// ============================================
// API 路由
// ============================================

/**
 * GET /api/metrics/v6
 * Prometheus 格式的监控指标
 * 
 * Response:
 * - Content-Type: text/plain; charset=utf-8
 * - Prometheus 文本格式
 */
router.get('/v6', (req, res) => {
  try {
    // 设置 Prometheus 格式 Content-Type
    res.type('text/plain; charset=utf-8');
    
    // 生成指标数据
    const metrics = generatePrometheusMetrics();
    
    res.send(metrics);
  } catch (error) {
    console.error('[V6 Metrics] Error generating metrics:', error);
    res.status(500).send(`Error generating metrics: ${error.message}\n`);
  }
});

/**
 * GET /api/metrics/v6/alerts
 * 获取当前告警状态
 */
router.get('/v6/alerts', (req, res) => {
  try {
    const alerts = checkAlertRules();
    
    res.json({
      success: true,
      alerts,
      count: alerts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[V6 Metrics Alerts] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/metrics/v6/check
 * 一键检查所有监控指标和告警
 */
router.get('/v6/check', (req, res) => {
  try {
    const metrics = generatePrometheusMetrics();
    const alerts = checkAlertRules();
    
    // 计算总体状态
    let overallStatus = 'healthy';
    if (alerts.some(a => a.level === 'critical')) {
      overallStatus = 'critical';
    } else if (alerts.length > 0) {
      overallStatus = 'warning';
    }
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      status: overallStatus,
      metrics: {
        lockAcquire: getLockAcquireSuccessRate(),
        heartbeat: getLockHeartbeatCount(),
        dedup: getDedupHitRate(),
        retry: getRetrySuccessRate(),
        circuitBreaker: getCircuitBreakerState()
      },
      alerts,
      alertCount: alerts.length
    });
  } catch (error) {
    console.error('[V6 Metrics Check] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
