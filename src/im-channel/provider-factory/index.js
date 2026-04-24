/**
 * Provider Factory - 统一 LLM 接口
 */

const { AbstractTokenManager } = require('../token-manager/abstract-token-manager');
const { WechatTokenManager } = require('../token-manager/wechat-token-manager');
const { DingTalkTokenManager } = require('../token-manager/dingtalk-token-manager');

class ChannelProvider {
  /**
   * 渠道提供商基类
   */
  constructor(channelName, tokenManager) {
    this.channelName = channelName;
    this.tokenManager = tokenManager;
  }

  /**
   * 生成响应
   * @param {any} input - 输入（文本、消息对象等）
   * @returns {Promise<object>} - 响应对象
   */
  async generate(input) {
    throw new Error('generate() must be implemented by subclass');
  }

  /**
   * 获取 Token
   */
  async getToken() {
    if (this.tokenManager) {
      return await this.tokenManager.getValidToken();
    }
    return null;
  }
}

class WechatChannelProvider extends ChannelProvider {
  /**
   * 微信渠道提供商
   */
  constructor(config) {
    super('wechat', new WechatTokenManager(config));
    this.apiBase = config.wechat_api_base || 'https://api.example.com';
  }

  async generate(input) {
    // 微信特殊处理逻辑
    const token = await this.getToken();
    
    // 构建请求
    const requestBody = {
      messages: Array.isArray(input) ? input : [{ role: 'user', content: input }],
      channel: 'wechat'
    };

    // TODO: 调用实际的 LLM API
    console.log('[WechatProvider] 生成响应:', requestBody);

    return {
      content: '待实现: 微信渠道 LLM 调用',
      usage: { prompt_tokens: 0, completion_tokens: 0 }
    };
  }
}

class DingTalkChannelProvider extends ChannelProvider {
  /**
   * 钉钉渠道提供商
   */
  constructor(config) {
    super('dingtalk', new DingTalkTokenManager(config));
    this.apiBase = config.dingtalk_api_base || 'https://api.dingtalk.com/v1.0';
  }

  async generate(input) {
    // 钉钉特殊处理逻辑
    const token = await this.getToken();
    
    // 构建请求
    const requestBody = {
      messages: Array.isArray(input) ? input : [{ role: 'user', content: input }],
      channel: 'dingtalk'
    };

    // TODO: 调用实际的 LLM API
    console.log('[DingTalkProvider] 生成响应:', requestBody);

    return {
      content: '待实现: 钉钉渠道 LLM 调用',
      usage: { prompt_tokens: 0, completion_tokens: 0 }
    };
  }
}

class ProviderFactory {
  /**
   * Provider 工厂主类
   */
  constructor() {
    this.providers = new Map();
    this.config = {};
  }

  /**
   * 设置配置
   */
  setConfig(config) {
    this.config = config;
  }

  /**
   * 为特定渠道获取 Provider
   */
  getProviderForChannel(channelName) {
    if (!this.providers.has(channelName)) {
      const provider = this.createProviderForChannel(channelName);
      this.providers.set(channelName, provider);
    }
    return this.providers.get(channelName);
  }

  /**
   * 为特定渠道创建 Provider
   */
  createProviderForChannel(channelName) {
    switch (channelName) {
      case 'wechat':
        return new WechatChannelProvider(this.config);
      case 'dingtalk':
        return new DingTalkChannelProvider(this.config);
      default:
        throw new Error(`不支持的渠道: ${channelName}`);
    }
  }

  /**
   * 注销 Provider
   */
  removeProvider(channelName) {
    this.providers.delete(channelName);
  }

  /**
   * 获取所有 Provider
   */
  getAllProviders() {
    return [...this.providers.entries()].map(([name, provider]) => ({
      channel: name,
      provider
    }));
  }
}

module.exports = {
  ProviderFactory,
  ChannelProvider,
  WechatChannelProvider,
  DingTalkChannelProvider
};
