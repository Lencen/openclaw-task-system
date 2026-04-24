/**
 * LRU Cache 实现
 * 用于内存管理优化，替代普通 Map
 * 
 * 特性：
 * - 基于 Map 实现 O(1) 的 get/set/delete
 * - 支持容量限制和内存大小限制
 * - 支持自定义大小计算函数
 * - 淘汰回调函数
 * 
 * @module LRUCache
 */

class LRUCache {
  constructor(options = {}) {
    this.max = options.max || Infinity;           // 最大条目数
    this.maxSize = options.maxSize || Infinity;   // 最大内存字节数
    this.sizeCalculation = options.sizeCalculation || (() => 1); // 大小计算函数
    this.dispose = options.dispose || null;       // 淘汰回调
    
    this.cache = new Map();       // 主缓存
    this._size = 0;               // 当前总大小（字节）
    this.hits = 0;                // 命中次数
    this.misses = 0;              // 未命中次数
    this.evictions = 0;           // 淘汰次数
  }

  /**
   * 获取缓存项
   * @param {string} key - 键
   * @returns {any} 值，不存在返回 undefined
   */
  get(key) {
    if (!this.cache.has(key)) {
      this.misses++;
      return undefined;
    }
    
    const value = this.cache.get(key);
    // 移动到最新位置（LRU）
    this.cache.delete(key);
    this.cache.set(key, value);
    
    this.hits++;
    return value;
  }

  /**
   * 设置缓存项
   * @param {string} key - 键
   * @param {any} value - 值
   * @returns {boolean} 是否成功
   */
  set(key, value) {
    const itemSize = this.sizeCalculation(value);
    
    // 如果已存在，先删除旧的
    if (this.cache.has(key)) {
      const oldValue = this.cache.get(key);
      const oldSize = this.sizeCalculation(oldValue);
      this._size -= oldSize;
      this.cache.delete(key);
    }
    
    // 检查单个项是否超过最大限制
    if (itemSize > this.maxSize) {
      return false;
    }
    
    // 淘汰旧项直到有足够空间
    while (this.cache.size >= this.max || this._size + itemSize > this.maxSize) {
      this.evictLRU();
    }
    
    // 添加新项
    this.cache.set(key, value);
    this._size += itemSize;
    
    return true;
  }

  /**
   * 删除缓存项
   * @param {string} key - 键
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    if (!this.cache.has(key)) {
      return false;
    }
    
    const value = this.cache.get(key);
    const itemSize = this.sizeCalculation(value);
    
    this.cache.delete(key);
    this._size -= itemSize;
    
    return true;
  }

  /**
   * 检查键是否存在
   * @param {string} key - 键
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
    if (this.dispose) {
      for (const [key, value] of this.cache) {
        this.dispose(value, key, 'clear');
      }
    }
    this.cache.clear();
    this._size = 0;
  }

  /**
   * 获取缓存大小
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }

  /**
   * 淘汰最久未使用的项
   * @private
   */
  evictLRU() {
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      const value = this.cache.get(firstKey);
      const itemSize = this.sizeCalculation(value);
      
      this.cache.delete(firstKey);
      this._size -= itemSize;
      this.evictions++;
      
      if (this.dispose) {
        this.dispose(value, firstKey, 'evict');
      }
    }
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      max: this.max,
      maxSize: this.maxSize,
      currentSize: this._size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%',
      evictions: this.evictions
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * 遍历缓存
   * @param {Function} callback - (value, key, cache) => void
   */
  forEach(callback) {
    this.cache.forEach((value, key) => {
      callback(value, key, this);
    });
  }

  /**
   * 转换为普通对象
   * @returns {Object}
   */
  toObject() {
    const obj = {};
    this.cache.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }

  /**
   * 从普通对象加载
   * @param {Object} obj
   */
  fromObject(obj) {
    this.clear();
    for (const [key, value] of Object.entries(obj)) {
      this.set(key, value);
    }
  }
}

module.exports = LRUCache;
