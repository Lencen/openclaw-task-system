/**
 * Reviews API - 评审管理
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('better-sqlite3')(path.join(__dirname, '../data/tasks.db'));

// 创建评审
router.post('/', (req, res) => {
  const { taskId, type, reviewers, timeoutMinutes } = req.body;
  
  const id = `review-${taskId}-${Date.now()}`;
  const createdAt = new Date().toISOString();
  
  try {
    db.prepare(`
      INSERT INTO reviews (id, taskId, type, status, reviewers, sessions, results, createdAt, timeoutMinutes)
      VALUES (?, ?, ?, 'pending', ?, '{}', '{}', ?, ?)
    `).run(id, taskId, type || '方案评审', JSON.stringify(reviewers), createdAt, timeoutMinutes || 15);
    
    res.json({ ok: true, id, taskId, status: 'pending' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 获取待处理的评审（放在 /:id 前面）
router.get('/pending', (req, res) => {
  try {
    const reviews = db.prepare('SELECT * FROM reviews WHERE status = ? ORDER BY createdAt DESC').all('pending');
    
    reviews.forEach(r => {
      r.reviewers = JSON.parse(r.reviewers || '[]');
      r.sessions = JSON.parse(r.sessions || '{}');
      r.results = JSON.parse(r.results || '{}');
    });
    
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 获取评审
router.get('/:id', (req, res) => {
  try {
    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    
    if (!review) {
      return res.status(404).json({ ok: false, error: '评审不存在' });
    }
    
    // 解析 JSON 字段
    review.reviewers = JSON.parse(review.reviewers || '[]');
    review.sessions = JSON.parse(review.sessions || '{}');
    review.results = JSON.parse(review.results || '{}');
    
    res.json(review);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 更新评审
router.put('/:id', (req, res) => {
  const { status, sessions, results, completedAt, note } = req.body;
  
  try {
    const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    
    if (!existing) {
      return res.status(404).json({ ok: false, error: '评审不存在' });
    }
    
    // 合并更新
    const updateData = {
      status: status || existing.status,
      sessions: sessions ? JSON.stringify(sessions) : existing.sessions,
      results: results ? JSON.stringify(results) : existing.results,
      completedAt: completedAt || existing.completedAt,
      note: note || existing.note
    };
    
    db.prepare(`
      UPDATE reviews 
      SET status = ?, sessions = ?, results = ?, completedAt = ?, note = ?
      WHERE id = ?
    `).run(updateData.status, updateData.sessions, updateData.results, updateData.completedAt, updateData.note, req.params.id);
    
    res.json({ ok: true, id: req.params.id, ...updateData });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 更新评审员结果
router.put('/:id/results', (req, res) => {
  const { reviewer, score, comment, status } = req.body;
  
  try {
    const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    
    if (!existing) {
      return res.status(404).json({ ok: false, error: '评审不存在' });
    }
    
    const results = JSON.parse(existing.results || '{}');
    results[reviewer] = { 
      score: score || 0, 
      comment: comment || '', 
      status: status || 'submitted',
      submittedAt: new Date().toISOString()
    };
    
    db.prepare('UPDATE reviews SET results = ? WHERE id = ?').run(JSON.stringify(results), req.params.id);
    
    res.json({ ok: true, reviewer, result: results[reviewer] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 更新评审员 sessionKey
router.put('/:id/sessions', (req, res) => {
  const { reviewer, sessionKey } = req.body;
  
  try {
    const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    
    if (!existing) {
      return res.status(404).json({ ok: false, error: '评审不存在' });
    }
    
    const sessions = JSON.parse(existing.sessions || '{}');
    sessions[reviewer] = sessionKey;
    
    db.prepare('UPDATE reviews SET sessions = ? WHERE id = ?').run(JSON.stringify(sessions), req.params.id);
    
    res.json({ ok: true, reviewer, sessionKey });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 获取任务的评审列表
router.get('/tasks/:taskId/reviews', (req, res) => {
  try {
    const reviews = db.prepare('SELECT * FROM reviews WHERE taskId = ? ORDER BY createdAt DESC').all(req.params.taskId);
    
    reviews.forEach(r => {
      r.reviewers = JSON.parse(r.reviewers || '[]');
      r.sessions = JSON.parse(r.sessions || '{}');
      r.results = JSON.parse(r.results || '{}');
    });
    
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;