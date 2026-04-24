const express = require('express');
const router = express.Router();

console.log('[SQLite-v2] 开始加载 SQLite v2 API');

// 导入 DAL
const { getDAL } = require('../db/data-access-layer');
const { getIssuesDAL } = require('../db/issues-dal');
const { getProjectsDAL } = require('../db/projects-dal');

const dal = getDAL();
const issuesDAL = getIssuesDAL();
const projectsDAL = getProjectsDAL();

// ==================== Tasks API ====================
router.get('/tasks-v2', (req, res) => {
  try {
    const tasks = dal.listTasks();
    res.json({ success: true, data: { tasks, total: tasks.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/tasks-v2/stats', (req, res) => {
  try {
    const all = dal.listTasks();
    res.json({
      success: true,
      data: {
        total: all.length,
        pending: all.filter(t => t.status === 'pending').length,
        doing: all.filter(t => t.status === 'doing').length,
        completed: all.filter(t => t.status === 'completed').length,
        failed: all.filter(t => t.status === 'failed').length,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/tasks-v2/:id', (req, res) => {
  try {
    const task = dal.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tasks-v2', (req, res) => {
  try {
    const task = {
      id: req.body.id || require("../db/uuid-generator").generateShortId("task"),
      ...req.body,
      created_at: req.body.created_at || new Date().toISOString(),
    };
    dal.createTask(task);
    res.status(201).json({ success: true, data: { id: task.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/tasks-v2/:id', (req, res) => {
  try {
    const existing = dal.getTask(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    dal.updateTask(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/tasks-v2/:id', (req, res) => {
  try {
    const existing = dal.getTask(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: '任务不存在，无法删除' });
    }
    dal.deleteTask(req.params.id);
    res.json({ success: true, message: '任务已删除' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== Issues API ====================
router.get('/issues-v2', (req, res) => {
  try {
    const issues = issuesDAL.list(req.query);
    res.json({ success: true, data: { issues, total: issues.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/issues-v2/:id', (req, res) => {
  try {
    const issue = issuesDAL.get(req.params.id);
    if (!issue) {
      return res.status(404).json({ success: false, error: '问题不存在' });
    }
    res.json({ success: true, data: issue });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/issues-v2', (req, res) => {
  try {
    const id = req.body.id || require('../db/uuid-generator').generateShortId('issue');
    const issue = { id, ...req.body, created_at: new Date().toISOString() };
    issuesDAL.create(issue);
    res.status(201).json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/issues-v2/:id', (req, res) => {
  try {
    issuesDAL.update(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Close 原因列表
const CLOSE_REASONS = [
  { id: 'not_needed', label: '不再需要', desc: '方案变更/需求变更导致不再是问题' },
  { id: 'legacy', label: '历史遗留', desc: '老系统/已废弃功能的问题' },
  { id: 'cannot_reproduce', label: '无法复现', desc: '技术限制或无法复现' },
  { id: 'duplicate', label: '重复问题', desc: '已有类似问题在处理' },
  { id: 'low_priority', label: '优先级低', desc: '不值得投入时间处理' },
  { id: 'transferred', label: '已转移', desc: '转移到其他系统处理' }
];

router.get('/issues-v2/meta/close-reasons', (req, res) => {
  res.json({ success: true, reasons: CLOSE_REASONS });
});

router.post('/issues-v2/:id/close', (req, res) => {
  const { reason, comment } = req.body;
  
  if (!reason) {
    return res.status(400).json({ success: false, error: '必须提供 close 原因' });
  }
  
  const validReasons = CLOSE_REASONS.map(r => r.id);
  if (!validReasons.includes(reason)) {
    return res.status(400).json({ success: false, error: '无效的 close 原因', validReasons });
  }
  
  try {
    issuesDAL.update(req.params.id, {
      status: 'closed',
      close_reason: reason,
      close_comment: comment || '',
      closed_at: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== Projects API ====================
router.get('/projects-v2', (req, res) => {
  try {
    const projects = projectsDAL.list(req.query);
    res.json({ success: true, data: { projects, total: projects.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/projects-v2/:id', (req, res) => {
  try {
    const project = projectsDAL.get(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: '项目不存在' });
    }
    res.json({ success: true, data: project });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/projects-v2', (req, res) => {
  try {
    const id = req.body.id || require('../db/uuid-generator').generateShortId('proj');
    const project = { id, ...req.body, created_at: new Date().toISOString() };
    projectsDAL.create(project);
    res.status(201).json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/projects-v2/:id', (req, res) => {
  try {
    projectsDAL.update(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== Index API ====================
router.get('/knowledge-index', (req, res) => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database('./data/tasks.db');
    
    const keyword = req.query.q || '';
    const category = req.query.category || '';
    
    let sql = 'SELECT * FROM knowledge_index WHERE 1=1';
    const params = [];
    
    if (keyword) {
      sql += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    
    sql += ' ORDER BY updated_at DESC';
    
    const items = db.prepare(sql).all(...params);
    db.close();
    res.json({ success: true, data: { items, total: items.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/documents-index', (req, res) => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database('./data/tasks.db');
    
    const keyword = req.query.q || '';
    const category = req.query.category || '';
    
    let sql = 'SELECT * FROM documents_index WHERE 1=1';
    const params = [];
    
    if (keyword) {
      sql += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    
    sql += ' ORDER BY updated_at DESC';
    
    const items = db.prepare(sql).all(...params);
    db.close();
    res.json({ success: true, data: { items, total: items.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/skills-index', (req, res) => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database('./data/tasks.db');
    
    const keyword = req.query.q || '';
    
    let sql = 'SELECT * FROM skills_index WHERE 1=1';
    const params = [];
    
    if (keyword) {
      sql += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    
    sql += ' ORDER BY updated_at DESC';
    
    const items = db.prepare(sql).all(...params);
    db.close();
    res.json({ success: true, data: { items, total: items.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sync-index', (req, res) => {
  try {
    const { execSync } = require('child_process');
    execSync('node scripts/sync-index.js', { cwd: '/path/to/task-system' });
    res.json({ success: true, message: '索引同步完成' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

console.log('[SQLite-v2] SQLite v2 API 已加载');

module.exports = router;
