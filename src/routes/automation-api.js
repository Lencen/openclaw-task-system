/**
 * 自动化监控 API 路由
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'tasks.db');

// 获取数据库实例
function getDB() {
  return new Database(DB_PATH);
}

// 获取自动化状态
router.get('/status', (req, res) => {
  try {
    const db = getDB();
    
    // 任务统计
    const taskStats = {
      total: db.prepare('SELECT COUNT(*) as count FROM tasks').get().count,
      pending: db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get('pending').count,
      doing: db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get('doing').count,
      completed: db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get('done').count,
      failed: db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get('failed').count
    };
    
    // 问题统计
    const issueStats = {
      total: db.prepare('SELECT COUNT(*) as count FROM issues').get().count,
      open: db.prepare('SELECT COUNT(*) as count FROM issues WHERE status = ?').get('open').count,
      in_progress: db.prepare('SELECT COUNT(*) as count FROM issues WHERE status = ?').get('in_progress').count,
      resolved: db.prepare('SELECT COUNT(*) as count FROM issues WHERE status = ?').get('resolved').count,
      p0: db.prepare('SELECT COUNT(*) as count FROM issues WHERE priority = ? AND status != ?').get('P0', 'resolved').count
    };
    
    // 修复队列统计
    let fixQueueStats = { total: 0, pending: 0, running: 0, completed: 0, failed: 0 };
    const fixQueuePath = path.join(DATA_DIR, 'fix-queue.json');
    if (fs.existsSync(fixQueuePath)) {
      const queue = JSON.parse(fs.readFileSync(fixQueuePath, 'utf8'));
      fixQueueStats = {
        total: queue.length,
        pending: queue.filter(i => i.status === 'pending').length,
        running: queue.filter(i => i.status === 'running').length,
        completed: queue.filter(i => i.status === 'completed').length,
        failed: queue.filter(i => i.status === 'failed').length
      };
    }
    
    // 待分配任务
    let pendingAssignments = 0;
    const pendingPath = path.join(DATA_DIR, 'pending-assignments.jsonl');
    if (fs.existsSync(pendingPath)) {
      const lines = fs.readFileSync(pendingPath, 'utf8').split('\n').filter(l => l.trim());
      pendingAssignments = lines.filter(l => JSON.parse(l).status === 'pending').length;
    }
    
    // 联邦通信状态
    const federationPath = path.join(DATA_DIR, 'federation-config.json');
    let federation = { enabled: true, status: 'online' };
    if (fs.existsSync(federationPath)) {
      federation = JSON.parse(fs.readFileSync(federationPath, 'utf8'));
    }
    
    // Agent 状态
    const agents = getAgentStatus();
    
    // 流程节点数据
    const flowNodes = {
      create: { tasks: taskStats.pending, agents: 0 },
      analyze: { tasks: Math.floor(taskStats.pending * 0.3), agents: agents.filter(a => a.status === 'busy' && ['main', 'deep'].includes(a.id)).length },
      assign: { tasks: pendingAssignments, agents: 0 },
      execute: { tasks: taskStats.doing, agents: agents.filter(a => a.status === 'busy').length },
      verify: { tasks: 0, agents: 0 },
      complete: { tasks: taskStats.completed, agents: 0 }
    };
    
    db.close();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      tasks: taskStats,
      issues: issueStats,
      fixQueue: fixQueueStats,
      pendingAssignments,
      federation,
      agents,
      flowNodes,
      automation: {
        taskAutomation: {
          enabled: true,
          status: taskStats.doing > 0 ? 'running' : 'idle'
        },
        issueAutomation: {
          enabled: true,
          status: fixQueueStats.running > 0 ? 'running' : 'idle'
        }
      },
      alerts: generateAlerts(taskStats, issueStats, fixQueueStats, pendingAssignments)
    });
    
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取 Agent 状态
function getAgentStatus() {
  const agents = [
    { id: 'main', name: 'Main', role: '总控 Agent', icon: '🤖', status: 'online', tasks: 0, completed: 0 },
    { id: 'coder', name: 'Coder', role: '编码 Agent', icon: '💻', status: 'online', tasks: 0, completed: 0 },
    { id: 'deep', name: 'Deep', role: '深度分析', icon: '🧠', status: 'online', tasks: 0, completed: 0 },
    { id: 'fast', name: 'Fast', role: '快速响应', icon: '⚡', status: 'online', tasks: 0, completed: 0 },
    { id: 'chat', name: 'Chat', role: '对话 Agent', icon: '💬', status: 'online', tasks: 0, completed: 0 },
    { id: 'test', name: 'Test', role: '测试 Agent', icon: '🧪', status: 'online', tasks: 0, completed: 0 },
    { id: 'office', name: 'Office', role: '办公 Agent', icon: '📊', status: 'online', tasks: 0, completed: 0 }
  ];
  
  // 从 registered-agents.json 读取真实状态
  try {
    const regPath = path.join(DATA_DIR, 'registered-agents.json');
    if (fs.existsSync(regPath)) {
      const registered = JSON.parse(fs.readFileSync(regPath, 'utf8'));
      registered.forEach(reg => {
        const agent = agents.find(a => a.id === reg.agent_type || a.id === reg.id?.replace('agent-', ''));
        if (agent) {
          agent.status = reg.status || 'online';
          agent.tasks = reg.current_tasks || 0;
          agent.completed = reg.completed_tasks || 0;
        }
      });
    }
  } catch (e) {}
  
  return agents;
}

// 生成告警
function generateAlerts(taskStats, issueStats, fixQueueStats, pendingAssignments) {
  const alerts = [];
  
  // P0 问题告警
  if (issueStats.p0 > 0) {
    alerts.push({
      level: 'critical',
      message: `有 ${issueStats.p0} 个 P0 问题待处理`,
      action: '/issues.html?priority=P0'
    });
  }
  
  // 待分配任务告警
  if (pendingAssignments > 10) {
    alerts.push({
      level: 'warning',
      message: `有 ${pendingAssignments} 个任务待分配`,
      action: '/tasks.html?status=pending'
    });
  }
  
  // 修复队列告警
  if (fixQueueStats.pending > 5) {
    alerts.push({
      level: 'warning',
      message: `修复队列有 ${fixQueueStats.pending} 个问题待处理`,
      action: '/issues.html'
    });
  }
  
  // 进行中任务告警
  if (taskStats.doing > 5) {
    alerts.push({
      level: 'info',
      message: `有 ${taskStats.doing} 个任务正在执行`,
      action: '/tasks.html?status=doing'
    });
  }
  
  return alerts;
}

// 获取执行器列表
router.get('/executors', (req, res) => {
  const executors = [
    { id: 'auto-detector', name: 'Auto Detector', type: '事件驱动', status: 'running', trigger: '用户消息' },
    { id: 'auto-assigner', name: 'Auto Assigner', type: '轮询 30s', status: 'running', trigger: 'pending 任务' },
    { id: 'auto-executor', name: 'Auto Executor', type: '轮询 30s', status: 'running', trigger: 'doing 任务' },
    { id: 'auto-monitor', name: 'Auto Monitor', type: '轮询 5min', status: 'running', trigger: '执行中任务' },
    { id: 'auto-validator', name: 'Auto Validator', type: '轮询 30min', status: 'running', trigger: '已完成任务' },
    { id: 'auto-recovery', name: 'Auto Recovery', type: '事件驱动', status: 'running', trigger: '异常/超时' },
    { id: 'issue-scanner', name: 'Issue Scanner', type: '轮询 5min', status: 'running', trigger: 'open 问题' },
    { id: 'issue-fix-scheduler', name: 'Issue Fix Scheduler', type: '事件驱动', status: 'running', trigger: 'Heartbeat' }
  ];
  
  res.json({ success: true, executors });
});

// 获取最近任务
router.get('/recent-tasks', (req, res) => {
  try {
    const db = getDB();
    const limit = parseInt(req.query.limit) || 10;
    
    const tasks = db.prepare(`
      SELECT id, title, status, priority, assigned_agent, created_at, updated_at
      FROM tasks
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit);
    
    db.close();
    
    res.json({ success: true, tasks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取最近问题
router.get('/recent-issues', (req, res) => {
  try {
    const db = getDB();
    const limit = parseInt(req.query.limit) || 10;
    
    const issues = db.prepare(`
      SELECT id, title, status, priority, category, created_at
      FROM issues
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
    
    db.close();
    
    res.json({ success: true, issues });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 触发任务分配
router.post('/trigger-assignment', async (req, res) => {
  try {
    const { spawn } = require('child_process');
    const scriptPath = path.join(__dirname, '..', 'scripts', 'issue-fix-scheduler.js');
    
    // 异步执行
    spawn('node', [scriptPath, 'process'], { detached: true, stdio: 'ignore' });
    
    res.json({ success: true, message: '已触发任务分配' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 触发问题修复
router.post('/trigger-fix', async (req, res) => {
  try {
    const { spawn } = require('child_process');
    const scriptPath = path.join(__dirname, '..', 'scripts', 'issue-fix-scheduler.js');
    
    // 异步执行
    spawn('node', [scriptPath, 'process', '--P0'], { detached: true, stdio: 'ignore' });
    
    res.json({ success: true, message: '已触发 P0 问题修复' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;