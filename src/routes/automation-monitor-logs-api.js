/**
 * 自动化流程监控和日志API
 * 提供对监控、审计和执行日志的API访问
 */

const express = require('express');
const router = express.Router();
const { AutomationMonitor } = require('../monitor/automation-monitor');
const EnhancedAuditLogger = require('../middleware/enhanced-audit-logger');
const EnhancedExecutionLogger = require('../db/enhanced-execution-logger');

// 初始化日志记录器
const monitor = new AutomationMonitor();
const auditLogger = new EnhancedAuditLogger();
const executionLogger = new EnhancedExecutionLogger();

/**
 * 获取自动化流程状态
 */
router.get('/automation/status', (req, res) => {
  try {
    const status = monitor.getAutomationStatus();
    if (status) {
      res.json({
        success: true,
        data: status,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to get automation status'
      });
    }
  } catch (error) {
    console.error('Error getting automation status:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 检查自动化流程
 */
router.post('/automation/check', (req, res) => {
  try {
    const result = monitor.checkAutomation();
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking automation:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取监控日志
 */
router.get('/monitor/logs', (req, res) => {
  try {
    const count = parseInt(req.query.count) || 50;
    const logs = monitor.getRecentLogs(count);
    res.json({
      success: true,
      data: logs,
      count: logs.length
    });
  } catch (error) {
    console.error('Error getting monitor logs:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取监控历史
 */
router.get('/monitor/history', (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const history = monitor.getHistory(hours);
    res.json({
      success: true,
      data: history,
      hours,
      count: history.length
    });
  } catch (error) {
    console.error('Error getting monitor history:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 记录审计日志
 */
router.post('/audit/log', (req, res) => {
  try {
    const { operation, resourceType, resourceId, userId, userName, details, severity } = req.body;
    
    if (!operation || !resourceType || !resourceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: operation, resourceType, resourceId'
      });
    }
    
    const logId = auditLogger.logOperation({
      operation,
      resourceType,
      resourceId,
      userId: userId || 'system',
      userName: userName || 'System',
      details: details || {},
      severity: severity || 'INFO',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.session?.id || null
    });
    
    if (logId) {
      res.json({
        success: true,
        id: logId,
        message: 'Audit log recorded successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to record audit log'
      });
    }
  } catch (error) {
    console.error('Error recording audit log:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 查询审计日志
 */
router.get('/audit/logs', (req, res) => {
  try {
    const filters = {
      operation: req.query.operation,
      resourceType: req.query.resourceType,
      resourceId: req.query.resourceId,
      userId: req.query.userId,
      userName: req.query.userName,
      severity: req.query.severity,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      sortBy: req.query.sortBy,
      order: req.query.order
    };
    
    // 过滤掉undefined和null值
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === null || filters[key] === '') {
        delete filters[key];
      }
    });
    
    const result = auditLogger.queryLogs(filters);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error querying audit logs:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取审计统计
 */
router.get('/audit/stats', (req, res) => {
  try {
    const filters = {
      filters: {
        startDate: req.query.startDate,
        endDate: req.query.endDate
      }
    };
    
    const stats = auditLogger.getStatistics(filters);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting audit stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 检查合规性
 */
router.get('/audit/compliance', (req, res) => {
  try {
    const compliance = auditLogger.checkCompliance();
    res.json({
      success: true,
      data: compliance
    });
  } catch (error) {
    console.error('Error checking compliance:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取实时审计指标
 */
router.get('/audit/metrics', (req, res) => {
  try {
    const metrics = auditLogger.getRealtimeMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error getting audit metrics:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 记录任务开始执行
 */
router.post('/execution/task/start', (req, res) => {
  try {
    const { taskId, agentId, details } = req.body;
    
    if (!taskId || !agentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: taskId, agentId'
      });
    }
    
    const logId = executionLogger.logTaskStart(taskId, agentId, details || {});
    
    if (logId) {
      res.json({
        success: true,
        id: logId,
        message: 'Task start logged successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to log task start'
      });
    }
  } catch (error) {
    console.error('Error logging task start:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 记录任务步骤
 */
router.post('/execution/task/step', (req, res) => {
  try {
    const { taskId, step, status, details } = req.body;
    
    if (!taskId || !step || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: taskId, step, status'
      });
    }
    
    const logId = executionLogger.logTaskStep(taskId, step, status, details || {});
    
    if (logId) {
      res.json({
        success: true,
        id: logId,
        message: 'Task step logged successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to log task step'
      });
    }
  } catch (error) {
    console.error('Error logging task step:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 记录任务结果
 */
router.post('/execution/task/result', (req, res) => {
  try {
    const { taskId, result, error, durationMs } = req.body;
    
    if (!taskId || !result) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: taskId, result'
      });
    }
    
    const logId = executionLogger.logTaskResult(taskId, result, error, durationMs);
    
    if (logId) {
      res.json({
        success: true,
        id: logId,
        message: 'Task result logged successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to log task result'
      });
    }
  } catch (error) {
    console.error('Error logging task result:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 记录工具调用
 */
router.post('/execution/tool/call', (req, res) => {
  try {
    const { taskId, toolName, params, result, durationMs } = req.body;
    
    if (!taskId || !toolName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: taskId, toolName'
      });
    }
    
    const logId = executionLogger.logToolCall(taskId, toolName, params, result, durationMs);
    
    if (logId) {
      res.json({
        success: true,
        id: logId,
        message: 'Tool call logged successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to log tool call'
      });
    }
  } catch (error) {
    console.error('Error logging tool call:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 查询执行日志
 */
router.get('/execution/logs', (req, res) => {
  try {
    const filters = {
      taskId: req.query.taskId,
      eventType: req.query.eventType,
      agentId: req.query.agentId,
      result: req.query.result,
      toolName: req.query.toolName,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      sortBy: req.query.sortBy,
      order: req.query.order
    };
    
    // 过滤掉undefined和null值
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === null || filters[key] === '') {
        delete filters[key];
      }
    });
    
    const result = executionLogger.queryLogs(filters);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error querying execution logs:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取任务执行统计
 */
router.get('/execution/task/stats/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const stats = executionLogger.getTaskExecutionStats(taskId);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting task execution stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取任务执行轨迹
 */
router.get('/execution/task/trace/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const trace = executionLogger.getTaskExecutionTrace(taskId);
    res.json({
      success: true,
      data: trace
    });
  } catch (error) {
    console.error('Error getting task execution trace:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取执行性能统计
 */
router.get('/execution/performance', (req, res) => {
  try {
    const options = {
      filters: {
        startDate: req.query.startDate,
        endDate: req.query.endDate
      }
    };
    
    const stats = executionLogger.getPerformanceStats(options);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting execution performance stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取实时执行指标
 */
router.get('/execution/metrics', (req, res) => {
  try {
    const metrics = executionLogger.getRealtimeMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error getting execution metrics:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取活跃任务列表
 */
router.get('/execution/active-tasks', (req, res) => {
  try {
    const activeTasks = executionLogger.getActiveTasks();
    res.json({
      success: true,
      data: activeTasks,
      count: activeTasks.length
    });
  } catch (error) {
    console.error('Error getting active tasks:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取工具使用统计
 */
router.get('/execution/tool/stats/:toolName', (req, res) => {
  try {
    const { toolName } = req.params;
    const stats = executionLogger.getToolUsageStats(toolName);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting tool usage stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;