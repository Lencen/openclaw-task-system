/**
 * 问题管理 API 路由
 * 统一的问题管理接口
 * 
 * 2026-03-27: 迁移到 SQLite，使用 DAL
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getIssuesDAL } = require('../db/issues-dal');
const { canAutoFix } = require('../../scripts/issue-scanner.js');
const { getFixQueueDAL } = require('../db/fix-queue-dal.js');
const fixQueueDAL = getFixQueueDAL(path.join(__dirname, '../data/tasks.db'));

// 初始化 DAL
const issuesDAL = getIssuesDAL(path.join(__dirname, '../data/tasks.db'));

// 读取问题数据（使用 DAL）
function readIssues() {
  try {
    const issues = issuesDAL.list();
    // 转换数据库字段名到 API 使用的字段名
    const transformed = issues.map(i => {
    // 计算 autoFixable 属性
    const autoFixable = canAutoFix({
      id: i.id,
      status: i.status || 'open',
      severity: i.severity || 'medium',
      type: i.category || 'bug',
      solution: i.solution,
      category: i.category,
      priority: i.priority
    });
    
    return {
      id: i.id,
      title: i.title,
      status: i.status || 'open',
      severity: i.severity || 'medium',
      type: i.category || 'bug',
      relatedTaskId: i.task_id,
      assignedAgent: i.assignee,
      description: i.description,
      background: i.root_cause,
      reason: i.root_cause,
      solution: i.solution,
      reflection: i.solution,
      recurring: false,
      recurringCount: 1,
      recurringReason: null,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      resolvedAt: i.resolved_at,
      autoFixable: autoFixable
    };
  });
    return {
      issues: transformed,
      stats: calculateStats(transformed),
      lastUpdated: new Date().toISOString()
    };
  } catch (e) {
    console.error('[Issues] 读取数据失败:', e);
    return { issues: [], stats: {}, lastUpdated: null };
  }
}

// 计算统计数据（从数据库获取的 issues 格式中转换）
function calculateStats(issues) {
  // 转换数据库字段名到 API 使用的字段名
  const transformed = issues.map(i => ({
    id: i.id,
    title: i.title,
    status: i.status || 'open',
    severity: i.severity || 'medium',
    type: i.category || 'bug',
    relatedTaskId: i.task_id,
    assignedAgent: i.assignee,
    description: i.description,
    background: i.root_cause,
    reason: i.root_cause,
    solution: i.solution,
    reflection: i.solution,
    recurring: false,
    recurringCount: 1,
    recurringReason: null,
    createdAt: i.created_at,
    resolvedAt: i.resolved_at,
    source: 'system',
    discoverer: i.reporter
  }));
  
  return {
    total: transformed.length,
    open: transformed.filter(i => i.status === 'open').length,
    in_progress: transformed.filter(i => i.status === 'in_progress').length,
    resolved: transformed.filter(i => i.status === 'resolved').length,
    recurring: transformed.filter(i => i.recurring).length,
    bySeverity: {
      critical: transformed.filter(i => i.severity === 'critical').length,
      high: transformed.filter(i => i.severity === 'high').length,
      medium: transformed.filter(i => i.severity === 'medium').length,
      low: transformed.filter(i => i.severity === 'low').length
    },
    byType: {
      bug: transformed.filter(i => i.type === 'bug').length,
      config: transformed.filter(i => i.type === 'config').length,
      performance: transformed.filter(i => i.type === 'performance').length,
      process: transformed.filter(i => i.type === 'process').length,
      integration: transformed.filter(i => i.type === 'integration').length
    }
  };
}

// 写入问题数据（使用 DAL）
function writeIssues(issues) {
  // issues 参数是包含 issues 数组的对象，我们需要逐个处理创建/更新
  if (Array.isArray(issues)) {
    // 如果直接传入数组，可能是旧代码，需要转换
    issues.forEach(issue => {
      // 检查是否已存在
      const existing = issuesDAL.get(issue.id);
      if (existing) {
        // 更新
        issuesDAL.update(issue.id, {
          title: issue.title,
          description: issue.description,
          status: issue.status,
          severity: issue.severity,
          priority: issue.priority || 'P2',
          category: issue.type,
          task_id: issue.relatedTaskId,
          assignee: issue.assignedAgent,
          root_cause: issue.background || issue.reason,
          solution: issue.solution,
          resolved_at: issue.resolvedAt
        });
      } else {
        // 创建
        issuesDAL.create({
          id: issue.id,
          title: issue.title,
          description: issue.description,
          status: issue.status,
          severity: issue.severity,
          priority: issue.priority || 'P2',
          category: issue.type,
          task_id: issue.relatedTaskId,
          assignee: issue.assignedAgent,
          root_cause: issue.background || issue.reason,
          solution: issue.solution,
          created_at: issue.createdAt,
          resolved_at: issue.resolvedAt
        });
      }
    });
  } else if (issues.issues && Array.isArray(issues.issues)) {
    // 新对象格式
    issues.issues.forEach(issue => {
      const existing = issuesDAL.get(issue.id);
      if (existing) {
        issuesDAL.update(issue.id, {
          title: issue.title,
          description: issue.description,
          status: issue.status,
          severity: issue.severity,
          priority: issue.priority || 'P2',
          category: issue.type,
          task_id: issue.relatedTaskId,
          assignee: issue.assignedAgent,
          root_cause: issue.background || issue.reason,
          solution: issue.solution,
          resolved_at: issue.resolvedAt
        });
      } else {
        issuesDAL.create({
          id: issue.id,
          title: issue.title,
          description: issue.description,
          status: issue.status,
          severity: issue.severity,
          priority: issue.priority || 'P2',
          category: issue.type,
          task_id: issue.relatedTaskId,
          assignee: issue.assignedAgent,
          root_cause: issue.background || issue.reason,
          solution: issue.solution,
          created_at: issue.createdAt,
          resolved_at: issue.resolvedAt
        });
      }
    });
  }
}

// 更新统计数据（无需操作，-stats 是计算出来的）
function updateStats(data) {
  // 统计数据是计算出来的，无需写入
  return true;
}

// 获取问题列表
router.get('/', (req, res) => {
  const data = readIssues();
  let issues = data.issues || [];
  
  // 支持筛选
  const { status, severity, type, taskId, recurring } = req.query;
  
  if (status) {
    issues = issues.filter(i => i.status === status);
  }
  if (severity) {
    issues = issues.filter(i => i.severity === severity);
  }
  if (type) {
    issues = issues.filter(i => i.type === type);
  }
  if (taskId) {
    issues = issues.filter(i => i.relatedTaskId === taskId);
  }
  if (recurring === 'true') {
    issues = issues.filter(i => i.recurring);
  }
  
  // 支持排序
  const sortBy = req.query.sortBy || 'createdAt';
  const sortOrder = req.query.sortOrder || 'desc';
  issues.sort((a, b) => {
    const aVal = a[sortBy] || '';
    const bVal = b[sortBy] || '';
    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });
  
  res.json({ 
    success: true, 
    issues, 
    stats: data.stats,
    total: issues.length 
  });
});

// 获取单个问题详情
router.get('/:id', (req, res) => {
  const data = readIssues();
  const issue = (data.issues || []).find(i => i.id === req.params.id);
  
  if (issue) {
    res.json({ success: true, issue });
  } else {
    res.status(404).json({ success: false, error: '问题不存在' });
  }
});

// 创建问题
router.post('/', (req, res) => {
  const data = readIssues();
  const issues = data.issues || [];
  
  const newIssue = {
    id: 'issue-' + Date.now().toString(36),
    title: req.body.title,
    status: req.body.status || 'open',
    severity: req.body.severity || 'medium',
    type: req.body.type || 'bug',
    relatedTaskId: req.body.relatedTaskId || null,
    assignedAgent: req.body.assignedAgent || null,
    description: req.body.description || '',
    background: req.body.background || '',
    reason: req.body.reason || '',
    solution: req.body.solution || '',
    reflection: req.body.reflection || '',
    recurring: false,
    recurringCount: 1,
    recurringReason: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    source: req.body.source || 'user_feedback',
    discoverer: req.body.discoverer || 'user'
  };
  
  issues.unshift(newIssue);
  data.issues = issues;
  updateStats(data);
  writeIssues(data);
  
  // ✅ 新增：创建问题时自动判断是否可修复，并加入修复队列
  try {
    const autoFixable = canAutoFix({
      id: newIssue.id,
      status: newIssue.status,
      severity: newIssue.severity,
      type: newIssue.type,
      solution: newIssue.solution,
      category: newIssue.type,
      priority: null
    });
    
    if (autoFixable) {
      const fixTask = {
        id: 'fix-' + Date.now().toString(36),
        issueId: newIssue.id,
        issueTitle: newIssue.title,
        taskId: newIssue.relatedTaskId,
        status: 'pending',
        agentId: 'coder',
        type: newIssue.type,
        severity: newIssue.severity,
        prompt: `## 问题修复任务\n\n**问题 ID**: ${newIssue.id}\n**问题标题**: ${newIssue.title}\n**严重程度**: ${newIssue.severity}\n**问题类型**: ${newIssue.type}\n\n## 问题描述\n\n${newIssue.description || ''}\n\n## 修复要求\n\n1. 根据以上信息修复问题\n2. 确保修复不影响现有功能\n3. 如果涉及代码修改，确保代码质量\n4. 完成后报告修复结果`,
        created_at: new Date().toISOString()
      };
      
      fixQueueDAL.create({
        id: fixTask.id,
        issue_id: fixTask.issueId,
        task_id: fixTask.taskId,
        title: fixTask.issueTitle,
        priority: fixTask.severity || 'P2',
        status: fixTask.status,
        agent_id: fixTask.agentId,
        created_at: fixTask.created_at
      });
      console.log(`[IssuesAPI] 自动将问题 ${newIssue.id} 加入修复队列`);
      console.log(`[IssuesAPI] 自动将问题 ${newIssue.id} 加入修复队列`);
    }
  } catch (err) {
    console.error(`[IssuesAPI] 自动加入修复队列失败: ${err.message}`);
    // 不影响创建问题的主要流程
  }
  
  res.json({ success: true, issue: newIssue });
});

// 更新问题
router.put('/:id', (req, res) => {
  const data = readIssues();
  const issues = data.issues || [];
  const index = issues.findIndex(i => i.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '问题不存在' });
  }
  
  // 如果状态变为 resolved，记录解决时间
  if (req.body.status === 'resolved' && issues[index].status !== 'resolved') {
    req.body.resolvedAt = new Date().toISOString();
  }
  
  issues[index] = { ...issues[index], ...req.body };
  data.issues = issues;
  updateStats(data);
  writeIssues(data);
  
  res.json({ success: true, issue: issues[index] });
});

// Close 问题（带原因）
const CLOSE_REASONS = [
  { id: 'not_needed', label: '不再需要', desc: '方案变更/需求变更导致不再是问题' },
  { id: 'legacy', label: '历史遗留', desc: '老系统/已废弃功能的问题' },
  { id: 'cannot_reproduce', label: '无法复现', desc: '技术限制或无法复现' },
  { id: 'duplicate', label: '重复问题', desc: '已有类似问题在处理' },
  { id: 'low_priority', label: '优先级低', desc: '不值得投入时间处理' },
  { id: 'transferred', label: '已转移', desc: '转移到其他系统处理' }
];

// 获取 close 原因列表
router.get('/meta/close-reasons', (req, res) => {
  res.json({ success: true, reasons: CLOSE_REASONS });
});

// Close 问题（带原因）
router.post('/:id/close', (req, res) => {
  const { reason, comment } = req.body;
  
  if (!reason) {
    return res.status(400).json({ success: false, error: '必须提供 close 原因' });
  }
  
  const validReasons = CLOSE_REASONS.map(r => r.id);
  if (!validReasons.includes(reason)) {
    return res.status(400).json({ success: false, error: '无效的 close 原因', validReasons });
  }
  
  const data = readIssues();
  const issues = data.issues || [];
  const index = issues.findIndex(i => i.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '问题不存在' });
  }
  
  // 更新为 closed 状态
  issues[index].status = 'closed';
  issues[index].closeReason = reason;
  issues[index].closeComment = comment || '';
  issues[index].closedAt = new Date().toISOString();
  
  data.issues = issues;
  updateStats(data);
  writeIssues(data);
  
  res.json({ success: true, issue: issues[index] });
});

// 关联问题到任务
router.post('/:id/relate-task', (req, res) => {
  const data = readIssues();
  const issues = data.issues || [];
  const index = issues.findIndex(i => i.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '问题不存在' });
  }
  
  issues[index].relatedTaskId = req.body.taskId || null;
  data.issues = issues;
  writeIssues(data);
  
  res.json({ success: true, issue: issues[index] });
});

// 标记问题为反复出现
router.post('/:id/recurring', (req, res) => {
  const data = readIssues();
  const issues = data.issues || [];
  const index = issues.findIndex(i => i.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '问题不存在' });
  }
  
  issues[index].recurring = true;
  issues[index].recurringCount = (issues[index].recurringCount || 1) + 1;
  issues[index].recurringReason = req.body.reason || '';
  
  data.issues = issues;
  updateStats(data);
  writeIssues(data);
  
  res.json({ success: true, issue: issues[index] });
});

// 删除问题
router.delete('/:id', (req, res) => {
  const data = readIssues();
  const issues = data.issues || [];
  const index = issues.findIndex(i => i.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '问题不存在' });
  }
  
  issues.splice(index, 1);
  data.issues = issues;
  updateStats(data);
  writeIssues(data);
  
  res.json({ success: true });
});

// 获取任务的关联问题
router.get('/task/:taskId', (req, res) => {
  const data = readIssues();
  const issues = (data.issues || []).filter(i => i.relatedTaskId === req.params.taskId);
  
  res.json({ 
    success: true, 
    issues,
    total: issues.length,
    unresolved: issues.filter(i => i.status !== 'resolved').length
  });
});

// 刷新统计数据
router.post('/refresh-stats', (req, res) => {
  const data = readIssues();
  updateStats(data);
  writeIssues(data);
  
  res.json({ success: true, stats: data.stats });
});

// ==================== 修复队列 API ====================

const FIX_QUEUE_FILE = path.join(__dirname, '..', 'data', 'fix-queue.json');

// 读取修复队列
// ========== Fix Queue - 使用 SQLite，不再使用 JSON ==========
// 注意：已迁移到 SQLite，以下函数作为兼容层

function readFixQueue() {
  try {
    // 直接从 SQLite 读取
    return fixQueueDAL.list();
  } catch (e) {
    console.error('[FixQueue] 读取SQLite失败:', e);
    return [];
  }
}

function writeFixQueue(queue) {
  try {
    // SQLite 不需要批量写入，使用 create/update 单条操作
    console.log('[FixQueue] writeFixQueue 已废弃，请使用 DAL 的 create/update');
    return true;
  } catch (e) {
    console.error('[FixQueue] 写入SQLite失败:', e);
    return false;
  }
}

// 获取修复队列
router.get('/fix-queue/list', (req, res) => {
  const queue = readFixQueue();
  const { status } = req.query;
  
  let filtered = queue;
  if (status) {
    filtered = queue.filter(i => i.status === status);
  }
  
  res.json({
    success: true,
    queue: filtered,
    stats: {
      total: queue.length,
      pending: queue.filter(i => i.status === 'pending').length,
      running: queue.filter(i => i.status === 'running').length,
      completed: queue.filter(i => i.status === 'completed').length,
      failed: queue.filter(i => i.status === 'failed').length
    }
  });
});

// 扫描问题并加入修复队列
router.post('/fix-queue/scan', (req, res) => {
  try {
    const { scanAndQueue } = require('../../scripts/issue-scanner');
    const result = scanAndQueue();
    
    res.json({
      success: true,
      message: `已扫描 ${result.openIssues} 个问题，加入 ${result.added} 个到修复队列`,
      ...result
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 手动加入修复队列
router.post('/fix-queue/add', (req, res) => {
  const { issueId } = req.body;
  
  if (!issueId) {
    return res.status(400).json({ success: false, error: '缺少 issueId' });
  }
  
  const data = readIssues();
  const issue = (data.issues || []).find(i => i.id === issueId);
  
  if (!issue) {
    return res.status(404).json({ success: false, error: '问题不存在' });
  }
  
  const queue = readFixQueue();
  
  // 检查是否已在队列中
  if (queue.some(i => i.issueId === issueId && (i.status === 'pending' || i.status === 'running'))) {
    return res.status(400).json({ success: false, error: '问题已在修复队列中' });
  }
  
  const { generateFixPrompt, determineFixAgent } = require('../../scripts/issue-scanner');
  
  const fixTask = {
    id: `fix_${Date.now()}_${issueId.slice(-6)}`,
    issueId: issue.id,
    issueTitle: issue.title,
    taskId: issue.relatedTaskId || null,
    agentId: issue.assignedAgent || determineFixAgent(issue),
    prompt: generateFixPrompt(issue),
    severity: issue.severity,
    type: issue.type,
    status: 'pending',
    created_at: new Date().toISOString()
  };
  
  queue.push(fixTask);
  writeFixQueue(queue);
  
  // 更新问题状态
  issue.fix_status = 'queued';
  issue.queued_at = new Date().toISOString();
  writeIssues(data);
  
  res.json({ success: true, fixTask, message: '已加入修复队列' });
});

// 处理修复队列（执行一个任务）
router.post('/fix-queue/process', async (req, res) => {
  try {
    const { processQueue } = require('../../scripts/fix-queue-processor');
    
    // 异步处理
    processQueue().then(result => {
      console.log('[FixQueue] 处理完成:', result);
    }).catch(err => {
      console.error('[FixQueue] 处理失败:', err);
    });
    
    res.json({ success: true, message: '已启动修复队列处理' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 获取修复队列状态
router.get('/fix-queue/status', (req, res) => {
  const queue = readFixQueue();
  const data = readIssues();
  
  // 获取待修复和正在修复的问题列表
  const pendingIssues = queue.filter(i => i.status === 'pending' || i.status === 'running');
  
  res.json({
    success: true,
    queue: {
      total: queue.length,
      pending: queue.filter(i => i.status === 'pending').length,
      running: queue.filter(i => i.status === 'running').length,
      completed: queue.filter(i => i.status === 'completed').length,
      failed: queue.filter(i => i.status === 'failed').length
    },
    issues: {
      total: (data.issues || []).length,
      open: (data.issues || []).filter(i => i.status === 'open').length,
      autoFixable: (data.issues || []).filter(i => {
      return canAutoFix(i);
    }).length
    },
    // 新增：返回待修复问题的详细列表
    pendingList: pendingIssues.map(i => ({
      id: i.id,
      issueId: i.issueId,
      issueTitle: i.issueTitle,
      taskId: i.taskId,
      status: i.status,
      agentId: i.agentId,
      type: i.type,
      severity: i.severity,
      prompt: i.prompt,
      created_at: i.created_at
    }))
  });
});

// 取消修复任务
router.delete('/fix-queue/:id', (req, res) => {
  const queue = readFixQueue();
  const index = queue.findIndex(i => i.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  
  // 只能取消 pending 状态的任务
  if (queue[index].status !== 'pending') {
    return res.status(400).json({ success: false, error: '只能取消待处理的任务' });
  }
  
  queue.splice(index, 1);
  writeFixQueue(queue);
  
  res.json({ success: true, message: '已取消修复任务' });
});

// 标记修复完成（供 Subagent 调用）
router.post('/fix-queue/:id/complete', (req, res) => {
  const queue = readFixQueue();
  const index = queue.findIndex(i => i.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  
  const { result, reflection } = req.body;
  
  // 更新状态为完成
  queue[index].status = 'completed';
  queue[index].completed_at = new Date().toISOString();
  queue[index].result = result;
  queue[index].reflection = reflection;
  
  writeFixQueue(queue);
  
  // 更新问题状态
  const data = readIssues();
  const issue = data.issues.find(i => i.id === queue[index].issueId);
  if (issue) {
    issue.status = 'resolved';
    issue.resolved_at = new Date().toISOString();
    issue.resolution = result;
    writeIssues(data);
  }
  
  res.json({ 
    success: true, 
    message: '修复已完成',
    shouldReflect: true,  // 提示需要执行反思
    issueTitle: queue[index].issueTitle,
    result: result
  });
});

// 标记修复失败
router.post('/fix-queue/:id/fail', (req, res) => {
  const queue = readFixQueue();
  const index = queue.findIndex(i => i.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  
  const { error } = req.body;
  
  // 更新状态为失败
  queue[index].status = 'failed';
  queue[index].failed_at = new Date().toISOString();
  queue[index].error = error;
  
  writeFixQueue(queue);
  
  res.json({ success: true, message: '已记录失败原因' });
});

module.exports = router;
