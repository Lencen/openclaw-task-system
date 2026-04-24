const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'tasks.db');

/**
 * 获取待分配的问题记录
 * 
 * 用法: GET /api/issues/pending-assignments
 * Query: status=pending&limit=20
 * Response: { assignments: [], total: number }
 */
router.get('/', (req, res) => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(DB_FILE);
    
    let query = 'SELECT * FROM pending_issue_assignments';
    const conditions = [];
    const params = {};
    
    if (req.query.status) {
      conditions.push('status = @status');
      params.status = req.query.status;
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (req.query.limit) {
      query += ' LIMIT @limit';
      params.limit = parseInt(req.query.limit);
    }
    
    const stmt = db.prepare(query);
    const assignments = stmt.all(params);
    
    db.close();
    
    res.json({ assignments, total: assignments.length });
  } catch (err) {
    console.error('[API] 读取待分配问题记录失败:', err.message);
    res.status(500).json({ success: false, error: err.message, assignments: [], total: 0 });
  }
});

/**
 * 创建待分配问题记录
 * 
 * 用法: POST /api/issues/pending-assignments
 * Body: { issue_id, agent_id, title, description, related_task_id, related_project_id, priority }
 */
router.post('/', (req, res) => {
  try {
    const { issue_id, agent_id, title, description, related_task_id, related_project_id, severity, priority } = req.body;
    
    if (!issue_id || !agent_id) {
      return res.status(400).json({ success: false, error: 'Missing required fields: issue_id, agent_id' });
    }
    
    const Database = require('better-sqlite3');
    const db = new Database(DB_FILE);
    
    const id = `issue-assign-${issue_id}-${Date.now()}`;
    const now = new Date().toISOString();
    
    const stmt = db.prepare(`
      INSERT INTO pending_issue_assignments 
      (id, issue_id, agent_id, title, description, related_task_id, related_project_id, severity, priority, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `);
    
    stmt.run(id, issue_id, agent_id, title || '', description || '', related_task_id || null, related_project_id || null, severity || null, priority || 'P2', now);
    
    db.close();
    
    res.json({ success: true, id, message: 'Issue assignment created' });
  } catch (err) {
    console.error('[API] 创建待分配问题记录失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 更新待分配问题记录状态
 * 
 * 用法: PUT /api/issues/pending-assignments/:id
 * Body: { status: "pending" | "doing" | "completed" | "failed" }
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, error } = req.body;
    
    if (!status) {
      return res.status(400).json({ success: false, error: 'Missing status' });
    }
    
    const Database = require('better-sqlite3');
    const db = new Database(DB_FILE);
    
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE pending_issue_assignments 
      SET status = ?, processed_at = ?, error = ?
      WHERE id = ?
    `);
    
    const result = stmt.run(status, now, error || null, id);
    
    db.close();
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }
    
    res.json({ success: true, message: 'Assignment updated' });
  } catch (err) {
    console.error('[API] 更新待分配问题记录失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 删除待分配问题记录
 * 
 * 用法: DELETE /api/issues/pending-assignments/:id
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const Database = require('better-sqlite3');
    const db = new Database(DB_FILE);
    
    const stmt = db.prepare('DELETE FROM pending_issue_assignments WHERE id = ?');
    const result = stmt.run(id);
    
    db.close();
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }
    
    res.json({ success: true, message: 'Assignment deleted' });
  } catch (err) {
    console.error('[API] 删除待分配问题记录失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;