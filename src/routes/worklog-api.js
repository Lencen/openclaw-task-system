/**
 * Subagent 工作记录 API 路由
 */

const express = require('express');
const router = express.Router();
const workLog = require('../middleware/subagent-work-log');

/**
 * POST /api/worklog/create
 * 创建工作记录
 */
router.post('/create', (req, res) => {
  const { sessionKey, agentId, agentName, parentSessionKey, taskId, action, detail, output, metrics, duration } = req.body;
  
  if (!sessionKey || !agentId || !action) {
    return res.status(400).json({
      code: 400,
      error: { type: 'ValidationError', message: '缺少必填字段: sessionKey, agentId, action' }
    });
  }
  
  const log = workLog.createWorkLog({
    sessionKey,
    agentId,
    agentName,
    parentSessionKey,
    taskId,
    action,
    detail,
    output,
    metrics,
    duration
  });
  
  res.json({
    code: 200,
    data: log
  });
});

/**
 * POST /api/worklog/started
 * 记录开始动作
 */
router.post('/started', (req, res) => {
  const { sessionKey, agentId, parentSessionKey, taskId, detail } = req.body;
  
  const log = workLog.actions.started(sessionKey, agentId, parentSessionKey, taskId, detail);
  
  res.json({
    code: 200,
    data: log
  });
});

/**
 * POST /api/worklog/progress
 * 记录进度
 */
router.post('/progress', (req, res) => {
  const { sessionKey, agentId, detail, output } = req.body;
  
  const log = workLog.actions.progress(sessionKey, agentId, detail, output);
  
  res.json({
    code: 200,
    data: log
  });
});

/**
 * POST /api/worklog/completed
 * 记录完成
 */
router.post('/completed', (req, res) => {
  const { sessionKey, agentId, detail, output, duration } = req.body;
  
  const log = workLog.actions.completed(sessionKey, agentId, detail, output, duration);
  
  res.json({
    code: 200,
    data: log
  });
});

/**
 * POST /api/worklog/failed
 * 记录失败
 */
router.post('/failed', (req, res) => {
  const { sessionKey, agentId, detail, error } = req.body;
  
  const log = workLog.actions.failed(sessionKey, agentId, detail, error);
  
  res.json({
    code: 200,
    data: log
  });
});

/**
 * GET /api/worklog/subagent/:sessionKey
 * 获取 Subagent 的所有工作记录
 */
router.get('/subagent/:sessionKey', (req, res) => {
  const { sessionKey } = req.params;
  
  const logs = workLog.getSubagentLogs(sessionKey);
  
  res.json({
    code: 200,
    data: {
      sessionKey,
      logs,
      total: logs.length
    }
  });
});

/**
 * GET /api/worklog/aggregated/:parentSessionKey
 * 获取主 Agent 汇总的工作记录
 */
router.get('/aggregated/:parentSessionKey', (req, res) => {
  const { parentSessionKey } = req.params;
  
  const aggregated = workLog.getAggregatedLogs(parentSessionKey);
  
  res.json({
    code: 200,
    data: aggregated
  });
});

/**
 * GET /api/worklog/report/:parentSessionKey
 * 生成工作汇总报告
 */
router.get('/report/:parentSessionKey', (req, res) => {
  const { parentSessionKey } = req.params;
  
  const report = workLog.generateSummaryReport(parentSessionKey);
  
  res.json({
    code: 200,
    data: report
  });
});

/**
 * POST /api/worklog/cleanup
 * 清理过期的工组记录
 */
router.post('/cleanup', (req, res) => {
  const { maxAgeDays = 7 } = req.body;
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
  
  const result = workLog.cleanupOldLogs(maxAge);
  
  res.json({
    code: 200,
    data: result
  });
});

module.exports = router;