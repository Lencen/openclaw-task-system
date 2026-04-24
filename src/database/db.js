/**
 * 数据库服务 - 任务管理平台 V3
 * 
 * 功能：
 * 1. SQLite 数据库连接
 * 2. CRUD 操作封装
 * 3. 事务支持
 * 4. 查询构建器
 * 
 * @version 1.0.0
 * @created 2026-03-19
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 数据目录
const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'task-platform-v3.db');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * 数据库服务类
 */
class Database {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  /**
   * 初始化数据库连接
   */
  async init() {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(DB_FILE, (err) => {
        if (err) {
          console.error('[Database] 连接失败:', err.message);
          reject(err);
          return;
        }

        console.log('[Database] 连接成功:', DB_FILE);
        
        // 启用外键约束
        this.db.run('PRAGMA foreign_keys = ON');
        
        this.initialized = true;
        resolve();
      });
    });
  }

  /**
   * 初始化 Schema
   */
  async initSchema() {
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    
    if (!fs.existsSync(schemaPath)) {
      console.warn('[Database] Schema 文件不存在:', schemaPath);
      return;
    }

    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    return new Promise((resolve, reject) => {
      this.db.exec(schema, (err) => {
        if (err) {
          console.error('[Database] Schema 初始化失败:', err.message);
          reject(err);
          return;
        }
        console.log('[Database] Schema 初始化成功');
        resolve();
      });
    });
  }

  /**
   * 执行查询（返回所有结果）
   */
  async all(sql, params = []) {
    await this.ensureInit();
    
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('[Database] 查询失败:', sql, err.message);
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * 执行查询（返回单条结果）
   */
  async get(sql, params = []) {
    await this.ensureInit();
    
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          console.error('[Database] 查询失败:', sql, err.message);
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  }

  /**
   * 执行语句（INSERT/UPDATE/DELETE）
   */
  async run(sql, params = []) {
    await this.ensureInit();
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          console.error('[Database] 执行失败:', sql, err.message);
          reject(err);
          return;
        }
        resolve({
          lastID: this.lastID,
          changes: this.changes
        });
      });
    });
  }

  /**
   * 执行事务
   */
  async transaction(callback) {
    await this.ensureInit();
    
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        callback(this)
          .then(result => {
            this.db.run('COMMIT');
            resolve(result);
          })
          .catch(err => {
            this.db.run('ROLLBACK');
            reject(err);
          });
      });
    });
  }

  /**
   * 确保已初始化
   */
  async ensureInit() {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * 关闭连接
   */
  async close() {
    if (!this.db) return;
    
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        this.initialized = false;
        console.log('[Database] 连接已关闭');
        resolve();
      });
    });
  }

  /**
   * 生成 UUID
   */
  generateId(prefix = '') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return prefix ? `${prefix}-${timestamp}${random}` : `${timestamp}${random}`;
  }

  /**
   * 格式化日期
   */
  formatDate(date) {
    if (!date) return null;
    const d = new Date(date);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
}

// 单例实例
const db = new Database();

// 导出
module.exports = {
  Database,
  db
};