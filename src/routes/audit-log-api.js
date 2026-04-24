/**
 * 审计日志 API - 提供操作日志的记录、查询、导出接口
 */

const express = require('express');
const router = express.Router();
const AuditLogger = require('../middleware/audit-logger');
const path = require('path');

const auditLogger = new AuditLogger();

/**
 * 记录操作日志
 */
router.post('/audit-logs', (req, res) => {
  const { operation, resourceType, resourceId, details, before, after } = req.body;

  if (!operation || !resourceType || !resourceId) {
    return res.status(400).json({
      code: 400,
      error: {
        type: 'ValidationError',
        message: '缺少必要字段: operation, resourceType, resourceId'
      }
    });
  }

  const logEntry = {
    operation,
    resourceType,
    resourceId,
    userId: req.user?.id || req.agent?.id || 'system',
    userName: req.user?.name || req.agent?.name || 'System',
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    details,
    before,
    after,
    sessionId: req.session?.id
  };

  const logId = auditLogger.logOperation(logEntry);

  if (logId) {
    res.json({
      code: 200,
      data: {
        id: logId,
        message: '操作日志记录成功'
      }
    });
  } else {
    res.status(500).json({
      code: 500,
      error: {
        type: 'SystemError',
        message: '记录操作日志失败'
      }
    });
  }
});

/**
 * 查询审计日志
 */
router.get('/audit-logs', (req, res) => {
  const filters = {
    operation: req.query.operation,
    resourceType: req.query.resourceType,
    resourceId: req.query.resourceId,
    userId: req.query.userId,
    userName: req.query.userName,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 50
  };

  try {
    const result = auditLogger.queryLogs(filters);

    res.json({
      code: 200,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      error: {
        type: 'SystemError',
        message: error.message
      }
    });
  }
});

/**
 * 获取审计日志统计
 */
router.get('/audit-logs/stats', (req, res) => {
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  try {
    const stats = auditLogger.getStatistics(startDate, endDate);

    res.json({
      code: 200,
      data: {
        statistics: stats,
        period: {
          startDate,
          endDate
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      error: {
        type: 'SystemError',
        message: error.message
      }
    });
  }
});

/**
 * 导出审计日志
 */
router.post('/audit-logs/export', (req, res) => {
  const { filters = {}, format = 'json' } = req.body;

  try {
    const exportPath = auditLogger.exportLogs(filters, format);

    res.json({
      code: 200,
      data: {
        exportPath,
        format,
        message: '审计日志导出成功'
      }
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      error: {
        type: 'SystemError',
        message: error.message
      }
    });
  }
});

/**
 * 清理过期审计日志
 */
router.delete('/audit-logs/cleanup', (req, res) => {
  const days = parseInt(req.query.days) || 30;

  try {
    const result = auditLogger.cleanupOldLogs(days);

    res.json({
      code: 200,
      data: {
        result,
        message: `审计日志清理完成，保留${days}天的日志`
      }
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      error: {
        type: 'SystemError',
        message: error.message
      }
    });
  }
});

module.exports = router;