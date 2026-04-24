/**
 * IM 渠道工厂
 * 统一管理所有 IM 渠道
 */

const { ProviderFactory } = require('./provider-factory/index.js');
const { BaseChannel } = require('./channels/base-channel.js');
const { WechatChannel } = require('./channels/wechat-channel.js');
const { DingTalkChannel } = require('./channels/dingtalk-channel.js');

class ChannelManager {
  /**
   * 渠道管理器
   */
  constructor() {
    this.channels = new Map();
    this.providerFactory = new ProviderFactory();
    this.config = {};
  }

  /**
   * 设置配置
   */
  setConfig(config) {
    this.config = config;
    this.providerFactory.setConfig(config);
  }

  /**
   * 加载渠道
   */
  async loadChannel(channelName, channelConfig) {
    const channel = this.createChannel(channelName, channelConfig);
    
    await channel.startup();
    
    this.channels.set(channelName, channel);
    console.log(`[ChannelManager] ✅ 渠道已加载: ${channelName}`);
    
    return channel;
  }

  /**
   * 创建渠道实例
   */
  createChannel(channelName, channelConfig) {
    const fullConfig = { ...this.config, ...channelConfig };
    
    switch (channelName) {
      case 'wechat':
        return new WechatChannel(fullConfig, this.providerFactory);
      case 'dingtalk':
        return new DingTalkChannel(fullConfig, this.providerFactory);
      default:
        throw new Error(`不支持的渠道: ${channelName}`);
    }
  }

  /**
   * 获取渠道
   */
  getChannel(channelName) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`渠道未加载: ${channelName}`);
    }
    return channel;
  }

  /**
   * 检查渠道是否已加载
   */
  hasChannel(channelName) {
    return this.channels.has(channelName);
  }

  /**
   * 移除渠道
   */
  async removeChannel(channelName) {
    const channel = this.channels.get(channelName);
    if (channel) {
      await channel.shutdown();
      this.channels.delete(channelName);
      console.log(`[ChannelManager] ✅ 渠道已移除: ${channelName}`);
    }
  }

  /**
   * 获取所有已加载的渠道
   */
  getAllChannels() {
    return [...this.channels.entries()].map(([name, channel]) => ({
      name,
      channel,
      initialized: channel.isInitialized()
    }));
  }

  /**
   * 通过 Webhook 处理消息
   */
  async handleWebhook(channelName, req, res) {
    const channel = this.getChannel(channelName);
    return await channel.handleWebhook(req, res);
  }
}

class IMChannelFactory {
  /**
   * IM 渠道工厂主类
   */
  constructor() {
    this.channelManager = new ChannelManager();
  }

  /**
   * 初始化
   */
  async initialize(config) {
    this.channelManager.setConfig(config);
  }

  /**
   * 加载单个渠道
   */
  async loadChannel(channelName, channelConfig) {
    return await this.channelManager.loadChannel(channelName, channelConfig);
  }

  /**
   * 加载多个渠道
   */
  async loadChannels(channelsConfig) {
    const results = [];
    for (const [name, config] of Object.entries(channelsConfig)) {
      try {
        await this.channelManager.loadChannel(name, config);
        results.push({ name, status: 'success' });
      } catch (error) {
        console.error(`[IMChannelFactory] ❌ 加载渠道失败: ${name}`, error.message);
        results.push({ name, status: 'error', error: error.message });
      }
    }
    return results;
  }

  /**
   * 获取渠道管理器
   */
  getChannelManager() {
    return this.channelManager;
  }

  /**
   * 获取 Provider Factory
   */
  getProviderFactory() {
    return this.channelManager.providerFactory;
  }
}

module.exports = {
  IMChannelFactory,
  ChannelManager,
  ProviderFactory
};
