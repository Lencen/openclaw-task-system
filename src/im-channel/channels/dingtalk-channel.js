/**
 * 钉钉通道实现
 * 基于 cherry-studio 的 Provider Factory 设计
 */

const axios = require('axios');
const crypto = require('crypto');
const { BaseChannel } = require('./base-channel');

class DingTalkChannel extends BaseChannel {
  /**
   * 钉钉通道
   */
  constructor(config, providerFactory) {
    super(config, providerFactory);
    this.channelName = 'dingtalk';
    this.webhookUrl = config.dingtalk_webhook_url;
    this.signatureManager = new SignatureManager(config);
    this.tokenManager = require('../token-manager/dingtalk-token-manager');
    this.imageCache = new Map();
  }

  /**
   * 初始化
   */
  async startup() {
    await super.startup();
    
    // 获取有效的 Token
    const tokenManagerInstance = new this.tokenManager(this.config);
    await tokenManagerInstance.getValidToken();
    
    // 如果配置了 webhook，尝试注册
    if (this.webhookUrl) {
      try {
        const token = await tokenManagerInstance.getValidToken();
        await axios.post(
          `${this.webhookUrl}?access_token=${token}`,
          { enabled: true }
        );
        console.log('[DingTalk] ✅ Webhook 注册成功');
      } catch (error) {
        console.warn('[DingTalk] ⚠️ Webhook 注册失败（可选）:', error.message);
      }
    }
  }

  /**
   * 解析消息
   */
  parseMessage(payload) {
    const {
      chatTitle,
      chatId,
      senderId,
      senderNick,
      createTime,
      messageType,
      textContent,
      mediaId,
      fileCode
    } = payload;

    return {
      chatId,
      userId: senderId,
      userNick: senderNick,
      content: textContent,
      mediaId,
      fileCode,
      timestamp: createTime,
      type: messageType,
      raw: payload
    };
  }

  /**
   * 处理 Webhook 请求
   */
  async handleWebhook(req, res) {
    try {
      const payload = req.body;
      const timestamp = req.headers['x-clone-timestamp'];
      const signature = req.headers['x-clone-signature'];

      // 验证签名
      if (!this.signatureManager.validate(payload, timestamp, signature)) {
        console.error('[DingTalk] ❌ 签名验证失败');
        return res.status(403).send('Invalid signature');
      }

      // 解析消息
      const message = this.parseMessage(payload);

      // 处理消息
      await this.handleMessage(message);

      res.status(200).send('OK');
    } catch (error) {
      console.error('[DingTalk] ❌ Webhook 处理失败:', error.message);
      res.status(500).send('Internal Server Error');
    }
  }

  /**
   * 处理消息
   */
  async handleMessage(message) {
    console.log('[DingTalk] 📥 收到消息:', {
      user: message.userId,
      chat: message.chatId,
      type: message.type,
      content: message.content
    });

    let replyMessage = '';

    if (message.fileCode) {
      // 文件消息 - 缓存等待提问
      this.cacheMedia(message.fileCode, null, message.userId);
      replyMessage = '文件已保存，请提问相关问题';
    } else if (message.mediaId) {
      // 图片消息 - 缓存等待提问
      this.cacheMedia(message.mediaId, null, message.userId);
      replyMessage = '图片已保存，请提问相关问题';
    } else if (message.type === 'text') {
      // 文本消息 - 直接处理
      replyMessage = await this.processTextMessage(message);
    } else {
      replyMessage = '暂不支持的消息类型';
    }

    // 发送回复
    await this.sendText(message.chatId, replyMessage);
  }

  /**
   * 处理文本消息
   */
  async processTextMessage(message) {
    // 从缓存中获取未处理的图片
    for (const [key, entry] of this.imageCache.entries()) {
      if (entry.userId === message.userId) {
        this.imageCache.delete(key);

        // 构建完整的请求
        const fullRequest = {
          imageUrl: entry.imageUrl,
          question: message.content
        };

        // 使用 Provider 处理
        const provider = this.getProvider();
        const result = await provider.generate(fullRequest);

        return result.content;
      }
    }

    // 普通文本请求
    const provider = this.getProvider();
    const messages = [
      { role: 'system', content: '你是一个有用的助手' },
      { role: 'user', content: message.content }
    ];

    const result = await provider.generate(messages);
    return result.content;
  }

  /**
   * 发送文本消息
   */
  async sendText(toChatId, content) {
    const tokenManagerInstance = new this.tokenManager(this.config);
    const token = await tokenManagerInstance.getValidToken();

    try {
      const messageBody = {
        msgType: 'text',
        text: { content },
        toChatId,
        selfAt: false
      };

      await axios.post(this.webhookUrl, messageBody, {
        headers: { 'Content-Type': 'application/json' }
      });

      console.log('[DingTalk] ✅ 发送消息成功');
    } catch (error) {
      console.error('[DingTalk] ❌ 发送消息失败:', error.message);
      throw error;
    }
  }

  /**
   * 发送图片消息
   */
  async sendImage(toChatId, mediaId) {
    const tokenManagerInstance = new this.tokenManager(this.config);
    const token = await tokenManagerInstance.getValidToken();

    try {
      const messageBody = {
        msgType: 'image',
        image: { mediaId },
        toChatId
      };

      await axios.post(this.webhookUrl, messageBody, {
        headers: { 'Content-Type': 'application/json' }
      });

      console.log('[DingTalk] ✅ 发送图片成功');
    } catch (error) {
      console.error('[DingTalk] ❌ 发送图片失败:', error.message);
      throw error;
    }
  }

  /**
   * 缓存媒体文件
   */
  cacheMedia(key, imageUrl, userId) {
    this.imageCache.set(`${userId}-${key}`, {
      imageUrl,
      userId,
      createdAt: Date.now()
    });
  }

  /**
   * 获取缓存的媒体文件
   */
  getCachedMedia(userId, key) {
    const entry = this.imageCache.get(`${userId}-${key}`);
    if (!entry) return null;

    // 5 分钟过期
    if (Date.now() - entry.createdAt > 300000) {
      this.imageCache.delete(`${userId}-${key}`);
      return null;
    }

    return entry;
  }

  /**
   * 清理缓存
   */
  cleanup() {
    this.imageCache.clear();
    console.log('[DingTalk] 🧹 渠道清理完成');
  }
}

class SignatureManager {
  /**
   * 钉钉 Webhook 签名管理
   */
  constructor(config) {
    this.appSecret = config.dingtalk_app_secret;
  }

  validate(payload, timestamp, signature) {
    // 钉钉使用 HMAC-SHA256 签名
    const stringToSign = `${timestamp}\n${this.appSecret}`;
    const hash = crypto.createHmac('sha256', this.appSecret)
      .update(stringToSign)
      .digest('base64');

    return this.compareSignature(hash, signature);
  }

  compareSignature(expected, actual) {
    // 使用安全比较防止 timing attack
    if (expected.length !== actual.length) return false;

    let result = 0;
    for (let i = 0; i < expected.length; i++) {
      result |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
    }

    return result === 0;
  }
}

module.exports = {
  DingTalkChannel,
  SignatureManager
};
