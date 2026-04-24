/**
 * API 限流保护中间件
 * 功能：全局限流控制、请求队列、自动重试
 */

class RateLimitManager {
  constructor(options = {}) {
    // 限流配置 (Jina API 免费层：100 RPM, 100K TPM)
    this.rpm = options.rpm || 80; // 每分钟请求数 (留 20% 余量)
    this.tpm = options.tpm || 80000; // 每分钟 token 数
    this.concurrent = options.concurrent || 2; // 最大并发数
    
    // 重试配置
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    
    // 请求跟踪
    this.requests = []; // 最近 60 秒的请求记录
    this.tokenCount = 0; // 当前分钟已用 token 数
    this.activeRequests = 0; // 当前活跃请求数
    this.queue = []; // 请求队列
    
    // 统计
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      retries: 0,
      rateLimitHits: 0
    };
    
    // 每分钟重置计数器
    this.resetInterval = setInterval(() => {
      this.tokenCount = 0;
      this.requests = [];
      console.log('[RateLimit] 计数器已重置');
    }, 60000);
  }
  
  /**
   * 计算指数退避延迟
   */
  calculateDelay(attempt) {
    const exponential = this.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 500;
    return Math.min(exponential + jitter, this.maxDelay);
  }
  
  /**
   * 检查是否可以发送请求
   */
  canSendRequest() {
    const now = Date.now();
    
    // 清理 60 秒前的请求
    this.requests = this.requests.filter(r => now - r.timestamp < 60000);
    
    // 检查 RPM
    if (this.requests.length >= this.rpm) {
      return false;
    }
    
    // 检查 TPM
    if (this.tokenCount >= this.tpm) {
      return false;
    }
    
    // 检查并发
    if (this.activeRequests >= this.concurrent) {
      return false;
    }
    
    return true;
  }
  
  /**
   * 等待直到可以发送请求
   */
  async waitForSlot() {
    while (!this.canSendRequest()) {
      await this.sleep(500);
    }
  }
  
  /**
   * 带限流保护的请求
   */
  async request(fn, tokenEstimate = 100) {
    this.stats.total++;
    
    // 等待可用槽位
    await this.waitForSlot();
    
    this.activeRequests++;
    this.requests.push({ timestamp: Date.now() });
    this.tokenCount += tokenEstimate;
    
    try {
      const result = await fn();
      this.stats.success++;
      return result;
    } catch (error) {
      this.stats.failed++;
      throw error;
    } finally {
      this.activeRequests--;
    }
  }
  
  /**
   * 带重试的请求
   */
  async requestWithRetry(fn, tokenEstimate = 100, attempt = 0) {
    try {
      return await this.request(async () => {
        return await fn();
      }, tokenEstimate);
    } catch (error) {
      // 判断是否重试
      const isRetryable = error.status === 429 || 
                         error.code === 'ECONNRESET' || 
                         error.code === 'ETIMEDOUT';
      
      if (isRetryable && attempt < this.maxRetries) {
        this.stats.retries++;
        const delay = this.calculateDelay(attempt);
        console.log(`[RateLimit] 重试 ${attempt + 1}/${this.maxRetries}, 延迟 ${delay}ms`);
        await this.sleep(delay);
        return this.requestWithRetry(fn, tokenEstimate, attempt + 1);
      }
      
      // 限流命中统计
      if (error.status === 429) {
        this.stats.rateLimitHits++;
      }
      
      throw error;
    }
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      recentRequests: this.requests.length,
      tokenUsage: this.tokenCount,
      rpm: this.rpm,
      tpm: this.tpm
    };
  }
  
  /**
   * 工具函数：睡眠
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 销毁
   */
  destroy() {
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
    }
  }
}

// 单例
let rateLimitManager = null;

function getRateLimitManager(options) {
  if (!rateLimitManager) {
    rateLimitManager = new RateLimitManager(options);
  }
  return rateLimitManager;
}

module.exports = {
  RateLimitManager,
  getRateLimitManager
};
