/**
 * Pending Assignments Data Access Layer
 * 处理待分配任务的数据库操作
 * 
 * 2026-03-29: 从 JSONL 文件迁移到 SQLite 数据库
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/tasks.db');
const LEGACY_FILE = path.join(__dirname, '../../data/pending-assignments.jsonl');

// 单例数据库连接
let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    // 启用 WAL 模式提高并发性能
    db.pragma('journal_mode = WAL');
  }
  return db;
}

/**
 * 初始化表（如果不存在）
 */
function initTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_assignments (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      agentId TEXT NOT NULL,
      taskTitle TEXT,
      taskDescription TEXT,
      status TEXT DEFAULT 'pending',
      createdAt TEXT NOT NULL,
      processedAt TEXT,
      error TEXT,
      retryCount INTEGER DEFAULT 0,
      lastAttemptAt TEXT
    )
  `);
}

/**
 * 添加待分配记录
 */
function addRecord(record) {
  initTable();
  const db = getDb();
  
  const entry = {
    id: record.id || `assignment-${Date.now()}`,
    taskId: record.taskId || '',
    agentId: record.agentId || '',
    taskTitle: record.taskTitle || '',
    taskDescription: record.taskDescription || '',
    status: record.status || 'pending',
    createdAt: record.createdAt || new Date().toISOString(),
    processedAt: record.processedAt || null,
    error: record.error || null,
    retryCount: record.retryCount || 0,
    lastAttemptAt: record.lastAttemptAt || null
  };
  
  const stmt = db.prepare(`
    INSERT INTO pending_assignments 
    (id, taskId, agentId, taskTitle, taskDescription, status, createdAt, processedAt, error, retryCount, lastAttemptAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    entry.id,
    entry.taskId,
    entry.agentId,
    entry.taskTitle,
    entry.taskDescription,
    entry.status,
    entry.createdAt,
    entry.processedAt,
    entry.error,
    entry.retryCount,
    entry.lastAttemptAt
  );
  
  return entry;
}

/**
 * 读取所有待分配记录
 */
function listRecords() {
  initTable();
  const db = getDb();
  
  const stmt = db.prepare('SELECT * FROM pending_assignments ORDER BY createdAt DESC');
  return stmt.all();
}

/**
 * 根据 taskId 获取所有记录
 * @param {string} taskId - 任务 ID
 * @returns {Array} 匹配的所有记录
 */
function getRecordsByTaskId(taskId) {
  initTable();
  const db = getDb();
  
  const stmt = db.prepare('SELECT * FROM pending_assignments WHERE taskId = ? ORDER BY createdAt DESC');
  return stmt.all(taskId);
}

/**
 * 获取待分配记录（按状态过滤）
 * @param {string} status - 状态过滤: 'pending', 'sent', 'doing', 'completed', null(全部)
 */
function getRecordsByStatus(status) {
  initTable();
  const db = getDb();
  
  if (!status) {
    return listRecords();
  }
  
  const stmt = db.prepare('SELECT * FROM pending_assignments WHERE status = ? ORDER BY createdAt DESC');
  return stmt.all(status);
}

/**
 * 获取 Agent 的执行队列
 * @param {string} agentId - Agent ID
 */
function getRecordsByAgent(agentId) {
  initTable();
  const db = getDb();
  
  const stmt = db.prepare('SELECT * FROM pending_assignments WHERE agentId = ? ORDER BY createdAt DESC');
  return stmt.all(agentId);
}

/**
 * 更新记录状态
 */
function updateRecordStatus(id, status, processedAt = null) {
  initTable();
  const db = getDb();
  
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    UPDATE pending_assignments 
    SET status = ?, processedAt = ?, lastAttemptAt = ?
    WHERE id = ?
  `);
  
  const result = stmt.run(status, processedAt || now, now, id);
  return result.changes > 0;
}

/**
 * 更新记录错误信息
 */
function updateRecordError(id, error, incrementRetry = true) {
  initTable();
  const db = getDb();
  
  if (incrementRetry) {
    const stmt = db.prepare(`
      UPDATE pending_assignments 
      SET error = ?, retryCount = retryCount + 1, lastAttemptAt = ?
      WHERE id = ?
    `);
    stmt.run(error, new Date().toISOString(), id);
  } else {
    const stmt = db.prepare(`
      UPDATE pending_assignments 
      SET error = ?, lastAttemptAt = ?
      WHERE id = ?
    `);
    stmt.run(error, new Date().toISOString(), id);
  }
}

/**
 * 删除待分配记录
 */
function deleteRecord(id) {
  initTable();
  const db = getDb();
  
  const stmt = db.prepare('DELETE FROM pending_assignments WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * 清除指定状态的记录
 */
function clearRecords(status) {
  initTable();
  const db = getDb();
  
  if (status) {
    const stmt = db.prepare('DELETE FROM pending_assignments WHERE status = ?');
    const result = stmt.run(status);
    return result.changes;
  } else {
    const stmt = db.prepare('DELETE FROM pending_assignments');
    const result = stmt.run();
    return result.changes;
  }
}

/**
 * 获取统计信息
 */
function getStats() {
  initTable();
  const db = getDb();
  
  const stmt = db.prepare(`
    SELECT 
      status,
      COUNT(*) as count
    FROM pending_assignments
    GROUP BY status
  `);
  
  const rows = stmt.all();
  const stats = {
    total: 0,
    pending: 0,
    sent: 0,
    doing: 0,
    completed: 0
  };
  
  rows.forEach(row => {
    stats[row.status] = row.count;
    stats.total += row.count;
  });
  
  return stats;
}

/**
 * 迁移 JSONL 数据到数据库（一次性）
 */
function migrateFromJsonl() {
  if (!fs.existsSync(LEGACY_FILE)) {
    console.log('[Migration] JSONL 文件不存在，无需迁移');
    return { migrated: 0, skipped: 0 };
  }
  
  initTable();
  const db = getDb();
  
  const content = fs.readFileSync(LEGACY_FILE, 'utf8');
  const lines = content.trim().split('\n').filter(line => line.trim());
  
  let migrated = 0;
  let skipped = 0;
  
  // 使用事务批量插入
  const insert = db.transaction(() => {
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        
        // 检查是否已存在
        const existing = db.prepare('SELECT id FROM pending_assignments WHERE id = ?').get(record.id);
        if (existing) {
          skipped++;
          continue;
        }
        
        addRecord(record);
        migrated++;
      } catch (e) {
        console.error('[Migration] 解析失败:', e.message);
        skipped++;
      }
    }
  });
  
  insert();
  
  console.log(`[Migration] 完成: ${migrated} 条迁移, ${skipped} 条跳过`);
  
  // 备份旧文件
  const backupPath = LEGACY_FILE + '.backup-' + Date.now();
  fs.renameSync(LEGACY_FILE, backupPath);
  console.log(`[Migration] 旧文件已备份到: ${backupPath}`);
  
  return { migrated, skipped };
}

/**
 * 检查文件是否存在（兼容旧代码）
 */
function fileExists() {
  // 数据库模式下总是返回 true
  return true;
}

module.exports = {
  addRecord,
  listRecords,
  getRecordsByTaskId,
  getRecordsByStatus,
  getRecordsByAgent,
  updateRecordStatus,
  updateRecordError,
  deleteRecord,
  clearRecords,
  getStats,
  migrateFromJsonl,
  fileExists,
  // 保留旧文件路径引用（兼容）
  ASSIGNMENTS_FILE: LEGACY_FILE
};