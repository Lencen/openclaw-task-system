/**
 * NVIDIA NIM Gateway 限流保护中间件
 * 功能：防止触发 NVIDIA API 的速率限制 (HTTP 429)
 * 参考：https://build.nvidia.com/models
 */

class NVIDIARateLimiter {
  constructor(options = {}) {
    // NVIDIA NIM 默认限制（根据实际 API 调整）
    // 2026-03-26: NVIDIA 官方限制 40 RPM，设置为 35 留余量
    this.rpm = options.rpm || 35;        // 每分钟请求数
    this.tpm = options.tpm || 100000;    // 每分钟 token 数
    this.concurrent = options.concurrent || 3; // 最大并发数
    
    // 重试配置
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 2000; // 2 秒基础延迟
    this.maxDelay = options.maxDelay || 60000;  // 最多等待 60 秒
    
    // 请求跟踪
    this.requests = []; // 最近 60 秒的请求记录
    this.tokenCount = 0;
    this.activeRequests = 0;
    
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
      console.log('[NVIDIARateLimiter] 计数器已重置');
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
   * 带重试的请求（处理 429 限流）
   */
  async requestWithRetry(fn, tokenEstimate = 100, attempt = 0) {
    try {
      return await this.request(async () => {
        return await fn();
      }, tokenEstimate);
    } catch (error) {
      // 判断是否限流错误
      const isRateLimit = error.status === 429 || 
                         error.message?.includes('rate limit') ||
                         error.message?.includes('too many requests');
      
      if (isRateLimit && attempt < this.maxRetries) {
        this.stats.retries++;
        this.stats.rateLimitHits++;
        
        const delay = this.calculateDelay(attempt);
        console.log(`[NVIDIARateLimiter] 触发限流，重试 ${attempt + 1}/${this.maxRetries}, 延迟 ${delay}ms`);
        
        await this.sleep(delay);
        return this.requestWithRetry(fn, tokenEstimate, attempt + 1);
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

// 单例模式
let instance = null;

function getNVIDIARateLimiter(options = {}) {
  if (!instance) {
    instance = new NVIDIARateLimiter(options);
  }
  return instance;
}

module.exports = {
  NVIDIARateLimiter,
  getNVIDIARateLimiter
};
