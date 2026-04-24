/**
 * 内存管理模块
 * 提供内存上限配置、监控和预警功能
 * 
 * @module MemoryManager
 */

const LRUCache = require('./lru-cache');
const EventEmitter = require('events');

class MemoryManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // 配置
    this.maxTasks = options.maxTasks || 10000;           // 最大任务数
    this.maxMemoryMB = options.maxMemoryMB || 512;       // 最大内存 MB
    this.warningThreshold = options.warningThreshold || 0.8; // 预警阈值 (80%)
    this.monitorInterval = options.monitorInterval || 30000; // 监控间隔 ms
    
    // 创建 LRU Cache
    this.cache = new LRUCache({
      max: this.maxTasks,
      maxSize: this.maxMemoryMB * 1024 * 1024,
      sizeCalculation: (value) => {
        // 估算对象大小
        try {
          return JSON.stringify(value).length;
        } catch {
          return 1024; // 默认值 1KB
        }
      },
      dispose: (value, key, reason) => {
        // 被淘汰时持久化
        this.emit('evict', { key, value, reason });
      }
    });
    
    // 内存监控状态
    this.isMonitoring = false;
    this.monitorTimer = null;
    this.peakMemory = 0;
    this.warningCount = 0;
    
    // 启动监控
    this.startMonitoring();
  }

  /**
   * 获取缓存项
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return this.cache.get(key);
  }

  /**
   * 设置缓存项
   * @param {string} key
   * @param {any} value
   * @returns {boolean}
   */
  set(key, value) {
    const result = this.cache.set(key, value);
    if (!result) {
      this.emit('error', new Error(`Failed to set cache item: ${key}`));
    }
    return result;
  }

  /**
   * 删除缓存项
   * @param {string} key
   * @returns {boolean}
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * 检查键是否存在
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * 获取所有键
   * @returns {Iterator<string>}
   */
  keys() {
    return this.cache.keys();
  }

  /**
   * 获取所有值
   * @returns {Iterator<any>}
   */
  values() {
    return this.cache.values();
  }

  /**
   * 获取所有条目
   * @returns {Iterator<[string, any]>}
   */
  entries() {
    return this.cache.entries();
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.peakMemory = 0;
    this.warningCount = 0;
  }

  /**
   * 启动内存监控
   */
  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.monitorTimer = setInterval(() => {
      this.checkMemory();
    }, this.monitorInterval);
    
    this.emit('monitoring:started');
  }

  /**
   * 停止内存监控
   */
  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    
    this.isMonitoring = false;
    this.emit('monitoring:stopped');
  }

  /**
   * 检查内存使用情况
   * @private
   */
  checkMemory() {
    const usage = process.memoryUsage();
    const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    
    // 更新峰值
    if (usedMB > this.peakMemory) {
      this.peakMemory = usedMB;
    }
    
    const memoryInfo = {
      heapUsed: usedMB,
      heapTotal: totalMB,
      rss: rssMB,
      maxAllowed: this.maxMemoryMB,
      usagePercent: (usedMB / this.maxMemoryMB * 100).toFixed(2),
      peak: this.peakMemory,
      cacheSize: this.cache.size,
      cacheEntries: this.getCacheStats().size
    };
    
    // 检查是否超过阈值
    if (usedMB > this.maxMemoryMB * this.warningThreshold) {
      this.warningCount++;
      const warning = {
        level: usedMB > this.maxMemoryMB * 0.95 ? 'critical' : 'warning',
        message: `内存使用接近上限: ${usedMB}MB / ${this.maxMemoryMB}MB (${memoryInfo.usagePercent}%)`,
        ...memoryInfo
      };
      
      this.emit('memory:warning', warning);
      
      // 触发垃圾回收（如果可用）
      if (global.gc) {
        global.gc();
      }
    }
    
    // 定期发送状态报告
    this.emit('memory:status', memoryInfo);
  }

  /**
   * 强制垃圾回收（如果可用）
   * @returns {Object}
   */
  forceGC() {
    const before = process.memoryUsage();
    
    if (global.gc) {
      global.gc();
    }
    
    const after = process.memoryUsage();
    
    return {
      before: {
        heapUsed: Math.round(before.heapUsed / 1024 / 1024),
        rss: Math.round(before.rss / 1024 / 1024)
      },
      after: {
        heapUsed: Math.round(after.heapUsed / 1024 / 1024),
        rss: Math.round(after.rss / 1024 / 1024)
      },
      freed: Math.round((before.heapUsed - after.heapUsed) / 1024 / 1024)
    };
  }

  /**
   * 获取内存统计信息
   * @returns {Object}
   */
  getMemoryStats() {
    const usage = process.memoryUsage();
    
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      rss: Math.round(usage.rss / 1024 / 1024),
      external: Math.round((usage.external || 0) / 1024 / 1024),
      maxAllowed: this.maxMemoryMB,
      peak: this.peakMemory,
      warningCount: this.warningCount,
      usagePercent: (usage.heapUsed / 1024 / 1024 / this.maxMemoryMB * 100).toFixed(2) + '%'
    };
  }

  /**
   * 获取缓存统计信息
   * @returns {Object}
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * 获取完整状态报告
   * @returns {Object}
   */
  getStatus() {
    return {
      memory: this.getMemoryStats(),
      cache: this.getCacheStats(),
      config: {
        maxTasks: this.maxTasks,
        maxMemoryMB: this.maxMemoryMB,
        warningThreshold: this.warningThreshold,
        monitorInterval: this.monitorInterval
      },
      monitoring: this.isMonitoring
    };
  }

  /**
   * 调整配置
   * @param {Object} options
   */
  reconfigure(options) {
    if (options.maxTasks !== undefined) {
      this.maxTasks = options.maxTasks;
      this.cache.max = options.maxTasks;
    }
    
    if (options.maxMemoryMB !== undefined) {
      this.maxMemoryMB = options.maxMemoryMB;
      this.cache.maxSize = options.maxMemoryMB * 1024 * 1024;
    }
    
    if (options.warningThreshold !== undefined) {
      this.warningThreshold = options.warningThreshold;
    }
    
    if (options.monitorInterval !== undefined) {
      this.monitorInterval = options.monitorInterval;
      // 重启监控以应用新间隔
      this.stopMonitoring();
      this.startMonitoring();
    }
    
    this.emit('config:updated', this.getStatus().config);
  }

  /**
   * 转换为普通对象
   * @returns {Object}
   */
  toObject() {
    return this.cache.toObject();
  }

  /**
   * 从普通对象加载
   * @param {Object} obj
   */
  fromObject(obj) {
    this.cache.fromObject(obj);
  }
}

module.exports = MemoryManager;
