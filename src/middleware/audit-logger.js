/**
 * 操作审计日志系统
 * 功能：记录系统中的关键操作，支持查询和导出
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const LOGS_DIR = path.join(DATA_DIR, 'audit-logs');
const AUDIT_LOG_FILE = path.join(LOGS_DIR, 'operation-audit-logs.json');

// 确保日志目录存在
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * 审计日志记录器
 */
class AuditLogger {
  constructor() {
    this.logFile = AUDIT_LOG_FILE;
    this.ensureLogFileExists();
  }

  /**
   * 确保日志文件存在
   */
  ensureLogFileExists() {
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, JSON.stringify([], null, 2));
    }
  }

  /**
   * 记录操作日志
   * @param {Object} logEntry - 日志条目
   * @param {string} logEntry.operation - 操作类型 (CREATE, UPDATE, DELETE, READ, EXECUTE)
   * @param {string} logEntry.resourceType - 资源类型 (task, agent, config, etc.)
   * @param {string} logEntry.resourceId - 资源ID
   * @param {string} logEntry.userId - 用户ID/Agent ID
   * @param {string} logEntry.userName - 用户名/Agent名
   * @param {Object} logEntry.details - 操作详情
   * @param {Object} logEntry.before - 操作前的状态
   * @param {Object} logEntry.after - 操作后的状态
   */
  logOperation(logEntry) {
    const auditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      operation: logEntry.operation,
      resourceType: logEntry.resourceType,
      resourceId: logEntry.resourceId,
      userId: logEntry.userId,
      userName: logEntry.userName,
      ip: logEntry.ip || 'unknown',
      userAgent: logEntry.userAgent || 'unknown',
      details: logEntry.details || {},
      before: logEntry.before || {},
      after: logEntry.after || {},
      sessionId: logEntry.sessionId || null
    };

    try {
      // 读取现有日志
      let logs = [];
      if (fs.existsSync(this.logFile)) {
        const content = fs.readFileSync(this.logFile, 'utf8');
        logs = content ? JSON.parse(content) : [];
      }

      // 添加新日志
      logs.push(auditEntry);

      // 限制日志数量，保留最新的10000条
      if (logs.length > 10000) {
        logs = logs.slice(-10000);
      }

      // 写回文件
      fs.writeFileSync(this.logFile, JSON.stringify(logs, null, 2));

      console.log(`✅ Audit log recorded: ${logEntry.operation} on ${logEntry.resourceType}:${logEntry.resourceId}`);
      return auditEntry.id;
    } catch (error) {
      console.error('❌ Failed to write audit log:', error.message);
      return null;
    }
  }

  /**
   * 查询审计日志
   * @param {Object} filters - 查询过滤器
   * @param {string} filters.operation - 操作类型
   * @param {string} filters.resourceType - 资源类型
   * @param {string} filters.resourceId - 资源ID
   * @param {string} filters.userId - 用户ID
   * @param {string} filters.startDate - 开始日期
   * @param {string} filters.endDate - 结束日期
   * @param {number} filters.page - 页码
   * @param {number} filters.limit - 每页数量
   */
  queryLogs(filters = {}) {
    try {
      let logs = [];
      if (fs.existsSync(this.logFile)) {
        const content = fs.readFileSync(this.logFile, 'utf8');
        logs = content ? JSON.parse(content) : [];
      }

      // 应用过滤器
      let filteredLogs = logs;

      if (filters.operation) {
        filteredLogs = filteredLogs.filter(log => log.operation === filters.operation);
      }

      if (filters.resourceType) {
        filteredLogs = filteredLogs.filter(log => log.resourceType === filters.resourceType);
      }

      if (filters.resourceId) {
        filteredLogs = filteredLogs.filter(log => log.resourceId === filters.resourceId);
      }

      if (filters.userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === filters.userId);
      }

      if (filters.userName) {
        filteredLogs = filteredLogs.filter(log => log.userName === filters.userName);
      }

      if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= startDate);
      }

      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= endDate);
      }

      // 排序（按时间倒序）
      filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // 分页
      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;

      const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
      const totalCount = filteredLogs.length;

      return {
        logs: paginatedLogs,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalRecords: totalCount,
          hasNext: endIndex < totalCount,
          hasPrev: startIndex > 0
        }
      };
    } catch (error) {
      console.error('❌ Failed to query audit logs:', error.message);
      return { logs: [], pagination: { currentPage: 1, totalPages: 0, totalRecords: 0, hasNext: false, hasPrev: false } };
    }
  }

  /**
   * 导出审计日志
   * @param {Object} filters - 导出过滤器
   * @param {string} format - 导出格式
   * @returns {string} - 导出文件路径
   */
  exportLogs(filters = {}, format = 'json') {
    try {
      const { logs } = this.queryLogs(filters);

      if (logs.length === 0) {
        throw new Error('No logs found for export');
      }

      let content;
      let filename;
      let extension;

      if (format.toLowerCase() === 'csv') {
        content = this.convertToCSV(logs);
        filename = `audit-logs-export-${Date.now()}.${extension}`;
        extension = 'csv';
      } else {
        content = JSON.stringify(logs, null, 2);
        extension = 'json';
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const exportFileName = `audit-logs-export-${timestamp}.${extension}`;
      const exportPath = path.join(LOGS_DIR, exportFileName);

      fs.writeFileSync(exportPath, content);

      console.log(`✅ Audit logs exported to: ${exportPath}`);
      return exportPath;
    } catch (error) {
      console.error('❌ Failed to export audit logs:', error.message);
      throw error;
    }
  }

  /**
   * 将日志转换为CSV格式
   */
  convertToCSV(logs) {
    if (logs.length === 0) return '';

    const headers = ['ID', 'Timestamp', 'Operation', 'Resource Type', 'Resource ID', 'User ID', 'User Name', 'IP', 'Details'];
    const rows = [headers.join(',')];

    for (const log of logs) {
      const row = [
        `"${log.id}"`,
        `"${log.timestamp}"`,
        `"${log.operation}"`,
        `"${log.resourceType}"`,
        `"${log.resourceId}"`,
        `"${log.userId}"`,
        `"${log.userName}"`,
        `"${log.ip}"`,
        `"${JSON.stringify(log.details).replace(/"/g, '""')}"`
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * 获取操作统计
   */
  getStatistics(startDate, endDate) {
    try {
      let logs = [];
      if (fs.existsSync(this.logFile)) {
        const content = fs.readFileSync(this.logFile, 'utf8');
        logs = content ? JSON.parse(content) : [];
      }

      // 过滤日期范围
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date();

        logs = logs.filter(log => {
          const logDate = new Date(log.timestamp);
          return logDate >= start && logDate <= end;
        });
      }

      // 统计数据
      const stats = {
        totalOperations: logs.length,
        operationsByType: {},
        resourcesByType: {},
        usersByActivity: {},
        operationsOverTime: {}
      };

      for (const log of logs) {
        stats.operationsByType[log.operation] = (stats.operationsByType[log.operation] || 0) + 1;
        stats.resourcesByType[log.resourceType] = (stats.resourcesByType[log.resourceType] || 0) + 1;
        stats.usersByActivity[log.userId] = (stats.usersByActivity[log.userId] || 0) + 1;

        const date = new Date(log.timestamp).toISOString().split('T')[0];
        stats.operationsOverTime[date] = (stats.operationsOverTime[date] || 0) + 1;
      }

      return stats;
    } catch (error) {
      console.error('❌ Failed to get audit statistics:', error.message);
      return {};
    }
  }

  /**
   * 清理过期日志
   */
  cleanupOldLogs(days = 30) {
    try {
      let logs = [];
      if (fs.existsSync(this.logFile)) {
        const content = fs.readFileSync(this.logFile, 'utf8');
        logs = content ? JSON.parse(content) : [];
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const filteredLogs = logs.filter(log => {
        return new Date(log.timestamp) >= cutoffDate;
      });

      if (filteredLogs.length !== logs.length) {
        fs.writeFileSync(this.logFile, JSON.stringify(filteredLogs, null, 2));
        console.log(`✅ Cleaned up old audit logs. Removed ${logs.length - filteredLogs.length} entries.`);
      }

      return {
        originalCount: logs.length,
        remainingCount: filteredLogs.length,
        removedCount: logs.length - filteredLogs.length
      };
    } catch (error) {
      console.error('❌ Failed to cleanup audit logs:', error.message);
      return null;
    }
  }
}

// 导出审计记录器
module.exports = AuditLogger;