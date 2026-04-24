/**
 * 降级管理器 SQLite 连接池（Mock 版本）
 * 
 * 功能：
 * 1. SQLite 连接管理（Mock 实现）
 * 2. 键值对存储
 * 3. 降级锁数据持久化
 * 
 * @version 1.0.0
 * @created 2026-03-28
 */

// Mock 实现，等待 sqlite3 模块安装
const path = require('path');
const fs = require('fs');

// 数据库路径
const DB_PATH = path.join(__dirname, '../../data/locks.db');

/**
 * SQLite 连接池单例
 */
class SQLitePool {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.initPromise = null;
    this.mockStorage = new Map(); // Mock 存储
  }

  /**
   * 初始化数据库
   */
  async init() {
    if (this.initialized) {
      return this.db;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      try {
        // 确保目录存在
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        console.log('[SQLitePool] 数据库初始化成功（Mock 模式）');
        this.initialized = true;
        this.db = { mock: true };
        resolve(this.db);
      } catch (error) {
        this.initPromise = null;
        reject(error);
      }
    });

    return this.initPromise;
  }

  /**
   * 获取数据库实例
   */
  async getInstance() {
    if (!this.initialized) {
      await this.init();
    }
    return this.db;
  }

  /**
   * 设置键值
   * 
   * @param {string} key - 键
   * @param {object} value - 值
   * @param {number} ttl - 过期时间（毫秒）
   */
  async set(key, value, ttl = 600000) {
    const now = Date.now();
    const expiry = now + ttl;
    const jsonValue = JSON.stringify(value);
    
    this.mockStorage.set(key, {
      value: jsonValue,
      expiry,
      version: ttl,
      created_at: now,
      updated_at: now
    });
    
    return { success: true, key };
  }

  /**
   * 获取键值
   * 
   * @param {string} key - 键
   */
  async get(key) {
    const now = Date.now();
    const stored = this.mockStorage.get(key);
    
    if (!stored) {
      return null;
    }

    // 检查是否过期
    if (now > stored.expiry) {
      // 删除过期键
      this.mockStorage.delete(key);
      return null;
    }

    try {
      return JSON.parse(stored.value);
    } catch (e) {
      return null;
    }
  }

  /**
   * 删除键
   * 
   * @param {string} key - 键
   */
  async del(key) {
    const existed = this.mockStorage.has(key);
    this.mockStorage.delete(key);
    return { success: true, key, affected: existed ? 1 : 0 };
  }

  /**
   * 关闭连接
   */
  async close() {
    this.mockStorage.clear();
    this.initialized = false;
    this.db = null;
  }

  /**
   * 清理过期数据
   */
  async cleanupExpired() {
    const now = Date.now();
    let count = 0;
    
    for (const [key, stored] of this.mockStorage) {
      if (now > stored.expiry) {
        this.mockStorage.delete(key);
        count++;
      }
    }
    
    console.log(`[SQLitePool] 已清理 ${count} 条过期记录`);
    return { count };
  }
}

// 创建单例实例
const sqlitePool = new SQLitePool();

module.exports = sqlitePool;
