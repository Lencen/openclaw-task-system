/**
 * 增强版操作审计日志系统
 * 功能：记录系统中的关键操作，支持查询、分析和合规性检查
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '../data');
const AUDIT_LOGS_DIR = path.join(DATA_DIR, 'audit-logs');
const MAIN_AUDIT_FILE = path.join(AUDIT_LOGS_DIR, 'main-audit-log.jsonl'); // 使用JSONL格式便于追加
const COMPRESSED_LOGS_DIR = path.join(AUDIT_LOGS_DIR, 'compressed');

// 确保日志目录存在
if (!fs.existsSync(AUDIT_LOGS_DIR)) {
  fs.mkdirSync(AUDIT_LOGS_DIR, { recursive: true });
}

if (!fs.existsSync(COMPRESSED_LOGS_DIR)) {
  fs.mkdirSync(COMPRESSED_LOGS_DIR, { recursive: true });
}

class EnhancedAuditLogger {
  constructor(options = {}) {
    this.logFile = MAIN_AUDIT_FILE;
    this.maxFileSize = options.maxFileSize || 50 * 1024 * 1024; // 50MB
    this.rotationInterval = options.rotationInterval || 'daily'; // daily, weekly, monthly
    this.retentionDays = options.retentionDays || 90; // 保留90天
    this.maxLogsInMemory = options.maxLogsInMemory || 10000; // 内存中最多保留的日志数
    this.ensureLogFileExists();
  }

  /**
   * 确保主日志文件存在
   */
  ensureLogFileExists() {
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, '');
    }
  }

  /**
   * 生成唯一ID
   */
  generateId() {
    return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 记录操作日志
   * @param {Object} logEntry - 日志条目
   * @param {string} logEntry.operation - 操作类型 (CREATE, UPDATE, DELETE, READ, EXECUTE, LOGIN, LOGOUT)
   * @param {string} logEntry.resourceType - 资源类型 (task, issue, agent, config, user, session, etc.)
   * @param {string} logEntry.resourceId - 资源ID
   * @param {string} logEntry.userId - 用户ID/Agent ID
   * @param {string} logEntry.userName - 用户名/Agent名
   * @param {Object} logEntry.details - 操作详情
   * @param {Object} logEntry.before - 操作前的状态
   * @param {Object} logEntry.after - 操作后的状态
   * @param {string} logEntry.severity - 严重级别 (INFO, WARN, ERROR, CRITICAL)
   */
  logOperation(logEntry) {
    const auditEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      operation: logEntry.operation,
      resourceType: logEntry.resourceType,
      resourceId: logEntry.resourceId,
      userId: logEntry.userId,
      userName: logEntry.userName,
      severity: logEntry.severity || 'INFO',
      ip: logEntry.ip || 'unknown',
      userAgent: logEntry.userAgent || 'unknown',
      clientInfo: logEntry.clientInfo || {},
      details: logEntry.details || {},
      before: logEntry.before || {},
      after: logEntry.after || {},
      sessionId: logEntry.sessionId || null,
      correlationId: logEntry.correlationId || null, // 用于关联相关操作
      durationMs: logEntry.durationMs || null, // 操作耗时
      success: logEntry.success !== undefined ? logEntry.success : true, // 操作是否成功
      tags: logEntry.tags || [] // 标签，便于分类查询
    };

    try {
      // 检查文件大小，如果过大则轮转
      this.rotateLogFileIfNeeded();

      // 追加到日志文件（JSONL格式）
      fs.appendFileSync(this.logFile, JSON.stringify(auditEntry) + '\n');

      // 对于严重级别较高的日志，额外记录到特定文件
      if (['ERROR', 'CRITICAL'].includes(auditEntry.severity)) {
        const errorLogFile = path.join(AUDIT_LOGS_DIR, 'error-audit-log.jsonl');
        fs.appendFileSync(errorLogFile, JSON.stringify(auditEntry) + '\n');
      }

      console.log(`✅ [Audit] ${auditEntry.operation} on ${auditEntry.resourceType}:${auditEntry.resourceId} by ${auditEntry.userName}`);
      return auditEntry.id;
    } catch (error) {
      console.error('❌ Failed to write audit log:', error.message);
      return null;
    }
  }

  /**
   * 检查是否需要轮转日志文件
   */
  rotateLogFileIfNeeded() {
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > this.maxFileSize) {
          this.rotateLogFile();
        }
      }
    } catch (error) {
      console.error('Error checking log file size:', error.message);
    }
  }

  /**
   * 轮转日志文件
   */
  rotateLogFile() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
      const rotatedFilename = path.join(AUDIT_LOGS_DIR, `audit-log-${timestamp}.jsonl`);
      
      // 移动当前文件到轮转文件
      fs.renameSync(this.logFile, rotatedFilename);
      
      // 创建新的主日志文件
      this.ensureLogFileExists();
      
      console.log(`✅ Log rotated to: ${rotatedFilename}`);
      
      // 压缩旧日志文件
      this.compressLogFile(rotatedFilename);
      
      // 清理过期日志
      this.cleanupExpiredLogs();
    } catch (error) {
      console.error('Error rotating log file:', error.message);
    }
  }

  /**
   * 压缩日志文件
   */
  compressLogFile(filepath) {
    try {
      const content = fs.readFileSync(filepath);
      const compressed = zlib.gzipSync(content);
      const compressedPath = filepath + '.gz';
      
      fs.writeFileSync(compressedPath, compressed);
      console.log(`✅ Log compressed to: ${compressedPath}`);
      
      // 删除原文件（保留压缩文件）
      fs.unlinkSync(filepath);
    } catch (error) {
      console.error('Error compressing log file:', error.message);
    }
  }

  /**
   * 清理过期日志
   */
  cleanupExpiredLogs() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
      
      // 清理JSONL文件
      const files = fs.readdirSync(AUDIT_LOGS_DIR);
      files.forEach(file => {
        if ((file.startsWith('audit-log-') && file.endsWith('.jsonl')) ||
            (file.startsWith('audit-log-') && file.endsWith('.jsonl.gz'))) {
          const fullPath = path.join(AUDIT_LOGS_DIR, file);
          const stat = fs.statSync(fullPath);
          
          if (stat.mtime < cutoffDate) {
            fs.unlinkSync(fullPath);
            console.log(`✅ Expired log removed: ${fullPath}`);
          }
        }
      });
    } catch (error) {
      console.error('Error cleaning up expired logs:', error.message);
    }
  }

  /**
   * 解析JSONL文件为数组
   */
  parseJsonlFile(filepath) {
    try {
      if (!fs.existsSync(filepath)) {
        return [];
      }
      
      const content = fs.readFileSync(filepath, 'utf8');
      if (!content.trim()) {
        return [];
      }
      
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            console.warn('Invalid JSON line:', line);
            return null;
          }
        })
        .filter(Boolean);
    } catch (error) {
      console.error('Error parsing JSONL file:', error.message);
      return [];
    }
  }

  /**
   * 查询审计日志
   * @param {Object} filters - 查询过滤器
   * @param {string} filters.operation - 操作类型
   * @param {string} filters.resourceType - 资源类型
   * @param {string} filters.resourceId - 资源ID
   * @param {string} filters.userId - 用户ID
   * @param {string} filters.userName - 用户名
   * @param {string} filters.severity - 严重级别
   * @param {string} filters.startDate - 开始日期
   * @param {string} filters.endDate - 结束日期
   * @param {string} filters.correlationId - 关联ID
   * @param {number} filters.page - 页码
   * @param {number} filters.limit - 每页数量
   * @param {string} filters.sortBy - 排序字段
   * @param {string} filters.order - 排序方向 (asc, desc)
   */
  queryLogs(filters = {}) {
    try {
      // 获取所有日志文件（包括压缩文件）
      const logFiles = this.getLogFiles();
      let allLogs = [];

      // 读取所有日志文件
      for (const file of logFiles) {
        const logs = this.parseJsonlFile(file);
        allLogs = allLogs.concat(logs);
      }

      // 应用过滤器
      let filteredLogs = allLogs;

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

      if (filters.severity) {
        filteredLogs = filteredLogs.filter(log => log.severity === filters.severity);
      }

      if (filters.correlationId) {
        filteredLogs = filteredLogs.filter(log => log.correlationId === filters.correlationId);
      }

      if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= startDate);
      }

      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= endDate);
      }

      if (filters.tags && Array.isArray(filters.tags) && filters.tags.length > 0) {
        filteredLogs = filteredLogs.filter(log => 
          filters.tags.every(tag => log.tags.includes(tag))
        );
      }

      // 排序
      const sortBy = filters.sortBy || 'timestamp';
      const order = (filters.order || 'desc').toLowerCase();
      
      filteredLogs.sort((a, b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];
        
        // 如果是日期字符串，转换为时间戳比较
        if (typeof valA === 'string' && !isNaN(Date.parse(valA))) {
          valA = new Date(valA).getTime();
          valB = new Date(valB).getTime();
        }
        
        if (order === 'desc') {
          return valB > valA ? 1 : valB < valA ? -1 : 0;
        } else {
          return valA > valB ? 1 : valA < valB ? -1 : 0;
        }
      });

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
        },
        summary: {
          total: totalCount,
          bySeverity: this.groupBy(filteredLogs, 'severity'),
          byOperation: this.groupBy(filteredLogs, 'operation'),
          byResourceType: this.groupBy(filteredLogs, 'resourceType'),
          byUser: this.groupBy(filteredLogs, 'userName')
        }
      };
    } catch (error) {
      console.error('❌ Failed to query audit logs:', error.message);
      return { 
        logs: [], 
        pagination: { currentPage: 1, totalPages: 0, totalRecords: 0, hasNext: false, hasPrev: false },
        summary: { total: 0, bySeverity: {}, byOperation: {}, byResourceType: {}, byUser: {} }
      };
    }
  }

  /**
   * 按字段分组
   */
  groupBy(array, field) {
    return array.reduce((acc, item) => {
      const key = item[field];
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * 获取所有日志文件（包括压缩文件）
   */
  getLogFiles() {
    const files = fs.readdirSync(AUDIT_LOGS_DIR);
    return files
      .filter(file => file.startsWith('audit-log-') && (file.endsWith('.jsonl') || file.endsWith('.jsonl.gz')))
      .map(file => path.join(AUDIT_LOGS_DIR, file));
  }

  /**
   * 获取操作统计
   */
  getStatistics(options = {}) {
    try {
      const queryResult = this.queryLogs(options.filters || {});
      
      const stats = {
        totalOperations: queryResult.pagination.totalRecords,
        operationsByType: queryResult.summary.byOperation,
        resourcesByType: queryResult.summary.byResourceType,
        usersByActivity: queryResult.summary.byUser,
        severityDistribution: queryResult.summary.bySeverity,
        dailyActivity: this.getDailyActivity(queryResult.logs),
        topUsers: this.getTopUsers(queryResult.logs),
        topResources: this.getTopResources(queryResult.logs)
      };

      return stats;
    } catch (error) {
      console.error('❌ Failed to get audit statistics:', error.message);
      return {};
    }
  }

  /**
   * 获取每日活动统计
   */
  getDailyActivity(logs) {
    const dailyStats = {};
    
    logs.forEach(log => {
      const date = new Date(log.timestamp).toISOString().split('T')[0];
      dailyStats[date] = (dailyStats[date] || 0) + 1;
    });
    
    return dailyStats;
  }

  /**
   * 获取活跃用户排名
   */
  getTopUsers(logs, limit = 10) {
    const userCounts = this.groupBy(logs, 'userName');
    return Object.entries(userCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([userName, count]) => ({ userName, count }));
  }

  /**
   * 获取热门资源排名
   */
  getTopResources(logs, limit = 10) {
    const resourceCounts = this.groupBy(logs, 'resourceId');
    return Object.entries(resourceCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([resourceId, count]) => ({ resourceId, count }));
  }

  /**
   * 检查合规性
   */
  checkCompliance() {
    try {
      // 获取最近7天的日志
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      const queryResult = this.queryLogs({
        startDate: oneWeekAgo.toISOString()
      });
      
      const complianceIssues = [];
      
      // 检查是否有未授权的操作
      if (queryResult.logs && Array.isArray(queryResult.logs)) {
        queryResult.logs.forEach(log => {
          if (log.operation === 'DELETE' && log.resourceType === 'task' && !log.details.authorized) {
            complianceIssues.push({
              id: log.id,
              timestamp: log.timestamp,
              issue: 'Unauthorized deletion',
              details: log
            });
          }
          
          // 检查敏感数据访问
          if (log.operation === 'READ' && log.resourceType === 'user' && log.severity === 'CRITICAL') {
            complianceIssues.push({
              id: log.id,
              timestamp: log.timestamp,
              issue: 'Sensitive data access',
              details: log
            });
          }
        });
      }
      
      return {
        compliant: complianceIssues.length === 0,
        issues: complianceIssues,
        totalLogs: queryResult.pagination.totalRecords,
        complianceRate: queryResult.pagination.totalRecords > 0 
          ? ((queryResult.pagination.totalRecords - complianceIssues.length) / queryResult.pagination.totalRecords * 100).toFixed(2) + '%'
          : '100%'
      };
    } catch (error) {
      console.error('❌ Failed to check compliance:', error.message);
      return { compliant: false, issues: [], totalLogs: 0, complianceRate: '0%' };
    }
  }

  /**
   * 导出审计日志
   * @param {Object} filters - 导出过滤器
   * @param {string} format - 导出格式 (json, csv, excel)
   * @returns {string} - 导出文件路径
   */
  exportLogs(filters = {}, format = 'json') {
    try {
      const { logs } = this.queryLogs(filters);

      if (logs.length === 0) {
        throw new Error('No logs found for export');
      }

      let content;
      let extension;

      if (format.toLowerCase() === 'csv') {
        content = this.convertToCSV(logs);
        extension = 'csv';
      } else if (format.toLowerCase() === 'excel') {
        // 这里可以集成Excel库，暂时返回CSV
        content = this.convertToCSV(logs);
        extension = 'csv';
      } else {
        content = JSON.stringify(logs, null, 2);
        extension = 'json';
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_');
      const exportFileName = `audit-logs-export-${timestamp}.${extension}`;
      const exportPath = path.join(AUDIT_LOGS_DIR, exportFileName);

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

    const headers = [
      'ID', 'Timestamp', 'Operation', 'Resource Type', 'Resource ID', 
      'User ID', 'User Name', 'Severity', 'IP', 'Success', 'Details'
    ];
    
    const rows = [headers.join(',')];

    for (const log of logs) {
      const row = [
        `"${log.id || ''}"`,
        `"${log.timestamp || ''}"`,
        `"${log.operation || ''}"`,
        `"${log.resourceType || ''}"`,
        `"${log.resourceId || ''}"`,
        `"${log.userId || ''}"`,
        `"${log.userName || ''}"`,
        `"${log.severity || ''}"`,
        `"${log.ip || ''}"`,
        `"${log.success || ''}"`,
        `"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * 获取实时审计指标
   */
  getRealtimeMetrics() {
    try {
      // 获取最近1小时的日志
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      
      const queryResult = this.queryLogs({
        startDate: oneHourAgo.toISOString()
      });
      
      const metrics = {
        totalLastHour: queryResult.pagination.totalRecords,
        errorCount: Object.keys(queryResult.summary.bySeverity).reduce((sum, severity) => {
          if (['ERROR', 'CRITICAL'].includes(severity)) {
            return sum + (queryResult.summary.bySeverity[severity] || 0);
          }
          return sum;
        }, 0),
        operationsPerMinute: queryResult.pagination.totalRecords > 0 
          ? (queryResult.pagination.totalRecords / 60).toFixed(2)
          : 0,
        topOperations: Object.entries(queryResult.summary.byOperation)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([op, count]) => ({ operation: op, count })),
        topUsers: Object.entries(queryResult.summary.byUser)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([user, count]) => ({ user, count }))
      };

      return metrics;
    } catch (error) {
      console.error('❌ Failed to get realtime metrics:', error.message);
      return {};
    }
  }

  /**
   * 清理过期日志
   */
  cleanupOldLogs(days = this.retentionDays) {
    this.cleanupExpiredLogs(); // 使用内部的清理方法
  }
}

// 导出审计记录器
module.exports = EnhancedAuditLogger;