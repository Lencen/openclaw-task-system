/**
 * 聊天消息 API
 * 
 * GET  /api/chat-messages - 获取消息列表
 * GET  /api/chat-messages/stats - 获取统计
 * GET  /api/chat-messages/:id - 获取单条消息
 * POST /api/chat-messages - 创建消息
 * POST /api/chat-messages/batch - 批量创建
 */

const express = require('express');
const router = express.Router();
const SQLiteManager = require('../db/sqlite-manager');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'tasks.db');
const db = new SQLiteManager(DB_FILE);

// 连接数据库
db.connect();

/**
 * GET /api/chat-messages
 * 获取消息列表
 * 
 * Query params:
 * - limit: 限制数量 (default: 50)
 * - offset: 偏移量
 * - sender: 发送者筛选
 * - room_id: 房间筛选
 * - since: 起始时间
 * - until: 结束时间
 */
router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, sender, room_id, since, until } = req.query;
    
    let sql = 'SELECT * FROM chat_messages WHERE 1=1';
    const params = [];
    
    if (sender) {
      sql += ' AND sender = ?';
      params.push(sender);
    }
    
    if (room_id) {
      sql += ' AND room_id = ?';
      params.push(room_id);
    }
    
    if (since) {
      sql += ' AND timestamp >= ?';
      params.push(since);
    }
    
    if (until) {
      sql += ' AND timestamp <= ?';
      params.push(until);
    }
    
    // 获取总数
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countResult = db.get(countSql, params);
    
    // 排序和分页
    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const messages = db.all(sql, params);
    
    res.json({
      success: true,
      data: {
        messages,
        total: countResult.total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    console.error('[ChatMessages] 查询失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/chat-messages/stats
 * 获取统计
 */
router.get('/stats', (req, res) => {
  try {
    const total = db.get('SELECT COUNT(*) as count FROM chat_messages');
    const bySender = db.all('SELECT sender, COUNT(*) as count FROM chat_messages GROUP BY sender ORDER BY count DESC LIMIT 10');
    const byType = db.all('SELECT sender_type, COUNT(*) as count FROM chat_messages GROUP BY sender_type');
    const latest = db.get('SELECT * FROM chat_messages ORDER BY timestamp DESC LIMIT 1');
    const oldest = db.get('SELECT * FROM chat_messages ORDER BY timestamp ASC LIMIT 1');
    
    res.json({
      success: true,
      data: {
        total: total.count,
        bySender,
        byType,
        latest,
        oldest
      }
    });
  } catch (err) {
    console.error('[ChatMessages] 统计失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/chat-messages/:id
 * 获取单条消息
 */
router.get('/:id', (req, res) => {
  try {
    const message = db.get('SELECT * FROM chat_messages WHERE id = ?', [req.params.id]);
    
    if (!message) {
      return res.status(404).json({ success: false, error: '消息不存在' });
    }
    
    res.json({ success: true, data: message });
  } catch (err) {
    console.error('[ChatMessages] 查询失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/chat-messages
 * 创建消息
 */
router.post('/', (req, res) => {
  try {
    const { id, timestamp, sender, sender_type, text, target_agent, room_id, message_type, metadata } = req.body;
    
    if (!sender || !text) {
      return res.status(400).json({ success: false, error: '发送者和内容不能为空' });
    }
    
    const messageId = id || Date.now();
    const messageTime = timestamp || new Date().toISOString();
    
    db.run(`
      INSERT INTO chat_messages (id, timestamp, sender, sender_type, text, target_agent, room_id, message_type, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [messageId, messageTime, sender, sender_type || 'human', text, target_agent, room_id, message_type || 'text', metadata ? JSON.stringify(metadata) : null]);
    
    res.json({ success: true, data: { id: messageId } });
  } catch (err) {
    console.error('[ChatMessages] 创建失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/chat-messages/batch
 * 批量创建消息
 */
router.post('/batch', (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: '消息数组不能为空' });
    }
    
    const insertStmt = db.db.prepare(`
      INSERT OR IGNORE INTO chat_messages (id, timestamp, sender, sender_type, text, target_agent, room_id, message_type, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    let successCount = 0;
    
    db.transaction(() => {
      for (const msg of messages) {
        try {
          insertStmt.run(
            msg.id || Date.now() + Math.random(),
            msg.timestamp || new Date().toISOString(),
            msg.sender,
            msg.sender_type || 'human',
            msg.text,
            msg.target_agent,
            msg.room_id,
            msg.message_type || 'text',
            msg.metadata ? JSON.stringify(msg.metadata) : null
          );
          successCount++;
        } catch (e) {
          console.error('[ChatMessages] 批量插入失败:', e.message);
        }
      }
    })();
    
    res.json({ success: true, data: { count: successCount } });
  } catch (err) {
    console.error('[ChatMessages] 批量创建失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;