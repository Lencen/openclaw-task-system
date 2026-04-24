/**
 * 增强版执行日志系统
 * 功能：记录任务执行过程中的详细信息，支持实时监控和性能分析
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '../data');
const EXECUTION_LOGS_DIR = path.join(DATA_DIR, 'execution-logs');
const MAIN_EXECUTION_LOG_FILE = path.join(EXECUTION_LOGS_DIR, 'main-execution-log.jsonl');
const COMPLETED_TASKS_LOG = path.join(EXECUTION_LOGS_DIR, 'completed-tasks-execution.jsonl');
const FAILED_TASKS_LOG = path.join(EXECUTION_LOGS_DIR, 'failed-tasks-execution.jsonl');

// 确保日志目录存在
if (!fs.existsSync(EXECUTION_LOGS_DIR)) {
  fs.mkdirSync(EXECUTION_LOGS_DIR, { recursive: true });
}

class EnhancedExecutionLogger {
  constructor(options = {}) {
    this.logFile = MAIN_EXECUTION_LOG_FILE;
    this.maxFileSize = options.maxFileSize || 50 * 1024 * 1024; // 50MB
    this.retentionDays = options.retentionDays || 30; // 保留30天
    this.ensureLogFileExists();
    this.activeTasks = new Map(); // 追踪活跃任务
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
    return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 记录任务开始执行
   */
  logTaskStart(taskId, agentId, details = {}) {
    const executionEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      eventType: 'TASK_START',
      taskId,
      agentId,
      details,
      startTime: Date.now()
    };

    this.activeTasks.set(taskId, executionEntry.startTime);
    
    this.writeLog(executionEntry);
    console.log(`▶️ [Execution] Task ${taskId} started by ${agentId}`);
    
    return executionEntry.id;
  }

  /**
   * 记录任务执行步骤
   */
  logTaskStep(taskId, step, status, details = {}) {
    const executionEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      eventType: 'TASK_STEP',
      taskId,
      step,
      status, // 'start', 'progress', 'complete', 'error'
      details
    };

    this.writeLog(executionEntry);
    
    const statusText = {
      'start': 'started',
      'progress': 'in progress',
      'complete': 'completed',
      'error': 'error'
    }[status] || status;
    
    console.log(`📝 [Execution] Task ${taskId} step '${step}' ${statusText}`);
    
    return executionEntry.id;
  }

  /**
   * 记录任务执行结果
   */
  logTaskResult(taskId, result, error = null, durationMs = null) {
    const startTime = this.activeTasks.get(taskId);
    const actualDuration = durationMs || (startTime ? Date.now() - startTime : null);
    
    const executionEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      eventType: 'TASK_RESULT',
      taskId,
      result, // 'success', 'failure', 'timeout', 'cancelled'
      error: error || null,
      durationMs: actualDuration,
      details: {
        success: result === 'success',
        error: error,
        durationMs: actualDuration
      }
    };

    // 写入主日志
    this.writeLog(executionEntry);
    
    // 根据结果写入不同的日志文件
    if (result === 'success') {
      this.writeCompletedTaskLog(executionEntry);
    } else {
      this.writeFailedTaskLog(executionEntry);
    }
    
    // 从活跃任务中移除
    this.activeTasks.delete(taskId);
    
    const resultText = result === 'success' ? '✅' : '❌';
    console.log(`${resultText} [Execution] Task ${taskId} ${result} (${actualDuration ? actualDuration + 'ms' : 'unknown duration'})`);
    
    return executionEntry.id;
  }

  /**
   * 记录工具调用
   */
  logToolCall(taskId, toolName, params, result, durationMs = null) {
    const executionEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      eventType: 'TOOL_CALL',
      taskId,
      toolName,
      params,
      result,
      durationMs,
      details: {
        success: !result?.error,
        error: result?.error
      }
    };

    this.writeLog(executionEntry);
    
    const status = result?.error ? '❌' : '✅';
    console.log(`${status} [Execution] Tool ${toolName} called for task ${taskId} (${durationMs ? durationMs + 'ms' : 'unknown duration'})`);
    
    return executionEntry.id;
  }

  /**
   * 记录性能指标
   */
  logPerformance(taskId, metrics) {
    const executionEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      eventType: 'PERFORMANCE',
      taskId,
      metrics,
      details: metrics
    };

    this.writeLog(executionEntry);
    console.log(`📊 [Execution] Performance metrics for task ${taskId}:`, metrics);
    
    return executionEntry.id;
  }

  /**
   * 写入主日志
   */
  writeLog(entry) {
    try {
      // 检查文件大小，如果过大则轮转
      this.rotateLogFileIfNeeded();

      // 追加到日志文件（JSONL格式）
      fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
    } catch (error) {
      console.error('❌ Failed to write execution log:', error.message);
    }
  }

  /**
   * 写入已完成任务日志
   */
  writeCompletedTaskLog(entry) {
    try {
      fs.appendFileSync(COMPLETED_TASKS_LOG, JSON.stringify(entry) + '\n');
    } catch (error) {
      console.error('❌ Failed to write completed task log:', error.message);
    }
  }

  /**
   * 写入失败任务日志
   */
  writeFailedTaskLog(entry) {
    try {
      fs.appendFileSync(FAILED_TASKS_LOG, JSON.stringify(entry) + '\n');
    } catch (error) {
      console.error('❌ Failed to write failed task log:', error.message);
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
      console.error('Error checking execution log file size:', error.message);
    }
  }

  /**
   * 轮转日志文件
   */
  rotateLogFile() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
      const rotatedFilename = path.join(EXECUTION_LOGS_DIR, `execution-log-${timestamp}.jsonl`);
      
      // 移动当前文件到轮转文件
      fs.renameSync(this.logFile, rotatedFilename);
      
      // 创建新的主日志文件
      this.ensureLogFileExists();
      
      console.log(`✅ Execution log rotated to: ${rotatedFilename}`);
      
      // 清理过期日志
      this.cleanupExpiredLogs();
    } catch (error) {
      console.error('Error rotating execution log file:', error.message);
    }
  }

  /**
   * 清理过期日志
   */
  cleanupExpiredLogs() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
      
      // 清理执行日志文件
      const files = fs.readdirSync(EXECUTION_LOGS_DIR);
      files.forEach(file => {
        if ((file.startsWith('execution-log-') && file.endsWith('.jsonl')) ||
            (file.startsWith('completed-tasks-execution') && file.endsWith('.jsonl')) ||
            (file.startsWith('failed-tasks-execution') && file.endsWith('.jsonl'))) {
          const fullPath = path.join(EXECUTION_LOGS_DIR, file);
          const stat = fs.statSync(fullPath);
          
          if (stat.mtime < cutoffDate) {
            fs.unlinkSync(fullPath);
            console.log(`✅ Expired execution log removed: ${fullPath}`);
          }
        }
      });
    } catch (error) {
      console.error('Error cleaning up expired execution logs:', error.message);
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
            console.warn('Invalid JSON line in execution log:', line);
            return null;
          }
        })
        .filter(Boolean);
    } catch (error) {
      console.error('Error parsing execution log file:', error.message);
      return [];
    }
  }

  /**
   * 查询执行日志
   */
  queryLogs(filters = {}) {
    try {
      // 获取所有日志文件
      const logFiles = this.getLogFiles();
      let allLogs = [];

      // 读取所有日志文件
      for (const file of logFiles) {
        const logs = this.parseJsonlFile(file);
        allLogs = allLogs.concat(logs);
      }

      // 应用过滤器
      let filteredLogs = allLogs;

      if (filters.taskId) {
        filteredLogs = filteredLogs.filter(log => log.taskId === filters.taskId);
      }

      if (filters.eventType) {
        filteredLogs = filteredLogs.filter(log => log.eventType === filters.eventType);
      }

      if (filters.agentId) {
        filteredLogs = filteredLogs.filter(log => log.agentId === filters.agentId);
      }

      if (filters.result) {
        filteredLogs = filteredLogs.filter(log => log.result === filters.result);
      }

      if (filters.toolName) {
        filteredLogs = filteredLogs.filter(log => log.toolName === filters.toolName);
      }

      if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= startDate);
      }

      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= endDate);
      }

      // 排序
      const sortBy = filters.sortBy || 'timestamp';
      const order = (filters.order || 'desc').toLowerCase();
      
      filteredLogs.sort((a, b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];
        
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
          byEventType: this.groupBy(filteredLogs, 'eventType'),
          byAgent: this.groupBy(filteredLogs, 'agentId'),
          byResult: this.groupBy(filteredLogs, 'result'),
          byTool: this.groupBy(filteredLogs, 'toolName')
        }
      };
    } catch (error) {
      console.error('❌ Failed to query execution logs:', error.message);
      return { 
        logs: [], 
        pagination: { currentPage: 1, totalPages: 0, totalRecords: 0, hasNext: false, hasPrev: false },
        summary: { total: 0, byEventType: {}, byAgent: {}, byResult: {}, byTool: {} }
      };
    }
  }

  /**
   * 按字段分组
   */
  groupBy(array, field) {
    return array.reduce((acc, item) => {
      const key = item[field];
      if (key) {
        acc[key] = (acc[key] || 0) + 1;
      }
      return acc;
    }, {});
  }

  /**
   * 获取所有日志文件
   */
  getLogFiles() {
    const files = fs.readdirSync(EXECUTION_LOGS_DIR);
    return files
      .filter(file => 
        (file.startsWith('execution-log-') && file.endsWith('.jsonl')) ||
        (file === 'completed-tasks-execution.jsonl') ||
        (file === 'failed-tasks-execution.jsonl')
      )
      .map(file => path.join(EXECUTION_LOGS_DIR, file));
  }

  /**
   * 获取任务执行统计
   */
  getTaskExecutionStats(taskId) {
    try {
      const queryResult = this.queryLogs({ taskId });
      
      const stats = {
        taskId,
        totalEvents: queryResult.pagination.totalRecords,
        eventsByType: queryResult.summary.byEventType,
        duration: this.calculateTaskDuration(queryResult.logs),
        steps: this.extractTaskSteps(queryResult.logs),
        toolsUsed: queryResult.summary.byTool,
        success: queryResult.summary.byResult.success || 0,
        failed: queryResult.summary.byResult.failure || 0,
        errors: queryResult.summary.byResult.error || 0
      };

      return stats;
    } catch (error) {
      console.error('❌ Failed to get task execution stats:', error.message);
      return {};
    }
  }

  /**
   * 计算任务执行时长
   */
  calculateTaskDuration(logs) {
    const startEvent = logs.find(log => log.eventType === 'TASK_START');
    const resultEvent = logs.find(log => log.eventType === 'TASK_RESULT');
    
    if (startEvent && resultEvent && resultEvent.durationMs) {
      return resultEvent.durationMs;
    }
    
    if (startEvent && resultEvent) {
      return new Date(resultEvent.timestamp) - new Date(startEvent.timestamp);
    }
    
    return null;
  }

  /**
   * 提取任务执行步骤
   */
  extractTaskSteps(logs) {
    return logs
      .filter(log => log.eventType === 'TASK_STEP')
      .map(log => ({
        step: log.step,
        status: log.status,
        timestamp: log.timestamp,
        details: log.details
      }));
  }

  /**
   * 获取执行性能统计
   */
  getPerformanceStats(options = {}) {
    try {
      const filters = {
        eventType: 'PERFORMANCE',
        ...options.filters
      };
      
      const queryResult = this.queryLogs(filters);
      
      const performanceData = queryResult.logs.map(log => log.metrics);
      
      const stats = {
        totalPerformanceLogs: queryResult.pagination.totalRecords,
        avgResponseTime: this.calculateAverage(performanceData, 'responseTime'),
        avgProcessingTime: this.calculateAverage(performanceData, 'processingTime'),
        avgMemoryUsage: this.calculateAverage(performanceData, 'memoryUsage'),
        avgCpuUsage: this.calculateAverage(performanceData, 'cpuUsage'),
        successRate: this.calculateSuccessRate(queryResult.logs),
        topPerformers: this.getTopPerformers(queryResult.logs),
        slowestTasks: this.getSlowestTasks(queryResult.logs)
      };

      return stats;
    } catch (error) {
      console.error('❌ Failed to get performance stats:', error.message);
      return {};
    }
  }

  /**
   * 计算平均值
   */
  calculateAverage(data, field) {
    if (data.length === 0) return 0;
    
    const sum = data
      .map(item => item[field])
      .filter(value => typeof value === 'number')
      .reduce((acc, value) => acc + value, 0);
    
    const validValues = data.filter(item => typeof item[field] === 'number');
    return validValues.length > 0 ? sum / validValues.length : 0;
  }

  /**
   * 计算成功率
   */
  calculateSuccessRate(logs) {
    const total = logs.length;
    if (total === 0) return 100;
    
    const successful = logs.filter(log => 
      log.eventType === 'TASK_RESULT' && log.result === 'success'
    ).length;
    
    return Math.round((successful / total) * 100);
  }

  /**
   * 获取高性能执行者
   */
  getTopPerformers(logs, limit = 5) {
    const agentStats = new Map();
    
    logs
      .filter(log => log.eventType === 'TASK_RESULT' && log.durationMs)
      .forEach(log => {
        if (!agentStats.has(log.agentId)) {
          agentStats.set(log.agentId, {
            agentId: log.agentId,
            totalTasks: 0,
            totalDuration: 0,
            avgDuration: 0
          });
        }
        
        const stats = agentStats.get(log.agentId);
        stats.totalTasks++;
        stats.totalDuration += log.durationMs || 0;
        stats.avgDuration = stats.totalDuration / stats.totalTasks;
      });
    
    return Array.from(agentStats.values())
      .sort((a, b) => a.avgDuration - b.avgDuration)
      .slice(0, limit);
  }

  /**
   * 获取最慢的任务
   */
  getSlowestTasks(logs, limit = 5) {
    return logs
      .filter(log => log.eventType === 'TASK_RESULT' && log.durationMs)
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, limit)
      .map(log => ({
        taskId: log.taskId,
        agentId: log.agentId,
        durationMs: log.durationMs,
        result: log.result
      }));
  }

  /**
   * 获取实时执行指标
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
        totalExecutionsLastHour: queryResult.pagination.totalRecords,
        activeTasks: this.activeTasks.size,
        successRate: this.calculateSuccessRate(queryResult.logs),
        avgDuration: this.calculateAverage(
          queryResult.logs.filter(log => log.eventType === 'TASK_RESULT' && log.durationMs),
          'durationMs'
        ),
        topAgents: Object.entries(queryResult.summary.byAgent)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([agent, count]) => ({ agent, count })),
        errorRate: this.getErrorRate(queryResult.logs)
      };

      return metrics;
    } catch (error) {
      console.error('❌ Failed to get realtime metrics:', error.message);
      return {};
    }
  }

  /**
   * 计算错误率
   */
  getErrorRate(logs) {
    const total = logs.length;
    if (total === 0) return 0;
    
    const errors = logs.filter(log => 
      log.eventType === 'TASK_RESULT' && 
      ['failure', 'error', 'timeout'].includes(log.result)
    ).length;
    
    return Math.round((errors / total) * 100);
  }

  /**
   * 获取任务执行轨迹
   */
  getTaskExecutionTrace(taskId) {
    try {
      const queryResult = this.queryLogs({ taskId });
      
      // 按时间排序
      const sortedLogs = queryResult.logs.sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
      
      const trace = {
        taskId,
        timeline: sortedLogs.map(log => ({
          timestamp: log.timestamp,
          eventType: log.eventType,
          step: log.step,
          status: log.status,
          toolName: log.toolName,
          result: log.result,
          details: log.details
        })),
        summary: this.getTaskExecutionStats(taskId)
      };

      return trace;
    } catch (error) {
      console.error('❌ Failed to get task execution trace:', error.message);
      return {};
    }
  }

  /**
   * 获取工具使用统计
   */
  getToolUsageStats(toolName) {
    try {
      const { logs } = this.queryLogs({ 
        eventType: 'TOOL_CALL',
        toolName 
      });
      
      const stats = {
        toolName,
        totalCalls: logs.pagination.totalRecords,
        successRate: this.calculateToolSuccessRate(logs.logs),
        avgDuration: this.calculateAverage(
          logs.logs.filter(log => log.durationMs),
          'durationMs'
        ),
        errorRate: this.getToolErrorRate(logs.logs),
        topTasks: this.getTopTaskUsage(logs.logs)
      };

      return stats;
    } catch (error) {
      console.error('❌ Failed to get tool usage stats:', error.message);
      return {};
    }
  }

  /**
   * 计算工具成功率
   */
  calculateToolSuccessRate(logs) {
    const total = logs.length;
    if (total === 0) return 100;
    
    const successful = logs.filter(log => 
      log.details?.success === true
    ).length;
    
    return Math.round((successful / total) * 100);
  }

  /**
   * 计算工具错误率
   */
  getToolErrorRate(logs) {
    const total = logs.length;
    if (total === 0) return 0;
    
    const errors = logs.filter(log => 
      log.details?.error
    ).length;
    
    return Math.round((errors / total) * 100);
  }

  /**
   * 获取工具使用最多的任务
   */
  getTopTaskUsage(logs, limit = 5) {
    const taskCounts = this.groupBy(logs, 'taskId');
    
    return Object.entries(taskCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([taskId, count]) => ({ taskId, count }));
  }

  /**
   * 获取当前活跃任务列表
   */
  getActiveTasks() {
    const activeList = [];
    
    for (const [taskId, startTime] of this.activeTasks.entries()) {
      activeList.push({
        taskId,
        startTime: new Date(startTime).toISOString(),
        durationMs: Date.now() - startTime
      });
    }
    
    return activeList;
  }

  /**
   * 清理过期日志
   */
  cleanupOldLogs(days = this.retentionDays) {
    this.cleanupExpiredLogs();
  }
}

// 导出执行记录器
module.exports = EnhancedExecutionLogger;