/**
 * 微信 Token 管理器
 * 支持微信公众号/企业微信的 Token 获取和自动刷新
 */

const axios = require('axios');
const { AbstractTokenManager } = require('./abstract-token-manager');

class WechatTokenManager extends AbstractTokenManager {
  /**
   * 微信 Token 管理器
   * @param {object} config - 配置对象
   */
  constructor(config) {
    super(config);
    this.appId = config.wechat_app_id || config.wechat_corp_id;
    this.appSecret = config.wechat_app_secret || config.wechat_agent_secret;
    this.grantType = config.grant_type || 'client_credential';
    this.cacheKey = config.cache_key || `wechat_token_${this.appId}`;
  }

  /**
   * 刷新 Token（从微信 API 获取）
   */
  async refreshToken() {
    try {
      const url = 'https://api.weixin.qq.com/cgi-bin/token';
      const params = {
        grant_type: this.grantType,
        appid: this.appId,
        secret: this.appSecret
      };

      const response = await axios.get(url, { params });
      const data = response.data;

      if (data.errcode) {
        throw new Error(`获取微信 Token 失败: ${data.errmsg}`);
      }

      this.token = data.access_token;
      // 微信 Token 通常 7200 秒（2 小时），提前 refreshOffset 刷新
      this.expiresAt = Date.now() + (data.expires_in - this.refreshOffset) * 1000;

      console.log('[WechatToken] ✅ Token 刷新成功，expires_at:', 
        new Date(this.expiresAt).toISOString());

      return this.token;
    } catch (error) {
      console.error('[WechatToken] ❌ Token 刷新失败:', error.message);
      throw error;
    }
  }
}

module.exports = {
  WechatTokenManager
};
