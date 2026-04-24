const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class SQLiteManager {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.connected = false;
  }

  connect() {
    if (this.connected) return this.db;
    
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    
    this.connected = true;
    this.initTables();
    
    console.log('[SQLite] 已连接: ' + this.dbPath);
    return this.db;
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'P2',
        quadrant INTEGER DEFAULT 2,
        project_id TEXT,
        assigned_agent TEXT,
        user_description TEXT,
        message_hash TEXT,
        pretask_id TEXT,
        nexttask_id TEXT,
        is_quick INTEGER DEFAULT 0,
        total_steps INTEGER DEFAULT 1,
        completed_steps INTEGER DEFAULT 0,
        deadline TEXT,
        assigned_at TEXT,
        failed_at TEXT,
        failed_reason TEXT,
        last_status_change_at TEXT,
        status_change_reason TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        paused_at TEXT,
        completed_at TEXT,
        cancelled_at TEXT,
        analysis TEXT,
        breakdown TEXT,
        execution_log TEXT,
        issues TEXT,
        related_docs TEXT,
        test_acceptance TEXT,
        subagent_session TEXT,
        subagent_status TEXT,
        background TEXT,
        user_request TEXT,
        monitoring_requirements TEXT,
        logging_requirements TEXT,
        detail_requirements TEXT,
        testing_requirements TEXT,
        specs_url TEXT,
        plan_source TEXT,
        plan_status TEXT,
        audit_log TEXT,
        automation_monitor TEXT,
        analysis_details TEXT,
        collaboration TEXT,
        conclusion TEXT,
        duration_human TEXT,
        duration_minutes INTEGER DEFAULT 0,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        plan TEXT,
        process_validation TEXT,
        quality_acceptance TEXT,
        reflection TEXT,
        tool_calls TEXT,
        tool_stats TEXT,
        total_tokens INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'open',
        severity TEXT DEFAULT 'medium',
        priority TEXT DEFAULT 'P2',
        category TEXT,
        task_id TEXT,
        project_id TEXT,
        reporter TEXT,
        assignee TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        resolved_at TEXT,
        closed_at TEXT,
        root_cause TEXT,
        solution TEXT,
        resolution TEXT,
        reflection TEXT,
        tags TEXT,
        related_issues TEXT
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'planning',
        priority TEXT DEFAULT 'medium',
        progress INTEGER DEFAULT 0,
        owner TEXT,
        product_id TEXT,
        total_tasks INTEGER DEFAULT 0,
        completed_tasks INTEGER DEFAULT 0,
        start_date TEXT,
        end_date TEXT,
        deadline TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        completed_at TEXT,
        tags TEXT,
        related_docs TEXT,
        milestones TEXT
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY,
        timestamp TEXT NOT NULL,
        sender TEXT NOT NULL,
        sender_type TEXT DEFAULT 'human',
        text TEXT,
        target_agent TEXT,
        room_id TEXT,
        message_type TEXT DEFAULT 'text',
        metadata TEXT,
        read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id);

      CREATE TABLE IF NOT EXISTS agent_communications (
        id INTEGER PRIMARY KEY,
        from_agent TEXT NOT NULL,
        to_agent TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        room_id TEXT,
        message_type TEXT DEFAULT 'text',
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_agent_comm_from ON agent_communications(from_agent);
      CREATE INDEX IF NOT EXISTS idx_agent_comm_to ON agent_communications(to_agent);
      CREATE INDEX IF NOT EXISTS idx_agent_comm_room ON agent_communications(room_id);
    `);
    
    console.log('[SQLite] 表结构已初始化');
  }

  run(sql, params = []) {
    if (!this.connected) this.connect();
    try {
      return this.db.prepare(sql).run(...params);
    } catch (err) {
      console.error('[SQLite] 执行失败:', err.message);
      throw err;
    }
  }

  get(sql, params = []) {
    if (!this.connected) this.connect();
    return this.db.prepare(sql).get(...params);
  }

  all(sql, params = []) {
    if (!this.connected) this.connect();
    return this.db.prepare(sql).all(...params);
  }

  transaction(fn) {
    if (!this.connected) this.connect();
    return this.db.transaction(fn)();
  }

  close() {
    if (this.db) {
      this.db.close();
      this.connected = false;
    }
  }
}

module.exports = SQLiteManager;
