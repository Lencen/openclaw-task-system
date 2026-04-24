/**
 * Subagent 工作记录汇总中间件
 * 
 * 实现 subagent 执行记录汇总到主 agent
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const WORK_LOGS_FILE = path.join(DATA_DIR, 'subagent-work-logs.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 初始化工作日志数据
if (!fs.existsSync(WORK_LOGS_FILE)) {
  fs.writeFileSync(WORK_LOGS_FILE, JSON.stringify({ logs: [] }, null, 2));
}

/**
 * 创建工作记录
 * @param {Object} log - 工作记录
 * @param {string} log.sessionKey - Subagent 会话 ID
 * @param {string} log.agentId - Agent ID
 * @param {string} log.agentName - Agent 名称
 * @param {string} log.parentSessionKey - 主 Agent 会话 ID
 * @param {string} log.taskId - 关联任务 ID
 * @param {string} log.action - 动作类型
 * @param {string} log.detail - 动作详情
 * @param {Object} log.output - 输出结果
 * @param {Object} log.metrics - 性能指标
 * @returns {Object} 创建结果
 */
function createWorkLog(log) {
  const logEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    sessionKey: log.sessionKey,
    agentId: log.agentId,
    agentName: log.agentName || log.agentId,
    parentSessionKey: log.parentSessionKey || null,
    taskId: log.taskId || null,
    action: log.action,
    detail: log.detail || '',
    output: log.output || null,
    metrics: log.metrics || null,
    timestamp: new Date().toISOString(),
    duration: log.duration || null
  };
  
  // 保存日志
  const data = JSON.parse(fs.readFileSync(WORK_LOGS_FILE, 'utf8'));
  data.logs.push(logEntry);
  fs.writeFileSync(WORK_LOGS_FILE, JSON.stringify(data, null, 2));
  
  return logEntry;
}

/**
 * 获取 Subagent 的所有工作记录
 * @param {string} sessionKey - Subagent 会话 ID
 * @returns {Object[]} 工作记录列表
 */
function getSubagentLogs(sessionKey) {
  const data = JSON.parse(fs.readFileSync(WORK_LOGS_FILE, 'utf8'));
  return data.logs.filter(l => l.sessionKey === sessionKey);
}

/**
 * 获取主 Agent 汇总的工作记录
 * @param {string} parentSessionKey - 主 Agent 会话 ID
 * @returns {Object} 汇总结果
 */
function getAggregatedLogs(parentSessionKey) {
  const data = JSON.parse(fs.readFileSync(WORK_LOGS_FILE, 'utf8'));
  
  // 查找所有子 Agent 的日志
  const subagentLogs = data.logs.filter(l => l.parentSessionKey === parentSessionKey);
  
  // 按会话分组
  const bySession = {};
  subagentLogs.forEach(log => {
    if (!bySession[log.sessionKey]) {
      bySession[log.sessionKey] = {
        sessionKey: log.sessionKey,
        agentId: log.agentId,
        agentName: log.agentName,
        taskId: log.taskId,
        logs: [],
        startTime: null,
        endTime: null,
        totalActions: 0,
        totalDuration: 0
      };
    }
    
    bySession[log.sessionKey].logs.push(log);
    bySession[log.sessionKey].totalActions++;
    
    // 更新时间范围
    const logTime = new Date(log.timestamp);
    if (!bySession[log.sessionKey].startTime || logTime < new Date(bySession[log.sessionKey].startTime)) {
      bySession[log.sessionKey].startTime = log.timestamp;
    }
    if (!bySession[log.sessionKey].endTime || logTime > new Date(bySession[log.sessionKey].endTime)) {
      bySession[log.sessionKey].endTime = log.timestamp;
    }
    
    // 累计时长
    if (log.duration) {
      bySession[log.sessionKey].totalDuration += log.duration;
    }
  });
  
  // 计算汇总统计
  const sessions = Object.values(bySession);
  const summary = {
    parentSessionKey,
    totalSubagents: sessions.length,
    totalActions: subagentLogs.length,
    totalDuration: sessions.reduce((sum, s) => sum + s.totalDuration, 0),
    byAgent: {},
    byTask: {}
  };
  
  // 按 Agent 统计
  sessions.forEach(s => {
    if (!summary.byAgent[s.agentId]) {
      summary.byAgent[s.agentId] = {
        agentName: s.agentName,
        sessionCount: 0,
        actionCount: 0,
        duration: 0
      };
    }
    summary.byAgent[s.agentId].sessionCount++;
    summary.byAgent[s.agentId].actionCount += s.totalActions;
    summary.byAgent[s.agentId].duration += s.totalDuration;
  });
  
  // 按任务统计
  sessions.forEach(s => {
    if (s.taskId) {
      if (!summary.byTask[s.taskId]) {
        summary.byTask[s.taskId] = {
          sessionCount: 0,
          actionCount: 0,
          duration: 0
        };
      }
      summary.byTask[s.taskId].sessionCount++;
      summary.byTask[s.taskId].actionCount += s.totalActions;
      summary.byTask[s.taskId].duration += s.totalDuration;
    }
  });
  
  return {
    sessions,
    summary
  };
}

/**
 * 生成工作汇总报告
 * @param {string} parentSessionKey - 主 Agent 会话 ID
 * @returns {Object} 汇总报告
 */
function generateSummaryReport(parentSessionKey) {
  const aggregated = getAggregatedLogs(parentSessionKey);
  
  // 生成文本报告
  let report = `# Subagent 工作汇总报告\n\n`;
  report += `**主会话**: ${parentSessionKey}\n`;
  report += `**生成时间**: ${new Date().toISOString()}\n\n`;
  
  report += `## 概览\n\n`;
  report += `- 启用的 Subagent 数量: ${aggregated.summary.totalSubagents}\n`;
  report += `- 总操作数: ${aggregated.summary.totalActions}\n`;
  report += `- 总执行时长: ${(aggregated.summary.totalDuration / 1000).toFixed(1)}秒\n\n`;
  
  report += `## 按 Agent 统计\n\n`;
  report += `| Agent | 会话数 | 操作数 | 时长(秒) |\n`;
  report += `|-------|--------|--------|----------|\n`;
  Object.entries(aggregated.summary.byAgent).forEach(([agentId, stats]) => {
    report += `| ${stats.agentName} | ${stats.sessionCount} | ${stats.actionCount} | ${(stats.duration / 1000).toFixed(1)} |\n`;
  });
  
  report += `\n## 详细记录\n\n`;
  aggregated.sessions.forEach((session, index) => {
    report += `### Session ${index + 1}: ${session.agentName}\n\n`;
    session.logs.forEach(log => {
      report += `- **${log.action}** (${new Date(log.timestamp).toLocaleTimeString()})\n`;
      if (log.detail) {
        report += `  ${log.detail}\n`;
      }
    });
    report += `\n`;
  });
  
  return {
    parentSessionKey,
    generatedAt: new Date().toISOString(),
    aggregated,
    reportText: report
  };
}

/**
 * 清理过期的工组记录
 * @param {number} maxAge - 最大保留时间（毫秒）
 * @returns {Object} 清理结果
 */
function cleanupOldLogs(maxAge = 7 * 24 * 60 * 60 * 1000) {
  const data = JSON.parse(fs.readFileSync(WORK_LOGS_FILE, 'utf8'));
  const cutoff = Date.now() - maxAge;
  
  const originalCount = data.logs.length;
  data.logs = data.logs.filter(l => new Date(l.timestamp).getTime() > cutoff);
  const removedCount = originalCount - data.logs.length;
  
  fs.writeFileSync(WORK_LOGS_FILE, JSON.stringify(data, null, 2));
  
  return {
    originalCount,
    removedCount,
    remainingCount: data.logs.length
  };
}

/**
 * 记录动作快捷方法
 */
const actions = {
  started: (sessionKey, agentId, parentSessionKey, taskId, detail) => 
    createWorkLog({ sessionKey, agentId, parentSessionKey, taskId, action: 'STARTED', detail }),
  
  progress: (sessionKey, agentId, detail, output) => 
    createWorkLog({ sessionKey, agentId, action: 'PROGRESS', detail, output }),
  
  completed: (sessionKey, agentId, detail, output, duration) => 
    createWorkLog({ sessionKey, agentId, action: 'COMPLETED', detail, output, duration }),
  
  failed: (sessionKey, agentId, detail, error) => 
    createWorkLog({ sessionKey, agentId, action: 'FAILED', detail, output: { error } }),
  
  message: (sessionKey, agentId, detail) => 
    createWorkLog({ sessionKey, agentId, action: 'MESSAGE', detail })
};

module.exports = {
  createWorkLog,
  getSubagentLogs,
  getAggregatedLogs,
  generateSummaryReport,
  cleanupOldLogs,
  actions
};