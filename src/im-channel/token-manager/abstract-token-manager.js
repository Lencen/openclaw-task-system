/**
 * Token 管理器抽象类
 * 所有平台的 Token 管理器都继承此类
 */

class AbstractTokenManager {
  /**
   * 构造函数
   * @param {object} config - 配置对象
   */
  constructor(config) {
    this.config = config;
    this.token = null;
    this.expiresAt = null;
    this.refreshOffset = config.token_refresh_offset || 300; // 默认 5 分钟
    this.refreshing = false;
    this.refreshQueue = [];
  }

  /**
   * 获取有效 Token
   * 自动处理过期和刷新
   */
  async getValidToken() {
    const now = Date.now();

    // 如果 token 不存在或即将过期（提前 refreshOffset 时间）
    if (!this.token || now + this.refreshOffset >= this.expiresAt) {
      // 使用信号量防止并发刷新
      if (this.refreshing) {
        return new Promise((resolve, reject) => {
          this.refreshQueue.push({ resolve, reject });
        });
      }

      this.refreshing = true;
      try {
        await this.refreshToken();
      } finally {
        this.refreshing = false;

        // 唤醒队列中的等待者
        this.refreshQueue.forEach(item => item.resolve(this.token));
        this.refreshQueue = [];
      }
    }

    return this.token;
  }

  /**
   * 刷新 Token（由子类实现）
   */
  async refreshToken() {
    throw new Error('refreshToken() must be implemented by subclass');
  }

  /**
   * 检查 Token 是否有效
   */
  isValid() {
    if (!this.token || !this.expiresAt) return false;
    return Date.now() < this.expiresAt;
  }

  /**
   * 清除 Token
   */
  clearToken() {
    this.token = null;
    this.expiresAt = null;
  }
}

module.exports = {
  AbstractTokenManager
};
