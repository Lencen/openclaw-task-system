/**
 * Fix Queue 数据访问层
 * 
 * 提供对 fix_queue 表的 CRUD 操作
 */

const SQLiteManager = require('./sqlite-manager');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class FixQueueDAL {
  constructor(dbPath) {
    this.manager = new SQLiteManager(dbPath);
    this.manager.connect();
    this.initTable();
  }

  /**
   * 初始化表结构
   */
  initTable() {
    const sql = "CREATE TABLE IF NOT EXISTS fix_queue (" +
      "id TEXT PRIMARY KEY," +
      "issue_id TEXT," +
      "task_id TEXT," +
      "title TEXT NOT NULL," +
      "description TEXT," +
      "priority TEXT DEFAULT 'P2'," +
      "status TEXT DEFAULT 'pending'," +
      "agent_id TEXT," +
      "started_at TEXT," +
      "completed_at TEXT," +
      "failed_at TEXT," +
      "result TEXT," +
      "error TEXT," +
      "created_at TEXT," +
      "updated_at TEXT" +
    ")";
    
    this.manager.run(sql);
    console.log('[FixQueueDAL] fix_queue 表已初始化');
  }

  /**
   * 创建修复记录
   */
  create(fixRecord) {
    const id = fixRecord.id || uuidv4();
    const sql = `
      INSERT INTO fix_queue (
        id, issue_id, task_id, title, description,
        priority, status, agent_id,
        started_at, completed_at, failed_at,
        result, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      id,
      fixRecord.issue_id || null,
      fixRecord.task_id || null,
      fixRecord.title || fixRecord.issue_title || 'Unknown',
      fixRecord.description || null,
      fixRecord.priority || 'P2',
      fixRecord.status || 'pending',
      fixRecord.agent_id || null,
      fixRecord.started_at || null,
      fixRecord.completed_at || null,
      fixRecord.failed_at || null,
      fixRecord.result ? JSON.stringify(fixRecord.result) : null,
      fixRecord.error || null,
      fixRecord.created_at || new Date().toISOString(),
      fixRecord.updated_at || new Date().toISOString()
    ];
    
    this.manager.run(sql, params);
    return this.get(id);
  }

  /**
   * 获取修复记录
   */
  get(id) {
    const row = this.manager.get('SELECT * FROM fix_queue WHERE id = ?', [id]);
    if (!row) return null;
    return this._parse(row);
  }

  /**
   * 列出修复记录
   */
  list(filter = {}) {
    let sql = 'SELECT * FROM fix_queue WHERE 1=1';
    const params = [];
    
    if (filter.status) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }
    if (filter.agentId) {
      sql += ' AND agent_id = ?';
      params.push(filter.agentId);
    }
    if (filter.issueId) {
      sql += ' AND issue_id = ?';
      params.push(filter.issueId);
    }
    if (filter.severity) {
      sql += ' AND severity = ?';
      params.push(filter.severity);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    return this.manager.all(sql, params).map(row => this._parse(row));
  }

  /**
   * 更新修复记录
   */
  update(id, updates) {
    const fields = [];
    const params = [];
    
    const simpleFields = ['issue_id', 'task_id', 'title', 'description', 'priority', 'status', 'agent_id'];
    simpleFields.forEach(f => {
      if (updates[f] !== undefined) {
        fields.push(`${f} = ?`);
        params.push(updates[f]);
      }
    });
    
    if (updates.started_at || updates.startedAt) {
      fields.push('started_at = ?');
      params.push(updates.started_at || updates.startedAt);
    }
    if (updates.completed_at || updates.completedAt) {
      fields.push('completed_at = ?');
      params.push(updates.completed_at || updates.completedAt);
    }
    if (updates.failed_at || updates.failedAt) {
      fields.push('failed_at = ?');
      params.push(updates.failed_at || updates.failedAt);
    }
    if (updates.result) {
      fields.push('result = ?');
      params.push(JSON.stringify(updates.result));
    }
    if (updates.error) {
      fields.push('error = ?');
      params.push(updates.error);
    }
    if (updates.updated_at || updates.updatedAt) {
      fields.push('updated_at = ?');
      params.push(updates.updated_at || updates.updatedAt);
    }
    
    if (fields.length === 0) return { changes: 0 };
    
    params.push(id);
    return this.manager.run(`UPDATE fix_queue SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  /**
   * 删除修复记录
   */
  delete(id) {
    return this.manager.run('DELETE FROM fix_queue WHERE id = ?', [id]);
  }

  /**
   * 统计
   */
  count(filter = {}) {
    let sql = 'SELECT COUNT(*) as count FROM fix_queue WHERE 1=1';
    const params = [];
    
    if (filter.status) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }
    
    return this.manager.get(sql, params).count;
  }

  /**
   * 解析数据
   */
  _parse(row) {
    const safeParseJSON = (str) => {
      if (!str) return null;
      try {
        return JSON.parse(str);
      } catch {
        // 如果不是 JSON 格式，返回原值
        return str;
      }
    };
    
    return {
      id: row.id,
      issue_id: row.issue_id,
      issue_title: row.title, // Map title to issue_title
      task_id: row.task_id,
      title: row.title,
      description: row.description,
      priority: row.priority || 'P2',
      status: row.status || 'pending',
      agent_id: row.agent_id,
      started_at: row.started_at,
      completed_at: row.completed_at,
      failed_at: row.failed_at,
      result: safeParseJSON(row.result),
      error: row.error,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * 关闭连接
   */
  close() {
    if (this.manager) {
      this.manager.close();
    }
  }
}

let instance = null;
function getFixQueueDAL(dbPath) {
  if (!instance) {
    instance = new FixQueueDAL(dbPath || path.join(__dirname, '../../data/tasks.db'));
  }
  return instance;
}

module.exports = { FixQueueDAL, getFixQueueDAL };
