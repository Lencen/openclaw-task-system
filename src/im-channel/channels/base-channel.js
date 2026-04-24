/**
 * 渠道基类
 * 所有 IM 渠道都继承自此基类
 */

class BaseChannel {
  /**
   * 构造函数
   * @param {object} config - 渠道配置
   * @param {object} providerFactory - Provider Factory 实例
   */
  constructor(config, providerFactory) {
    this.config = config;
    this.providerFactory = providerFactory;
    this.channelName = 'base';
    this.initialized = false;
  }

  /**
   * 启动通道
   */
  async startup() {
    console.log(`[${this.getChannelName()}] 🚀 启动 ${this.getChannelName()} 通道...`);
    this.initialized = true;
    console.log(`[${this.getChannelName()}] ✅ ${this.getChannelName()} 通道启动完成`);
  }

  /**
   * 停止通道
   */
  async shutdown() {
    console.log(`[${this.getChannelName()}] 🛑 停止 ${this.getChannelName()} 通道...`);
    this.initialized = false;
    console.log(`[${this.getChannelName()}] ✅ ${this.getChannelName()} 通道已停止`);
  }

  /**
   * 获取渠道名称
   */
  getChannelName() {
    return this.channelName;
  }

  /**
   * 解析消息
   * @param {object} payload - 原始消息负载
   */
  parseMessage(payload) {
    throw new Error('parseMessage() must be implemented by subclass');
  }

  /**
   * 处理消息
   * @param {object} message - 解析后的消息对象
   */
  async handleMessage(message) {
    throw new Error('handleMessage() must be implemented by subclass');
  }

  /**
   * 发送文本消息
   * @param {string} toChatId - 目标聊天 ID
   * @param {string} content - 消息内容
   */
  async sendText(toChatId, content) {
    throw new Error('sendText() must be implemented by subclass');
  }

  /**
   * 发送图片消息
   * @param {string} toChatId - 目标聊天 ID
   * @param {string} mediaId - 图片媒体 ID
   */
  async sendImage(toChatId, mediaId) {
    throw new Error('sendImage() must be implemented by subclass');
  }

  /**
   * 获取 Provider
   */
  getProvider() {
    if (!this.providerFactory) {
      throw new Error('ProviderFactory not set');
    }
    return this.providerFactory.getProviderForChannel(this.channelName);
  }

  /**
   * 检查是否已初始化
   */
  isInitialized() {
    return this.initialized;
  }
}

module.exports = {
  BaseChannel
};
