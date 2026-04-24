/**
 * 聊天消息存储服务
 * 
 * 提供消息的保存、查询、统计功能
 * 支持 SQLite 存储，同时保持 JSON 兼容
 */

const SQLiteManager = require('../db/sqlite-manager');
const path = require('path');
const fs = require('fs');

const DB_FILE = path.join(__dirname, '..', 'data', 'tasks.db');
const MESSAGES_FILE = path.join(__dirname, '..', 'data', 'messages.json');

class ChatMessageStore {
  constructor() {
    this.db = new SQLiteManager(DB_FILE);
    this.db.connect();
  }
  
  /**
   * 保存消息
   */
  saveMessage(msg) {
    const {
      id = Date.now(),
      timestamp = new Date().toISOString(),
      sender,
      senderType = 'human',
      text,
      targetAgent = null,
      roomId = null,
      messageType = 'text',
      metadata = null
    } = msg;
    
    if (!sender || !text) {
      throw new Error('发送者和内容不能为空');
    }
    
    // 保存到 SQLite
    this.db.run(`
      INSERT OR IGNORE INTO chat_messages 
      (id, timestamp, sender, sender_type, text, target_agent, room_id, message_type, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, timestamp, sender, senderType, text, targetAgent, roomId, messageType, metadata ? JSON.stringify(metadata) : null]);
    
    // 同时保存到 JSON（兼容）
    this.saveToJSON({ id, timestamp, sender, senderType, text, targetAgent, read: false });
    
    return { id, timestamp };
  }
  
  /**
   * 批量保存消息
   */
  saveMessages(messages) {
    let count = 0;
    
    const insertStmt = this.db.db.prepare(`
      INSERT OR IGNORE INTO chat_messages 
      (id, timestamp, sender, sender_type, text, target_agent, room_id, message_type, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    this.db.transaction(() => {
      for (const msg of messages) {
        try {
          insertStmt.run(
            msg.id || Date.now() + Math.random(),
            msg.timestamp || new Date().toISOString(),
            msg.sender,
            msg.senderType || msg.sender_type || 'human',
            msg.text,
            msg.targetAgent || msg.target_agent,
            msg.roomId || msg.room_id,
            msg.messageType || msg.message_type || 'text',
            msg.metadata ? JSON.stringify(msg.metadata) : null
          );
          count++;
        } catch (e) {
          console.error('[ChatStore] 插入失败:', e.message);
        }
      }
    })();
    
    return count;
  }
  
  /**
   * 保存到 JSON（兼容旧系统）
   */
  saveToJSON(msg) {
    try {
      let messages = [];
      if (fs.existsSync(MESSAGES_FILE)) {
        messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
      }
      
      // 检查是否已存在
      if (!messages.find(m => m.id === msg.id)) {
        messages.push({
          id: msg.id,
          timestamp: msg.timestamp,
          sender: msg.sender,
          senderType: msg.senderType,
          text: msg.text,
          targetAgent: msg.targetAgent,
          read: msg.read || false
        });
        
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
      }
    } catch (e) {
      console.error('[ChatStore] JSON 保存失败:', e.message);
    }
  }
  
  /**
   * 获取消息列表
   */
  getMessages(options = {}) {
    const { limit = 50, offset = 0, sender, roomId, since, until } = options;
    
    let sql = 'SELECT * FROM chat_messages WHERE 1=1';
    const params = [];
    
    if (sender) {
      sql += ' AND sender = ?';
      params.push(sender);
    }
    
    if (roomId) {
      sql += ' AND room_id = ?';
      params.push(roomId);
    }
    
    if (since) {
      sql += ' AND timestamp >= ?';
      params.push(since);
    }
    
    if (until) {
      sql += ' AND timestamp <= ?';
      params.push(until);
    }
    
    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return this.db.all(sql, params);
  }
  
  /**
   * 获取统计
   */
  getStats() {
    const total = this.db.get('SELECT COUNT(*) as count FROM chat_messages');
    const bySender = this.db.all('SELECT sender, COUNT(*) as count FROM chat_messages GROUP BY sender ORDER BY count DESC LIMIT 10');
    const byType = this.db.all('SELECT sender_type, COUNT(*) as count FROM chat_messages GROUP BY sender_type');
    const latest = this.db.get('SELECT * FROM chat_messages ORDER BY timestamp DESC LIMIT 1');
    const oldest = this.db.get('SELECT * FROM chat_messages ORDER BY timestamp ASC LIMIT 1');
    
    return {
      total: total.count,
      bySender,
      byType,
      latest,
      oldest
    };
  }
  
  // ========================================
  // Agent 通信记录方法
  // ========================================
  
  /**
   * 保存 Agent 通信记录
   */
  saveAgentCommunication(fromAgent, toAgent, message, options = {}) {
    const { roomId = null, messageType = 'text', metadata = null } = options;
    
    const result = this.db.run(`
      INSERT INTO agent_communications (from_agent, to_agent, message, room_id, message_type, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [fromAgent, toAgent, message, roomId, messageType, metadata ? JSON.stringify(metadata) : null]);
    
    return result.lastInsertRowid;
  }
  
  /**
   * 获取 Agent 通信列表
   */
  getAgentCommunications(options = {}) {
    const { 
      limit = 50, 
      offset = 0, 
      fromAgent, 
      toAgent, 
      roomId, 
      since, 
      until 
    } = options;
    
    let sql = 'SELECT * FROM agent_communications WHERE 1=1';
    const params = [];
    
    if (fromAgent) {
      sql += ' AND from_agent = ?';
      params.push(fromAgent);
    }
    
    if (toAgent) {
      sql += ' AND to_agent = ?';
      params.push(toAgent);
    }
    
    if (roomId) {
      sql += ' AND room_id = ?';
      params.push(roomId);
    }
    
    if (since) {
      sql += ' AND created_at >= ?';
      params.push(since);
    }
    
    if (until) {
      sql += ' AND created_at <= ?';
      params.push(until);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return this.db.all(sql, params);
  }
  
  /**
   * 获取 Agent 通信统计
   */
  getAgentCommunicationStats() {
    const total = this.db.get('SELECT COUNT(*) as count FROM agent_communications');
    const byFrom = this.db.all('SELECT from_agent, COUNT(*) as count FROM agent_communications GROUP BY from_agent ORDER BY count DESC LIMIT 10');
    const byTo = this.db.all('SELECT to_agent, COUNT(*) as count FROM agent_communications GROUP BY to_agent ORDER BY count DESC LIMIT 10');
    
    return {
      total: total ? total.count : 0,
      byFrom,
      byTo
    };
  }
}

// 单例
let instance = null;

function getChatMessageStore() {
  if (!instance) {
    instance = new ChatMessageStore();
  }
  return instance;
}

module.exports = { ChatMessageStore, getChatMessageStore };