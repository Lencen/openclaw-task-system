/**
 * Pending Spawns Data Access Layer
 * 处理待启动 Subagent 的数据库操作
 * 
 * 2026-03-31: 从 JSONL 文件迁移到 SQLite 数据库
 * 用于替代 pending-spawns.jsonl 文件
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/tasks.db');
const LEGACY_FILE = path.join(__dirname, '../../data/pending-spawns.jsonl');

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
    CREATE TABLE IF NOT EXISTS pending_spawns (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      agentId TEXT NOT NULL,
      taskTitle TEXT,
      taskDescription TEXT,
      status TEXT DEFAULT 'assigned',
      sessionKey TEXT,
      retryCount INTEGER DEFAULT 0,
      error TEXT,
      createdAt TEXT,
      startedAt TEXT,
      completedAt TEXT,
      FOREIGN KEY (taskId) REFERENCES tasks(id)
    )
  `);
}

/**
 * 添加待启动记录
 */
function addRecord(record) {
  initTable();
  const db = getDb();
  
  const entry = {
    id: record.id || `spawn-${record.taskId}-${Date.now()}`,
    taskId: record.taskId || '',
    agentId: record.agentId || '',
    taskTitle: record.taskTitle || '',
    taskDescription: record.taskDescription || '',
    status: record.status || 'assigned',
    sessionKey: record.sessionKey || null,
    retryCount: record.retryCount || 0,
    error: record.error || null,
    createdAt: record.createdAt || new Date().toISOString(),
    startedAt: record.startedAt || null,
    completedAt: record.completedAt || null
  };
  
  const stmt = db.prepare(`
    INSERT INTO pending_spawns 
    (id, taskId, agentId, taskTitle, taskDescription, status, sessionKey, retryCount, error, createdAt, startedAt, completedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    entry.id,
    entry.taskId,
    entry.agentId,
    entry.taskTitle,
    entry.taskDescription,
    entry.status,
    entry.sessionKey,
    entry.retryCount,
    entry.error,
    entry.createdAt,
    entry.startedAt,
    entry.completedAt
  );
  
  return entry;
}

/**
 * 读取所有待启动记录
 */
function listRecords() {
  initTable();
  const db = getDb();
  
  const stmt = db.prepare('SELECT * FROM pending_spawns ORDER BY createdAt DESC');
  return stmt.all();
}

/**
 * 获取待启动记录（按状态过滤）
 * @param {string} status - 状态过滤: 'assigned', 'doing', 'done', 'failed', null(全部)
 */
function getRecordsByStatus(status) {
  initTable();
  const db = getDb();
  
  if (!status) {
    return listRecords();
  }
  
  const stmt = db.prepare('SELECT * FROM pending_spawns WHERE status = ? ORDER BY createdAt DESC');
  return stmt.all(status);
}

/**
 * 获取 Agent 的待启动队列
 * @param {string} agentId - Agent ID
 */
function getRecordsByAgent(agentId) {
  initTable();
  const db = getDb();
  
  const stmt = db.prepare('SELECT * FROM pending_spawns WHERE agentId = ? ORDER BY createdAt DESC');
  return stmt.all(agentId);
}

/**
 * 获取任务的待启动记录
 * @param {string} taskId - 任务 ID
 */
function getRecordsByTask(taskId) {
  initTable();
  const db = getDb();
  
  const stmt = db.prepare('SELECT * FROM pending_spawns WHERE taskId = ? ORDER BY createdAt DESC');
  return stmt.all(taskId);
}

/**
 * 更新记录状态
 */
function updateRecordStatus(id, status, startedAt = null, completedAt = null) {
  initTable();
  const db = getDb();
  
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    UPDATE pending_spawns 
    SET status = ?, 
        startedAt = COALESCE(startedAt, ?),
        completedAt = ?
    WHERE id = ?
  `);
  
  const result = stmt.run(status, startedAt || now, completedAt || now, id);
  return result.changes > 0;
}

/**
 * 更新记录sessionKey
 */
function updateRecordSessionKey(id, sessionKey) {
  initTable();
  const db = getDb();
  
  const stmt = db.prepare(`
    UPDATE pending_spawns 
    SET sessionKey = ?, startedAt = COALESCE(startedAt, ?)
    WHERE id = ?
  `);
  
  const result = stmt.run(sessionKey, new Date().toISOString(), id);
  return result.changes > 0;
}

/**
 * 更新记录错误信息
 */
function updateRecordError(id, error, incrementRetry = true) {
  initTable();
  const db = getDb();
  
  const now = new Date().toISOString();
  
  if (incrementRetry) {
    const stmt = db.prepare(`
      UPDATE pending_spawns 
      SET error = ?, retryCount = retryCount + 1
      WHERE id = ?
    `);
    stmt.run(error, id);
  } else {
    const stmt = db.prepare(`
      UPDATE pending_spawns 
      SET error = ?
      WHERE id = ?
    `);
    stmt.run(error, id);
  }
}

/**
 * 删除待启动记录
 */
function deleteRecord(id) {
  initTable();
  const db = getDb();
  
  const stmt = db.prepare('DELETE FROM pending_spawns WHERE id = ?');
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
    const stmt = db.prepare('DELETE FROM pending_spawns WHERE status = ?');
    const result = stmt.run(status);
    return result.changes;
  } else {
    const stmt = db.prepare('DELETE FROM pending_spawns');
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
    FROM pending_spawns
    GROUP BY status
  `);
  
  const rows = stmt.all();
  const stats = {
    total: 0,
    assigned: 0,
    doing: 0,
    done: 0,
    failed: 0
  };
  
  rows.forEach(row => {
    stats[row.status] = row.count;
    stats.total += row.count;
  });
  
  return stats;
}

/**
 * 获取超时的待启动记录
 * @param {number} timeoutMs - 超时阈值（毫秒）
 */
function getTimedOutRecords(timeoutMs) {
  initTable();
  const db = getDb();
  
  const cutoffTime = new Date(Date.now() - timeoutMs).toISOString();
  
  const stmt = db.prepare(`
    SELECT * FROM pending_spawns 
    WHERE status IN ('assigned', 'doing')
    AND startedAt IS NOT NULL
    AND startedAt < ?
    ORDER BY startedAt ASC
  `);
  
  return stmt.all(cutoffTime);
}

/**
 * 检查 sessionKey 是否还活跃
 * @param {string} sessionKey - 会话密钥
 */
function isSessionAlive(sessionKey) {
  if (!sessionKey) {
    return false;
  }
  
  // 检查 sessionKey 是否在活跃 session 列表中
  const sessionFile = path.join(__dirname, '../../data/active-sessions.json');
  
  if (!fs.existsSync(sessionFile)) {
    return false;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    return data.sessions && data.sessions.includes(sessionKey);
  } catch (e) {
    console.error('[pending-spawns-dal] 检查 sessionKey 失败:', e.message);
    return false;
  }
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
        const existing = db.prepare('SELECT id FROM pending_spawns WHERE id = ?').get(record.id);
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
  getRecordsByStatus,
  getRecordsByAgent,
  getRecordsByTask,
  updateRecordStatus,
  updateRecordSessionKey,
  updateRecordError,
  deleteRecord,
  clearRecords,
  getStats,
  getTimedOutRecords,
  isSessionAlive,
  migrateFromJsonl,
  fileExists,
  // 保留旧文件路径引用（兼容）
  SPAWNS_FILE: LEGACY_FILE
};
