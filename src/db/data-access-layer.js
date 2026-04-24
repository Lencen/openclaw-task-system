/**
 * 数据访问层 (DAL)
 * 统一数据库访问入口
 */

const SQLiteManager = require('./sqlite-manager');
const path = require('path');

// 错误码定义
const ErrorCodes = {
  DB001: { code: 'DB001', message: '数据库连接失败', status: 500 },
  DB002: { code: 'DB002', message: '写入失败', status: 500 },
  DB003: { code: 'DB003', message: '查询失败', status: 500 },
  DB004: { code: 'DB004', message: '事务冲突', status: 409 },
  DB005: { code: 'DB005', message: '数据不存在', status: 404 },
  DB006: { code: 'DB006', message: '参数验证失败', status: 400 },
  DB007: { code: 'DB007', message: '并发冲突(BUSY)', status: 503 },
};

// 有效的 priority 值
const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3'];

class DataAccessLayer {
  constructor(dbPath) {
    this.manager = new SQLiteManager(dbPath);
    this.manager.connect();
  }

  _error(code, details = '') {
    const errDef = ErrorCodes[code] || ErrorCodes.DB003;
    const error = new Error(`${errDef.message}: ${details}`);
    error.code = code;
    error.status = errDef.status;
    return error;
  }

  // 规范化 priority
  _normalizePriority(priority) {
    if (!priority || !VALID_PRIORITIES.includes(priority)) {
      return 'P2'; // 默认值
    }
    return priority;
  }

  _serialize(obj) {
    if (obj === null || obj === undefined) return null;
    return JSON.stringify(obj);
  }

  _deserialize(str) {
    if (!str) return null;
    try { return JSON.parse(str); } catch (e) { return null; }
  }

  /** 初始化 automation_monitor 字段 */
  _initAutomationMonitor(task, agentId) {
    return {
      enabled: true,
      flow_status: 'idle',
      monitored_objects: [],
      logs: [],
      alerts: [],
      created_at: new Date().toISOString(),
      agent_id: agentId || 'system'
    };
  }

  /** 初始化 audit_log 字段 */
  _initAuditLog() {
    return [];
  }

  /** 从 execution_log 提取日志到 automation_monitor.logs */
  _extractLogsFromExecutionLog(executionLog) {
    if (!executionLog || !Array.isArray(executionLog)) {
      return [];
    }

    return executionLog.map(log => ({
      time: log.timestamp || log.time || new Date().toISOString(),
      event: log.action || 'unknown',
      detail: log.detail || log.result || log.message || '',
      source: log.source || 'execution_log'
    }));
  }

  /** 从 issues 提取警告到 automation_monitor.alerts */
  _extractAlertsFromIssues(issues) {
    if (!issues || !Array.isArray(issues)) {
      return [];
    }

    return issues.map(issue => ({
      time: issue.created_at || new Date().toISOString(),
      type: issue.type || issue.category || 'manual',
      level: issue.severity || issue.priority || 'warning',
      message: issue.title || '',
      description: issue.description || '',
      resolved: issue.status === 'resolved' || issue.status === 'closed',
      source: 'issues'
    }));
  }

  createTask(task) {
    const agentId = task.assigned_agent || task.assignee || null;
    const executionLog = task.execution_log || [];
    const issues = task.issues || [];
    
    // 初始化自动化监控字段
    const automationMonitor = this._initAutomationMonitor(task, agentId);
    
    // 从 execution_log 填充 logs
    const logs = this._extractLogsFromExecutionLog(executionLog);
    if (logs.length > 0) {
      automationMonitor.logs = logs;
    }
    
    // 从 issues 填充 alerts
    const alerts = this._extractAlertsFromIssues(issues);
    if (alerts.length > 0) {
      automationMonitor.alerts = alerts;
    }
    
    // 初始化审计日志
    const auditLog = this._initAuditLog();
    
    // 从 execution_log 转换审计日志记录（任务创建时）
    if (executionLog && Array.isArray(executionLog)) {
      executionLog.forEach(log => {
        if (log.action === 'CREATE') {
          auditLog.push({
            id: `audit-${Date.now()}-create`,
            timestamp: log.timestamp || log.time || new Date().toISOString(),
            agent: log.agent || 'system',
            action: 'CREATE',
            field: 'task',
            before: null,
            after: { title: task.title, status: task.status, priority: task.priority },
            reason: log.detail || '任务创建',
            source: log.source || 'api',
            endpoint: log.sourceDetail || null,
            details: JSON.stringify({ title: task.title, priority: task.priority })
          });
        }
      });
    }
    
    const sql = `INSERT INTO tasks (
      id, title, description, status, priority, quadrant,
      project_id, assigned_agent, user_description, message_hash,
      pretask_id, nexttask_id, is_quick, total_steps, completed_steps,
      assigned_at, failed_at, failed_reason,
      last_status_change_at, status_change_reason,
      created_at, analysis, breakdown, execution_log, issues, related_docs, test_acceptance,
      automation_monitor, audit_log
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      task.id,
      task.title,
      task.description || null,
      task.status || 'pending',
      this._normalizePriority(task.priority),
      task.quadrant || 2,
      task.project_id || task.projectId || null,
      task.assigned_agent || null,
      task.user_description || null,
      task.message_hash || null,
      task.pretask_id || task.preTaskId || null,
      task.nexttask_id || task.nextTaskId || null,
      task.is_quick || task.isQuick ? 1 : 0,
      task.total_steps || 1,
      task.completed_steps || 0,
      task.assigned_at || null,
      task.failed_at || null,
      task.failed_reason || null,
      task.last_status_change_at || null,
      task.status_change_reason || null,
      task.created_at || new Date().toISOString(),
      this._serialize(task.analysis),
      this._serialize(task.breakdown),
      this._serialize(executionLog),
      this._serialize(issues),
      this._serialize(task.related_docs),
      this._serialize(task.test_acceptance),
      this._serialize(automationMonitor),
      this._serialize(auditLog),
    ];

    try {
      const result = this.manager.run(sql, params);
      console.log(`[DAL] ✅ 任务 ${task.id.slice(0, 8)} 已创建，automation_monitor 和 audit_log 已初始化`);
      return result;
    } catch (err) {
      throw this._error('DB002', err.message);
    }
  }

  getTask(id) {
    const sql = 'SELECT * FROM tasks WHERE id = ?';
    try {
      const row = this.manager.get(sql, [id]);
      if (!row) return null;
      return this._parseTask(row);
    } catch (err) {
      throw this._error('DB003', err.message);
    }
  }

  _parseTask(row) {
    return {
      ...row,
      is_quick: row.is_quick === 1,
      analysis: this._deserialize(row.analysis),
      breakdown: this._deserialize(row.breakdown),
      execution_log: this._deserialize(row.execution_log),
      issues: this._deserialize(row.issues),
      related_docs: this._deserialize(row.related_docs),
      test_acceptance: this._deserialize(row.test_acceptance),
      process_validation: this._deserialize(row.process_validation),
      quality_acceptance: this._deserialize(row.quality_acceptance),
      reflection: this._deserialize(row.reflection),
      automation_monitor: this._deserialize(row.automation_monitor),
      audit_monitor: this._deserialize(row.audit_monitor),
      audit_log: this._deserialize(row.audit_log),
    };
  }

  listTasks(filter = {}) {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];
    if (filter.status) { sql += ' AND status = ?'; params.push(filter.status); }
    if (filter.project_id || filter.projectId) { sql += ' AND project_id = ?'; params.push(filter.project_id || filter.projectId); }
    sql += ' ORDER BY created_at DESC';
    try {
      return this.manager.all(sql, params).map(row => this._parseTask(row));
    } catch (err) {
      throw this._error('DB003', err.message);
    }
  }

  /** 生成审计日志记录 */
  /**
   * 生成审计日志记录 - 增强版
   * 记录完整的自动化流程信息
   */
  _generateAuditLogEntry(action, field, before, after, reason, agentId, options = {}) {
    const { service, endpoint, source, target_agent, event, details } = options;
    return {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: new Date().toISOString(),
      // 核心信息
      agent: agentId || 'unknown',
      action: action || 'UNKNOWN',
      field: field || null,
      before: before,
      after: after,
      reason: reason || '状态更新',
      // 增强信息（自动化流程）
      source: source || this._inferSource(agentId),
      service: service || this._inferService(agentId),
      endpoint: endpoint || null,
      target_agent: target_agent || this._extractTargetAgent(after),
      event: event || null,
      details: details || null
    };
  }

  /**
   * 生成自动化监控日志 - 增强版
   */
  _generateMonitorLogEntry(event, detail, source, agentId, options = {}) {
    const { service, endpoint, target_agent, event_type, triggered_by } = options;
    return {
      time: new Date().toISOString(),
      event: event || 'UNKNOWN',
      detail: detail || '',
      // 增强信息
      source: source || this._inferSource(agentId),
      service: service || this._inferService(agentId),
      endpoint: endpoint || null,
      agent: agentId || null,
      target_agent: target_agent || this._extractTargetAgent(detail),
      event_type: event_type || null,
      triggered_by: triggered_by || null
    };
  }

  /** 从 agentId 推断来源 */
  _inferSource(agentId) {
    if (!agentId) return 'api';
    const knownSources = ['auto-task-assigner', 'federation', 'agent-im-server', 'task-completion-monitor', 'issue-scanner', 'unified-task-dispatcher'];
    return knownSources.includes(agentId) ? agentId : 'api';
  }

  /** 从 agentId 推断服务名称 */
  _inferService(agentId) {
    if (!agentId) return null;
    const serviceMap = {
      'auto-task-assigner': 'auto-task-assigner',
      'federation': 'federation-channel-api',
      'agent-im-server': 'agent-im-server',
      'task-completion-monitor': 'task-completion-monitor',
      'issue-scanner': 'issue-scanner',
      'unified-task-dispatcher': 'unified-task-dispatcher'
    };
    return serviceMap[agentId] || null;
  }

  /** 从值中提取目标 agent */
  _extractTargetAgent(value) {
    if (!value) return null;
    if (typeof value === 'string') {
      // 常见 agent 名称模式
      const agentMatch = value.match(/\b(coder|fast|deep|main|chat|test|office)\b/i);
      if (agentMatch) return agentMatch[1].toLowerCase();
    }
    if (typeof value === 'object') {
      if (value.assigned_agent) return value.assigned_agent;
      if (value.target_agent) return value.target_agent;
    }
    return null;
  }

  updateTask(id, updates, options = {}) {
    const { 
      skipAudit = false, 
      agentId = 'system', 
      reason = null,
      service = null,
      endpoint = null,
      source = null,
      target_agent = null,
      event = null,
      details = null,
      event_type = null,
      triggered_by = null
    } = options;
    const fields = [];
    const params = [];
    const mappings = {
      title: 'title', description: 'description', status: 'status',
      priority: 'priority', quadrant: 'quadrant',
      project_id: 'project_id', projectId: 'project_id',
      assigned_agent: 'assigned_agent',
      assigned_at: 'assigned_at',  // 任务分配时间 (v6.2)
      triggered_by: 'triggered_by',  // 任务触发者
      assigned_by: 'assigned_by',  // 任务分配者
      started_at: 'started_at', completed_at: 'completed_at',
      completion_reason: 'completion_reason',  // 任务完成原因
      failed_at: 'failed_at',  // 任务失败时间 (v6.2)
      failed_reason: 'failed_reason',  // 任务失败原因 (v6.2)
      last_status_change_at: 'last_status_change_at',  // 最后状态变更时间 (v6.2)
      status_change_reason: 'status_change_reason',  // 状态变更原因 (v6.2)
      is_quick: 'is_quick', total_steps: 'total_steps',
      completed_steps: 'completed_steps', created_at: 'created_at',
      pretask_id: 'pretask_id', preTaskId: 'pretask_id',
      nexttask_id: 'nexttask_id', nextTaskId: 'nexttask_id',
      user_description: 'user_description',
      // Subagent 监控字段
      subagent_session: 'subagent_session',
      subagent_status: 'subagent_status',
      background: 'background',
      user_request: 'user_request',
      breakdown: 'breakdown',
      monitoring_requirements: 'monitoring_requirements',
      logging_requirements: 'logging_requirements',
      testing_requirements: 'testing_requirements',
      // 新增字段（2026-03-31）
      audit_log: 'audit_log',
      automation_monitor: 'automation_monitor',
      analysis_details: 'analysis_details',
      collaboration: 'collaboration',
      conclusion: 'conclusion',
      duration_human: 'duration_human',
      duration_minutes: 'duration_minutes',
      input_tokens: 'input_tokens',
      output_tokens: 'output_tokens',
      plan: 'plan',
      process_validation: 'process_validation',
      quality_acceptance: 'quality_acceptance',
      reflection: 'reflection',
      tool_calls: 'tool_calls',
      tool_stats: 'tool_stats',
      total_tokens: 'total_tokens',
      reflection_status: 'reflection_status',
    };
    const jsonFieldsSet = new Set(['analysis', 'breakdown', 'execution_log', 'issues', 'related_docs', 'test_acceptance',
      'audit_log', 'automation_monitor', 'analysis_details', 'collaboration', 'plan',
      'process_validation', 'quality_acceptance', 'reflection', 'tool_calls', 'tool_stats']);
    
    for (const [key, field] of Object.entries(mappings)) {
      // 跳过 JSON 字段，由后面的 jsonFields 循环处理
      if (jsonFieldsSet.has(key)) continue;
      if (updates[key] !== undefined) {
        fields.push(`${field} = ?`);
        if (key === 'priority') {
          params.push(this._normalizePriority(updates[key]));
        } else if (key === 'is_quick') {
          params.push(updates[key] ? 1 : 0);
        } else {
          params.push(updates[key]);
        }
      }
    }
    const jsonFields = ['analysis', 'breakdown', 'execution_log', 'issues', 'related_docs', 'test_acceptance',
      'analysis_details', 'collaboration', 'plan',
      'process_validation', 'quality_acceptance', 'reflection', 'tool_calls', 'tool_stats'];
    // 注意：audit_log 和 automation_monitor 由自动审计逻辑处理，不在此处处理
    for (const field of jsonFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(this._serialize(updates[field]));
      }
    }
    // ========== 状态机保护：检查状态变更是否合法 ==========
    const currentTask = this.getTask(id);
    if (currentTask && updates.status) {
      // v7.0 状态机 - 增加 reflection_pending, completed
      const validTransitions = {
        'pending': ['assigned', 'cancelled'],
        'assigned': ['doing', 'cancelled'],
        'doing': ['completed', 'reflection_pending', 'failed', 'pending'],  // v7.1: 允许 doing → completed
        'completed': ['reflection_pending', 'done'],  // v7.1: completed 可转为 reflection_pending 或 done
        'reflection_pending': ['done', 'failed'],  // v7.0: 反思完成后才能 done
        'done': [],
        'failed': ['pending'],
        'cancelled': []
      };
      const allowed = validTransitions[currentTask.status] || [];
      if (!allowed.includes(updates.status)) {
        console.warn(`[DAL] ⚠️ 拒绝非法状态变更: ${currentTask.status} → ${updates.status} (任务: ${id})`);
        throw new Error(`Invalid status transition: ${currentTask.status} → ${updates.status}`);
      }

      // v7.0: reflection_pending → done 必须填写 reflection
      if (currentTask.status === 'reflection_pending' && updates.status === 'done') {
        const reflection = currentTask.reflection || updates.reflection;
        if (!reflection || (typeof reflection === 'object' && !reflection.content && !reflection.thought)) {
          console.warn(`[DAL] ⚠️ 拒绝完成: 任务 ${id} 需要填写 reflection 才能标记为 done`);
          throw new Error('请先完成 reflection（反思）后才能标记任务为完成');
        }
      }
    }
    
    // ========== 自动添加审计日志和监控日志 ==========
    if (!skipAudit) {
      // 获取当前任务状态
      const stack = new Error().stack;
      const caller = stack.split('\n')[2]?.trim() || 'unknown';
      console.log(`[DAL] 更新任务 ${id}: status=${updates.status}, currentStatus=${currentTask?.status}, caller=${caller}`);
      if (currentTask) {
        // 收集审计日志记录
        const auditEntries = [];
        const monitorLogs = [];
        
        // 状态变更记录
        if (updates.status && updates.status !== currentTask.status) {
          // 提取目标 agent
          const extractedTargetAgent = target_agent || updates.assigned_agent || null;
          const logOptions = { 
            service, 
            endpoint, 
            source, 
            target_agent: extractedTargetAgent,
            event: 'status_change',
            details: { previousStatus: currentTask.status, newStatus: updates.status }
          };
          
          auditEntries.push(this._generateAuditLogEntry(
            'STATUS_CHANGE',
            'status',
            currentTask.status,
            updates.status,
            reason || `状态变更: ${currentTask.status} → ${updates.status}`,
            agentId,
            logOptions
          ));
          
          const monitorOptions = {
            service,
            endpoint,
            target_agent: extractedTargetAgent,
            event_type: 'status_change',
            triggered_by
          };
          monitorLogs.push(this._generateMonitorLogEntry(
            'STATUS_CHANGE',
            `状态变更: ${currentTask.status} → ${updates.status}`,
            source || agentId,
            agentId,
            monitorOptions
          ));
        }

        // 其他重要字段变更
        const importantFields = ['priority', 'assigned_agent', 'project_id', 'breakdown'];
        for (const field of importantFields) {
          if (updates[field] !== undefined && JSON.stringify(updates[field]) !== JSON.stringify(currentTask[field])) {
            const logOptions = { 
              service, 
              endpoint, 
              source, 
              target_agent: field === 'assigned_agent' ? updates[field] : null,
              event: 'field_update',
              details: { field }
            };
            auditEntries.push(this._generateAuditLogEntry(
              'FIELD_UPDATE',
              field,
              currentTask[field],
              updates[field],
              reason || `字段 ${field} 更新`,
              agentId,
              logOptions
            ));
          }
        }

        // 合并审计日志
        if (auditEntries.length > 0) {
          const existingAuditLog = currentTask.audit_log || [];
          const newAuditLog = [...existingAuditLog, ...auditEntries];
          // 检查是否已经在 jsonFields 循环中处理
          const auditFieldExists = fields.some(f => f.startsWith('audit_log'));
          if (!auditFieldExists) {
            fields.push('audit_log = ?');
            params.push(this._serialize(newAuditLog));
          }
        }

        // 合并监控日志
        if (monitorLogs.length > 0) {
          const existingMonitor = currentTask.automation_monitor || this._initAutomationMonitor(currentTask, agentId);
          existingMonitor.logs = [...(existingMonitor.logs || []), ...monitorLogs];
          existingMonitor.flow_status = updates.status === 'done' ? 'completed' : 
                                          updates.status === 'doing' ? 'running' : 'idle';
          const monitorFieldExists = fields.some(f => f.startsWith('automation_monitor'));
          if (!monitorFieldExists) {
            fields.push('automation_monitor = ?');
            params.push(this._serialize(existingMonitor));
          }
        }

        // ========== 任务完成时自动触发反思 ==========
        if (updates.status === 'done' && currentTask.status !== 'done' && !currentTask.reflection) {
          console.log(`[DAL] 🤔 任务 ${id} 完成，触发反思机制`);
          // 创建初始反思记录
          const reflection = {
            triggered_at: new Date().toISOString(),
            status: 'pending', // pending, completed, failed
            context: {
              task_title: currentTask.title,
              task_status: 'done',
              completed_at: new Date().toISOString(),
              agent_id: agentId
            },
            reflection_data: null, // 由反思 Agent 填充
            improvements: [], // 改进项列表
            evolution_trigger: null // 是否触发进化
          };
          const reflectionFieldExists = fields.some(f => f.startsWith('reflection'));
          if (!reflectionFieldExists) {
            fields.push('reflection = ?');
            params.push(this._serialize(reflection));
          }
        }
      }
    }

    if (fields.length === 0) return { changes: 0 };
    params.push(id);
    try {
      const result = this.manager.run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, params);
      console.log(`[DAL] ✅ 任务 ${id.slice(0, 8)} 更新成功，更新字段: ${fields.length} 个${!skipAudit ? ', audit_log/monitor 已更新' : ''}`);
      return result;
    } catch (err) {
      throw this._error('DB002', err.message);
    }
  }

  deleteTask(id) {
    try {
      return this.manager.run('DELETE FROM tasks WHERE id = ?', [id]);
    } catch (err) {
      throw this._error('DB002', err.message);
    }
  }

  countTasks(filter = {}) {
    let sql = 'SELECT COUNT(*) as count FROM tasks WHERE 1=1';
    const params = [];
    if (filter.status) { sql += ' AND status = ?'; params.push(filter.status); }
    if (filter.project_id || filter.projectId) { sql += ' AND project_id = ?'; params.push(filter.project_id || filter.projectId); }
    try {
      return this.manager.get(sql, params).count;
    } catch (err) {
      throw this._error('DB003', err.message);
    }
  }

  checkDuplicateTask(messageHash, minutes = 60) {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const sql = 'SELECT * FROM tasks WHERE message_hash = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1';
    try {
      console.log(`[DEDUP] 检查重复: hash=${messageHash}, cutoff=${cutoff}`);
      const result = this.manager.get(sql, [messageHash, cutoff]);
      if (result) {
        console.log(`[DEDUP] ⚠️ 发现重复任务: ${result.id}, 创建于 ${result.created_at}`);
      } else {
        console.log(`[DEDUP] ✅ 未发现重复任务`);
      }
      return result;
    } catch (err) {
      throw this._error('DB003', err.message);
    }
  }

  transaction(fn) { return this.manager.transaction(fn); }
  close() { this.manager.close(); }
}

let instance = null;
function getDAL(dbPath) {
  if (!instance) {
    instance = new DataAccessLayer(dbPath || path.join(__dirname, '../../data/tasks.db'));
  }
  return instance;
}

module.exports = { DataAccessLayer, getDAL, ErrorCodes };
