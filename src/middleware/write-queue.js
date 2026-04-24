/**
 * 写入队列中间件
 * 
 * 功能：
 * 1. 所有写入请求进入队列，串行处理
 * 2. 避免并发写入导致数据丢失
 * 3. 支持追加式更新（数组字段）
 * 
 * 使用方式：
 * const result = await writeQueue.enqueue(async () => { ... });
 */

class WriteQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      avgWaitTime: 0
    };
  }

  /**
   * 将写入操作加入队列
   * @param {Function} operation - 异步操作函数
   * @param {Object} options - 选项
   * @returns {Promise} 操作结果
   */
  enqueue(operation, options = {}) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      this.queue.push({
        operation,
        options,
        startTime,
        resolve,
        reject
      });

      // 记录队列状态
      if (this.queue.length > 5) {
        console.log(`[WriteQueue] ⚠️ 队列积压: ${this.queue.length} 个请求`);
      }

      // 触发处理
      this.process();
    });
  }

  /**
   * 处理队列中的请求
   */
  async process() {
    // 如果正在处理或队列为空，直接返回
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      const { operation, options, startTime, resolve, reject } = item;

      try {
        // 执行操作
        const result = await operation();
        
        // 更新统计
        this.stats.total++;
        this.stats.success++;
        const waitTime = Date.now() - startTime;
        this.stats.avgWaitTime = (this.stats.avgWaitTime * (this.stats.total - 1) + waitTime) / this.stats.total;

        // 日志（仅详细模式）
        if (options.verbose || waitTime > 1000) {
          console.log(`[WriteQueue] ✅ 完成 (${waitTime}ms)`);
        }

        resolve(result);

      } catch (error) {
        this.stats.total++;
        this.stats.failed++;
        
        console.error(`[WriteQueue] ❌ 失败:`, error.message);
        reject(error);
      }
    }

    this.processing = false;
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      stats: this.stats
    };
  }

  /**
   * 清空队列（紧急情况）
   */
  clear() {
    const dropped = this.queue.length;
    this.queue.forEach(item => {
      item.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    console.log(`[WriteQueue] 🗑️ 已清空队列，丢弃 ${dropped} 个请求`);
    return dropped;
  }
}

// 单例模式
const writeQueue = new WriteQueue();

module.exports = writeQueue;