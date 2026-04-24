/**
 * API 注册与追踪系统
 * 
 * 功能：
 * 1. API 注册 - 所有 API 必须注册
 * 2. 引用追踪 - 记录 API 被哪些页面/脚本使用
 * 3. 调用记录 - 可选记录 API 调用日志
 * 4. 迁移支持 - 迁移时查看所有引用
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/api-registry.db');

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 初始化数据库
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 创建表
db.exec(`
  -- API 注册表
  CREATE TABLE IF NOT EXISTS api_registry (
    id TEXT PRIMARY KEY,
    method TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    description TEXT,
    deprecated INTEGER DEFAULT 0,
    replacement TEXT,
    tags TEXT,
    caller_type TEXT DEFAULT 'public',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- API 调用者表
  CREATE TABLE IF NOT EXISTS api_callers (
    id TEXT PRIMARY KEY,
    api_id TEXT,
    caller_type TEXT,
    caller_path TEXT,
    line_number INTEGER,
    call_count INTEGER DEFAULT 1,
    last_call_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (api_id) REFERENCES api_registry(id),
    UNIQUE(api_id, caller_path, line_number)
  );

  -- API 调用日志（可选开启）
  CREATE TABLE IF NOT EXISTS api_call_logs (
    id TEXT PRIMARY KEY,
    api_id TEXT,
    caller_path TEXT,
    request_method TEXT,
    request_params TEXT,
    response_status INTEGER,
    response_time_ms INTEGER,
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (api_id) REFERENCES api_registry(id)
  );

  -- 创建索引
  CREATE INDEX IF NOT EXISTS idx_api_path ON api_registry(path);
  CREATE INDEX IF NOT EXISTS idx_api_method ON api_registry(method);
  CREATE INDEX IF NOT EXISTS idx_callers_api ON api_callers(api_id);
  CREATE INDEX IF NOT EXISTS idx_callers_path ON api_callers(caller_path);
  CREATE INDEX IF NOT EXISTS idx_logs_api ON api_call_logs(api_id);
  CREATE INDEX IF NOT EXISTS idx_logs_time ON api_call_logs(created_at);
`);

/**
 * 注册 API
 */
function registerAPI(options) {
  const {
    method = 'GET',
    path,
    description = '',
    tags = [],
    callerType = 'public',  // public/internal/private
    deprecated = false,
    replacement = ''
  } = options;

  if (!path) {
    throw new Error('API path is required');
  }

  const id = generateAPIId(method, path);
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO api_registry 
    (id, method, path, description, deprecated, replacement, tags, caller_type, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  stmt.run(
    id,
    method.toUpperCase(),
    path,
    description,
    deprecated ? 1 : 0,
    replacement,
    JSON.stringify(tags),
    callerType
  );

  return { id, method, path };
}

/**
 * 批量注册 API
 */
function registerAPIs(apis) {
  const results = [];
  for (const api of apis) {
    try {
      results.push(registerAPI(api));
    } catch (e) {
      console.error(`注册 API 失败: ${api.path}`, e.message);
    }
  }
  return results;
}

/**
 * 获取 API 列表
 */
function listAPIs(options = {}) {
  const { deprecated, method, tag, search } = options;
  
  let sql = 'SELECT * FROM api_registry WHERE 1=1';
  const params = [];

  if (deprecated !== undefined) {
    sql += ' AND deprecated = ?';
    params.push(deprecated ? 1 : 0);
  }

  if (method) {
    sql += ' AND method = ?';
    params.push(method.toUpperCase());
  }

  if (tag) {
    sql += ' AND tags LIKE ?';
    params.push(`%"${tag}"%`);
  }

  if (search) {
    sql += ' AND (path LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY path';

  const rows = db.prepare(sql).all(...params);
  return rows.map(row => ({
    ...row,
    tags: JSON.parse(row.tags || '[]'),
    deprecated: Boolean(row.deprecated)
  }));
}

/**
 * 获取 API 详情（含调用者）
 */
function getAPIDetail(idOrPath) {
  // 先尝试按 ID 查找
  let api = db.prepare('SELECT * FROM api_registry WHERE id = ?').get(idOrPath);
  
  // 如果没找到，尝试按路径查找
  if (!api) {
    api = db.prepare('SELECT * FROM api_registry WHERE path = ?').get(idOrPath);
  }

  if (!api) {
    return null;
  }

  // 获取调用者
  const callers = db.prepare('SELECT * FROM api_callers WHERE api_id = ? ORDER BY last_call_at DESC').all(api.id);

  // 获取调用统计
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_calls,
      MAX(created_at) as last_call,
      MIN(created_at) as first_call
    FROM api_call_logs 
    WHERE api_id = ?
  `).get(api.id);

  return {
    ...api,
    tags: JSON.parse(api.tags || '[]'),
    deprecated: Boolean(api.deprecated),
    callers: callers.map(c => ({
      ...c,
      call_count: c.call_count || 0
    })),
    stats: stats || { total_calls: 0, last_call: null, first_call: null }
  };
}

/**
 * 扫描 API 使用情况
 */
function scanAPIUsage(apiPath, callerType = 'unknown', callerPath = 'unknown', lineNumber = 0) {
  const id = generateAPIId('GET', apiPath); // 简化：用 GET 作为默认方法
  
  // 检查 API 是否已注册
  let api = db.prepare('SELECT * FROM api_registry WHERE path = ?').get(apiPath);
  
  if (!api) {
    // 自动注册
    registerAPI({ path: apiPath, description: '自动注册' });
    api = db.prepare('SELECT * FROM api_registry WHERE path = ?').get(apiPath);
  }

  // 更新调用者
  const callerId = `${api.id}_${callerPath}_${lineNumber}`;
  const stmt = db.prepare(`
    INSERT INTO api_callers (id, api_id, caller_type, caller_path, line_number, call_count, last_call_at)
    VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET 
      call_count = call_count + 1,
      last_call_at = CURRENT_TIMESTAMP
  `);

  stmt.run(callerId, api.id, callerType, callerPath, lineNumber);

  return { apiId: api.id, callerId };
}

/**
 * 扫描代码库中的 API 使用
 */
function scanCodebase(basePath) {
  const results = {
    scanned: 0,
    found: 0,
    errors: []
  };

  const patterns = [
    /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /axios\.[a-z]+\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /request\s*\(\s*['"`]([^'"`]+)['"`]/g
  ];

  function scanFile(filePath, relativePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        patterns.forEach(pattern => {
          let match;
          pattern.lastIndex = 0;
          while ((match = pattern.exec(line)) !== null) {
            const apiPath = match[1];
            if (apiPath.startsWith('/api/')) {
              scanAPIUsage(apiPath, 'script', relativePath, index + 1);
              results.found++;
            }
          }
        });
      });

      results.scanned++;
    } catch (e) {
      results.errors.push({ path: relativePath, error: e.message });
    }
  }

  function scanDir(dirPath, relativeDir = '') {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.join(relativeDir, entry.name);
      
      if (entry.isDirectory()) {
        // 跳过 node_modules 等
        if (['node_modules', '.git', 'data', 'out'].includes(entry.name)) {
          continue;
        }
        scanDir(fullPath, relativePath);
      } else if (entry.isFile() && /\.(js|html|ts|vue)$/.test(entry.name)) {
        scanFile(fullPath, relativePath);
      }
    }
  }

  scanDir(basePath);
  return results;
}

/**
 * 记录 API 调用
 */
function logAPICall(options) {
  const {
    apiPath,
    callerPath,
    requestMethod = 'GET',
    requestParams = null,
    responseStatus = 200,
    responseTimeMs = 0,
    errorMessage = null
  } = options;

  // 获取或创建 API
  let api = db.prepare('SELECT * FROM api_registry WHERE path = ?').get(apiPath);
  if (!api) {
    registerAPI({ path: apiPath, description: '自动注册' });
    api = db.prepare('SELECT * FROM api_registry WHERE path = ?').get(apiPath);
  }

  const id = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const stmt = db.prepare(`
    INSERT INTO api_call_logs 
    (id, api_id, caller_path, request_method, request_params, response_status, response_time_ms, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    api.id,
    callerPath,
    requestMethod,
    requestParams ? JSON.stringify(requestParams) : null,
    responseStatus,
    responseTimeMs,
    errorMessage
  );

  return { id };
}

/**
 * 获取 API 调用日志
 */
function getAPICallLogs(apiId, options = {}) {
  const { limit = 100, offset = 0, status } = options;
  
  let sql = 'SELECT * FROM api_call_logs WHERE api_id = ?';
  const params = [apiId];

  if (status) {
    sql += ' AND response_status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(sql).all(...params);
}

/**
 * 标记 API 为废弃
 */
function deprecateAPI(apiPath, replacement = '') {
  const stmt = db.prepare(`
    UPDATE api_registry 
    SET deprecated = 1, replacement = ?, updated_at = CURRENT_TIMESTAMP
    WHERE path = ?
  `);

  const result = stmt.run(replacement, apiPath);
  return result.changes > 0;
}

/**
 * 删除 API
 */
function deleteAPI(apiPath) {
  // 先检查是否有调用者
  const api = db.prepare('SELECT * FROM api_registry WHERE path = ?').get(apiPath);
  
  if (!api) {
    return { success: false, error: 'API 不存在' };
  }

  const callers = db.prepare('SELECT COUNT(*) as count FROM api_callers WHERE api_id = ?').get(api.id);
  
  if (callers.count > 0) {
    return { 
      success: false, 
      error: `API 仍有 ${callers.count} 个调用者，请先迁移`,
      callers: db.prepare('SELECT * FROM api_callers WHERE api_id = ?').all(api.id)
    };
  }

  // 删除调用日志
  db.prepare('DELETE FROM api_call_logs WHERE api_id = ?').run(api.id);
  
  // 删除 API
  db.prepare('DELETE FROM api_registry WHERE id = ?').run(api.id);

  return { success: true };
}

/**
 * 获取迁移建议
 */
function getMigrationSuggestions() {
  // 查找废弃的 API
  const deprecatedAPIs = db.prepare(`
    SELECT r.*, 
           (SELECT COUNT(*) FROM api_callers c WHERE c.api_id = r.id) as caller_count
    FROM api_registry r
    WHERE r.deprecated = 1
  `).all();

  // 查找重复的 API（v2, v3 等）
  const duplicateAPIs = db.prepare(`
    SELECT 
      SUBSTR(path, 1, INSTR(path, '-v') - 1) as base_path,
      GROUP_CONCAT(path) as versions
    FROM api_registry
    WHERE path LIKE '%-v%'
    GROUP BY base_path
  `).all();

  return {
    deprecatedAPIs: deprecatedAPIs.map(a => ({
      ...a,
      tags: JSON.parse(a.tags || '[]'),
      deprecated: Boolean(a.deprecated)
    })),
    duplicateAPIs
  };
}

/**
 * 生成统计报告
 */
function getStats() {
  const totalAPIs = db.prepare('SELECT COUNT(*) as count FROM api_registry').get().count;
  const deprecatedAPIs = db.prepare('SELECT COUNT(*) as count FROM api_registry WHERE deprecated = 1').get().count;
  const totalCallers = db.prepare('SELECT COUNT(*) as count FROM api_callers').get().count;
  const totalLogs = db.prepare('SELECT COUNT(*) as count FROM api_call_logs').get().count;

  const methodStats = db.prepare(`
    SELECT method, COUNT(*) as count 
    FROM api_registry 
    GROUP BY method 
    ORDER BY count DESC
  `).all();

  const topCallers = db.prepare(`
    SELECT api_id, COUNT(*) as caller_count
    FROM api_callers
    GROUP BY api_id
    ORDER BY caller_count DESC
    LIMIT 10
  `).all();

  return {
    totalAPIs,
    deprecatedAPIs,
    totalCallers,
    totalLogs,
    methodStats,
    topCallers
  };
}

// 辅助函数
function generateAPIId(method, path) {
  const hash = require('crypto')
    .createHash('md5')
    .update(`${method}:${path}`)
    .digest('hex')
    .substring(0, 8);
  return `api_${method.toLowerCase()}_${hash}`;
}

module.exports = {
  registerAPI,
  registerAPIs,
  listAPIs,
  getAPIDetail,
  scanAPIUsage,
  scanCodebase,
  logAPICall,
  getAPICallLogs,
  deprecateAPI,
  deleteAPI,
  getMigrationSuggestions,
  getStats
};