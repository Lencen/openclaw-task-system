/**
 * Agent 注册 + 会话管理 API
 * 提供 Agent 注册、验证、会话管理功能
 */

const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'tasks.db');
let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

// Agent 注册
router.post('/register', (req, res) => {
  const { agentId, secret, name, capabilities } = req.body;
  
  if (!agentId || !secret) {
    return res.status(400).json({ success: false, error: '缺少 agentId 或 secret' });
  }
  
  const database = getDb();
  const existing = database.prepare('SELECT * FROM agents WHERE agent_id = ?').get(agentId);
  
  if (existing) {
    // 更新
    database.prepare(`
      UPDATE agents SET secret = ?, name = ?, capabilities = ?, status = 'active'
      WHERE agent_id = ?
    `).run(secret, name || agentId, capabilities ? JSON.stringify(capabilities) : '[]', agentId);
    return res.json({ success: true, message: 'Agent 已更新', agentId });
  }
  
  // 新增
  database.prepare(`
    INSERT INTO agents (id, agent_id, secret, name, capabilities, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(
    `agent-${Date.now()}`,
    agentId,
    secret,
    name || agentId,
    capabilities ? JSON.stringify(capabilities) : '[]'
  );
  
  res.json({ success: true, message: 'Agent 注册成功', agentId });
});

// Agent 验证
router.post('/verify', (req, res) => {
  const { agentId, secret } = req.body;
  
  const database = getDb();
  const agent = database.prepare('SELECT * FROM agents WHERE agent_id = ? AND secret = ?').get(agentId, secret);
  
  if (!agent) {
    return res.status(401).json({ success: false, error: '验证失败' });
  }
  
  // 更新 last_seen
  database.prepare('UPDATE agents SET last_seen = ? WHERE agent_id = ?').run(new Date().toISOString(), agentId);
  
  res.json({ success: true, agent: { agentId: agent.agent_id, name: agent.name, capabilities: JSON.parse(agent.capabilities || '[]') } });
});

// 获取所有 Agent
router.get('/', (req, res) => {
  const database = getDb();
  const agents = database.prepare('SELECT id, agent_id, name, capabilities, status, created_at, last_seen FROM agents ORDER BY created_at DESC').all();
  res.json({ success: true, agents });
});

// ========== 会话管理 API ==========

// 创建会话
router.post('/sessions', (req, res) => {
  const { type, participants, taskId } = req.body;
  
  if (!type || !participants || !Array.isArray(participants)) {
    return res.status(400).json({ success: false, error: '缺少 type 或 participants' });
  }
  
  const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const database = getDb();
  
  // 创建会话
  database.prepare(`
    INSERT INTO sessions (id, session_id, type, task_id, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(`sess-${Date.now()}`, sessionId, type, taskId || null);
  
  // 添加参与者
  const insertParticipant = database.prepare(`
    INSERT INTO session_participants (session_id, participant_id, participant_type)
    VALUES (?, ?, ?)
  `);
  
  participants.forEach(p => {
    const [type, id] = p.split(':');
    insertParticipant.run(sessionId, id, type || 'user');
  });
  
  res.json({ success: true, sessionId, type, participants });
});

// 获取会话详情
router.get('/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const database = getDb();
  
  const session = database.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: '会话不存在' });
  }
  
  const participants = database.prepare(`
    SELECT * FROM session_participants WHERE session_id = ?
  `).all(sessionId);
  
  res.json({ success: true, session, participants });
});

// 发送消息到会话
router.post('/sessions/:sessionId/messages', (req, res) => {
  const { sessionId } = req.params;
  const { type, content, senderId, senderType } = req.body;
  
  if (!type || !content) {
    return res.status(400).json({ success: false, error: '缺少 type 或 content' });
  }
  
  const database = getDb();
  const session = database.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
  
  if (!session) {
    return res.status(404).json({ success: false, error: '会话不存在' });
  }
  
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  database.prepare(`
    INSERT INTO session_messages (session_id, message_id, type, content, sender_id, sender_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, messageId, type, JSON.stringify(content), senderId || 'system', senderType || 'system');
  
  // 更新任务状态（如果是任务分配消息）
  if (type === 'task_assigned' && content.taskId) {
    const task = database.prepare('SELECT * FROM tasks WHERE id = ?').get(content.taskId);
    if (task) {
      // 查找 Agent 参与者
      const agentParticipant = database.prepare(`
        SELECT * FROM session_participants 
        WHERE session_id = ? AND participant_type = 'agent'
      `).get(sessionId);
      
      if (agentParticipant) {
        database.prepare(`
          UPDATE tasks SET status = 'doing', assigned_agent = ?, started_at = ?
          WHERE id = ?
        `).run(agentParticipant.participant_id, new Date().toISOString(), content.taskId);
      }
    }
  }
  
  res.json({ success: true, messageId, sessionId });
});

// 获取会话消息
router.get('/sessions/:sessionId/messages', (req, res) => {
  const { sessionId } = req.params;
  const { limit = 50, offset = 0 } = req.query;
  
  const database = getDb();
  const messages = database.prepare(`
    SELECT * FROM session_messages 
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(sessionId, parseInt(limit), parseInt(offset));
  
  res.json({ success: true, messages: messages.reverse() });
});

// Agent 获取自己的消息（轮询）
router.get('/:agentId/messages', (req, res) => {
  const { agentId } = req.params;
  const { secret, limit = 20 } = req.query;
  
  // 验证 secret
  const database = getDb();
  const agent = database.prepare('SELECT * FROM agents WHERE agent_id = ? AND secret = ?').get(agentId, secret);
  
  if (!agent) {
    return res.status(401).json({ success: false, error: '验证失败' });
  }
  
  // 获取 Agent 参与的所有会话
  const sessions = database.prepare(`
    SELECT s.* FROM sessions s
    JOIN session_participants sp ON s.session_id = sp.session_id
    WHERE sp.participant_id = ? AND sp.participant_type = 'agent'
    AND s.status = 'active'
  `).all(agentId);
  
  if (!sessions.length) {
    return res.json({ success: true, messages: [] });
  }
  
  // 获取所有会话的最新消息
  const sessionIds = sessions.map(s => s.session_id);
  const placeholders = sessionIds.map(() => '?').join(',');
  
  const messages = database.prepare(`
    SELECT * FROM session_messages 
    WHERE session_id IN (${placeholders})
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...sessionIds, parseInt(limit));
  
  res.json({ success: true, messages });
});

// 关闭会话
router.post('/sessions/:sessionId/close', (req, res) => {
  const { sessionId } = req.params;
  const database = getDb();
  
  database.prepare(`
    UPDATE sessions SET status = 'closed', closed_at = ?
    WHERE session_id = ?
  `).run(new Date().toISOString(), sessionId);
  
  res.json({ success: true, sessionId });
});

module.exports = router;