/**
 * OpenClaw Webhook API
 * 
 * 接收 OpenClaw 的事件通知，自动创建/更新任务
 * 
 * 支持的事件：
 * - task.created - OpenClaw 创建了新任务
 * - task.updated - 任务状态更新
 * - task.completed - 任务完成
 * - agent.message - Agent 发送了消息
 */

const express = require('express');
const router = express.Router();

// Webhook 验证中间件
function verifyWebhook(req, res, next) {
  const token = req.headers['x-webhook-token'];
  const expectedToken = process.env.WEBHOOK_TOKEN;
  
  if (expectedToken && token !== expectedToken) {
    return res.status(401).json({ success: false, error: 'Invalid webhook token' });
  }
  next();
}

// POST /api/webhook/openclaw
// 接收 OpenClaw 事件
router.post('/openclaw', verifyWebhook, async (req, res) => {
  try {
    const event = req.body;
    
    console.log('[Webhook] 收到事件:', event.type, event.data?.title);
    
    switch (event.type) {
      case 'task.created':
        await handleTaskCreated(event.data);
        break;
      case 'task.updated':
        await handleTaskUpdated(event.data);
        break;
      case 'task.completed':
        await handleTaskCompleted(event.data);
        break;
      case 'agent.message':
        await handleAgentMessage(event.data);
        break;
      default:
        console.log('[Webhook] 未知事件类型:', event.type);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('[Webhook] 处理失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 处理任务创建
async function handleTaskCreated(data) {
  const Database = require('better-sqlite3');
  const path = require('path');
  const dbPath = path.join(process.cwd(), 'data', 'tasks.db');
  const db = new Database(dbPath);
  
  try {
    const stmt = db.prepare(`
      INSERT INTO tasks (
        id, title, description, priority, status, assigned_agent, 
        user_description, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const taskId = data.id || 'task-' + require('crypto').randomUUID();
    
    stmt.run(
      taskId,
      data.title || '未命名任务',
      data.description || '',
      data.priority || 'P2',
      'pending',
      data.assigned_agent || 'main',
      data.user_description || '',
      new Date().toISOString()
    );
    
    console.log('[Webhook] 任务已创建:', taskId);
  } finally {
    db.close();
  }
}

// 处理任务更新
async function handleTaskUpdated(data) {
  const Database = require('better-sqlite3');
  const path = require('path');
  const dbPath = path.join(process.cwd(), 'data', 'tasks.db');
  const db = new Database(dbPath);
  
  try {
    const updates = [];
    const values = [];
    
    if (data.status) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.assigned_agent) {
      updates.push('assigned_agent = ?');
      values.push(data.assigned_agent);
    }
    if (data.description) {
      updates.push('description = ?');
      values.push(data.description);
    }
    
    if (updates.length > 0) {
      values.push(data.id);
      const sql = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`;
      db.prepare(sql).run(...values);
      console.log('[Webhook] 任务已更新:', data.id);
    }
  } finally {
    db.close();
  }
}

// 处理任务完成
async function handleTaskCompleted(data) {
  const Database = require('better-sqlite3');
  const path = require('path');
  const dbPath = path.join(process.cwd(), 'data', 'tasks.db');
  const db = new Database(dbPath);
  
  try {
    db.prepare(`
      UPDATE tasks 
      SET status = 'done', completed_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), data.id);
    
    console.log('[Webhook] 任务已完成:', data.id);
  } finally {
    db.close();
  }
}

// 处理 Agent 消息
async function handleAgentMessage(data) {
  console.log('[Webhook] Agent 消息:', data.agent_id, '-', data.message?.substring(0, 50));
}

// GET /api/webhook/config
// 返回 Webhook 配置信息
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      url: `${req.protocol}://${req.get('host')}/api/webhook/openclaw`,
      supportedEvents: [
        'task.created',
        'task.updated', 
        'task.completed',
        'agent.message'
      ],
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Token': process.env.WEBHOOK_TOKEN || '未配置'
      }
    }
  });
});

module.exports = router;
