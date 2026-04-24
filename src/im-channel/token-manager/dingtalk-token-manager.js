/**
 * 钉钉 Token 管理器
 * 支持钉钉开放平台的 Token 获取和自动刷新
 */

const axios = require('axios');
const { AbstractTokenManager } = require('./abstract-token-manager');

class DingTalkTokenManager extends AbstractTokenManager {
  /**
   * 钉钉 Token 管理器
   * @param {object} config - 配置对象
   */
  constructor(config) {
    super(config);
    this.appKey = config.dingtalk_app_key;
    this.appSecret = config.dingtalk_app_secret;
  }

  /**
   * 刷新 Token（从钉钉 API 获取）
   */
  async refreshToken() {
    try {
      const url = 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken';
      
      const response = await axios.post(url, {
        client_id: this.appKey,
        client_secret: this.appSecret,
        grant_type: 'client_credentials'
      });

      const data = response.data;
      
      if (data.code) {
        throw new Error(`获取钉钉 Token 失败: ${data.message}`);
      }

      this.token = data.accessToken;
      // 钉钉 Token 过期时间，提前 refreshOffset 刷新
      this.expiresAt = Date.now() + (data.expireIn - this.refreshOffset) * 1000;

      console.log('[DingTalkToken] ✅ Token 刷新成功，expires_at:', 
        new Date(this.expiresAt).toISOString());

      return this.token;
    } catch (error) {
      console.error('[DingTalkToken] ❌ Token 刷新失败:', error.message);
      throw error;
    }
  }
}

module.exports = {
  DingTalkTokenManager
};
