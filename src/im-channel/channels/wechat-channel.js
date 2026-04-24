/**
 * 微信通道实现
 * 基于 chatgpt-on-wechat 的核心能力
 */

const axios = require('axios');
const { BaseChannel } = require('./base-channel');

class WechatChannel extends BaseChannel {
  /**
   * 微信通道
   */
  constructor(config, providerFactory) {
    super(config, providerFactory);
    this.channelName = 'wechat';
    this.apiUrl = config.wechat_api_base || 'https://api.weixin.qq.com';
    this.tokenManager = require('../token-manager/wechat-token-manager');
    this.mediaCache = new Map();
  }

  /**
   * 初始化
   */
  async startup() {
    await super.startup();
    
    // 获取有效的 Token
    const tokenManagerInstance = new this.tokenManager(this.config);
    await tokenManagerInstance.getValidToken();
    
    console.log('[Wechat] ✅ 微信通道初始化完成');
  }

  /**
   * 解析消息
   */
  parseMessage(payload) {
    // 支持 XML 和 JSON 格式
    let message;
    
    if (typeof payload === 'string' && payload.startsWith('<?xml')) {
      // XML 格式
      message = this.parseXmlMessage(payload);
    } else {
      // JSON 格式（Webhook）
      message = this.parseJsonMessage(payload);
    }

    return message;
  }

  /**
   * 解析 XML 格式消息（传统微信公众号）
   */
  parseXmlMessage(xml) {
    // 简单 XML 解析
    const parser = new (require('xml2js').Parser)({ explicitArray: false });
    return new Promise((resolve, reject) => {
      parser.parseString(xml, (err, result) => {
        if (err) {
          return reject(err);
        }
        
        const msg = result.xml;
        resolve({
          userId: msg.FromUserName,
          toUserId: msg.ToUserName,
          chatId: msg.FromUserName, // 微信中用户 ID 就是 chat ID
          type: msg.MsgType,
          content: msg.Content || '',
          mediaId: msg.MediaId || null,
          timestamp: parseInt(msg.CreateTime) * 1000,
          msgId: msg.MsgId,
          raw: msg
        });
      });
    });
  }

  /**
   * 解析 JSON 格式消息（企业微信/Webhook）
   */
  parseJsonMessage(payload) {
    const {
      FromUserName,
      ToUserName,
      MsgType,
      Content,
      MediaId,
      CreateTime,
      MsgId
    } = payload;

    return {
      userId: FromUserName,
      toUserId: ToUserName,
      chatId: FromUserName,
      type: MsgType,
      content: Content || '',
      mediaId: MediaId || null,
      timestamp: parseInt(CreateTime) * 1000,
      msgId: MsgId,
      raw: payload
    };
  }

  /**
   * 处理消息
   */
  async handleMessage(message) {
    console.log('[Wechat] 📥 收到消息:', {
      user: message.userId,
      chat: message.chatId,
      type: message.type,
      content: message.content
    });

    let replyContent = '';

    if (message.type === 'text') {
      replyContent = await this.processTextMessage(message);
    } else if (message.type === 'image') {
      replyContent = await this.processImageMessage(message);
    } else {
      replyContent = '暂不支持的消息类型';
    }

    // 发送回复
    await this.sendText(message.chatId, replyContent);
  }

  /**
   * 处理文本消息
   */
  async processTextMessage(message) {
    // 从缓存中获取未处理的图片
    const cachedMedia = this.getCachedMedia(message.userId);
    
    if (cachedMedia) {
      // 构建视觉请求
      const fullRequest = [
        { role: 'system', content: '你是一个有用的助手' },
        { 
          role: 'user', 
          content: [
            { type: 'text', text: cachedMedia.caption || '这是用户发送的图片，请描述并回答相关问题' },
            { type: 'image_url', image_url: { url: cachedMedia.imageUrl } }
          ]
        }
      ];
      
      this.clearCachedMedia(message.userId);
      
      const provider = this.getProvider();
      const result = await provider.generate(fullRequest);
      return result.content;
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
   * 处理图片消息
   */
  async processImageMessage(message) {
    // 获取图片 URL
    const mediaUrl = await this.getMediaUrl(message.mediaId);
    
    // 缓存等待用户提问
    this.cacheMedia(message.mediaId, mediaUrl, message.userId, '请描述这张图片');
    
    return '图片已保存，请提问相关问题';
  }

  /**
   * 获取媒体文件 URL
   */
  async getMediaUrl(mediaId) {
    const tokenManagerInstance = new this.tokenManager(this.config);
    const token = await tokenManagerInstance.getValidToken();
    
    try {
      const response = await axios.get(
        `${this.apiUrl}/cgi-bin/media/get`,
        {
          params: { access_token: token, media_id: mediaId },
          responseType: 'arraybuffer'
        }
      );
      
      // 媒体文件是二进制数据，需要上传到服务器或返回临时 URL
      // 这里返回模拟的 URL
      return `data:image/jpeg;base64,${response.data.toString('base64')}`;
    } catch (error) {
      console.error('[Wechat] ❌ 获取媒体文件失败:', error.message);
      throw error;
    }
  }

  /**
   * 发送文本消息
   */
  async sendText(toChatId, content) {
    const tokenManagerInstance = new this.tokenManager(this.config);
    const token = await tokenManagerInstance.getValidToken();
    
    try {
      const response = await axios.post(
        `${this.apiUrl}/cgi-bin/message/template/send`,
        {
          access_token: token,
          touser: toChatId,
          msgtype: 'text',
          text: { content }
        }
      );
      
      const data = response.data;
      if (data.errcode) {
        throw new Error(`发送失败: ${data.errmsg}`);
      }
      
      console.log('[Wechat] ✅ 发送消息成功');
    } catch (error) {
      console.error('[Wechat] ❌ 发送消息失败:', error.message);
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
      const response = await axios.post(
        `${this.apiUrl}/cgi-bin/message/template/send`,
        {
          access_token: token,
          touser: toChatId,
          msgtype: 'image',
          image: { media_id: mediaId }
        }
      );
      
      const data = response.data;
      if (data.errcode) {
        throw new Error(`发送失败: ${data.errmsg}`);
      }
      
      console.log('[Wechat] ✅ 发送图片成功');
    } catch (error) {
      console.error('[Wechat] ❌ 发送图片失败:', error.message);
      throw error;
    }
  }

  /**
   * 缓存媒体文件（等待用户提问）
   */
  cacheMedia(key, imageUrl, userId, caption) {
    this.mediaCache.set(userId, {
      key,
      imageUrl,
      caption,
      createdAt: Date.now()
    });
  }

  /**
   * 获取缓存的媒体文件
   */
  getCachedMedia(userId) {
    const entry = this.mediaCache.get(userId);
    if (!entry) return null;

    // 5 分钟过期
    if (Date.now() - entry.createdAt > 300000) {
      this.clearCachedMedia(userId);
      return null;
    }

    return entry;
  }

  /**
   * 清除缓存的媒体文件
   */
  clearCachedMedia(userId) {
    this.mediaCache.delete(userId);
  }

  /**
   * 清理缓存
   */
  cleanup() {
    this.mediaCache.clear();
    console.log('[Wechat] 🧹 渠道清理完成');
  }
}

module.exports = {
  WechatChannel
};
