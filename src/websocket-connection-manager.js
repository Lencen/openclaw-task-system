/**
 * 飞书WebSocket连接管理器
 * 实现WebSocket连接的管理、心跳保活和断线重连
 *
 * 项目: 飞书WebSocket长连接项目
 * 作者: Coder Agent
 * 日期: 2026-03-10
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const EventEmitter = require('events');

class FeishuWebSocketConnectionManager extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @param {string} config.appId - 飞书应用ID
   * @param {string} config.appSecret - 飞书应用密钥
   * @param {string} config.verifyKey - 消息验证密钥
   * @param {number} config.heartbeatInterval - 心跳间隔（秒），默认30
   * @param {number} config.timeout - 超时时间（秒），默认90
   * @param {number} config.maxRetries - 最大重试次数，默认10
   */
  constructor(config) {
    super();

    this.config = {
      heartbeatInterval: 30,
      timeout: 90,
      maxRetries: 10,
      ...config
    };

    this.ws = null;
    this.accessToken = null;
    this.isConnected = false;
    this.isReconnecting = false;
    this.retryCount = 0;

    // 心跳相关
    this.heartbeatTimer = null;
    this.responseTimer = null;
    this.lastPongTime = null;

    // 事件处理
    this.messageQueue = [];
    this.isProcessing = false;

    // Token刷新
    this.tokenRefreshTimer = null;

    console.log('FeishuWebSocketConnectionManager initialized');
    console.log('配置:', this.config);
  }

  /**
   * 建立WebSocket连接
   */
  async connect() {
    if (this.isConnected) {
      console.warn('Already connected');
      return;
    }

    try {
      // 获取访问令牌
      await this.refreshAccessToken();

      // 建立WebSocket连接
      const wsUrl = `wss://open.feishu.cn/open-apis/event/v1/bot/websocket?app_id=${this.config.appId}&app_access_token=${this.accessToken}`;

      console.log('Connecting to:', wsUrl);

      this.ws = new WebSocket(wsUrl);

      this.setupEventHandlers();

      // 启动心跳
      this.startHeartbeat();

      // 启动Token自动刷新
      this.startTokenRefresh();

    } catch (error) {
      console.error('Connection failed:', error);
      this.emit('error', error);
      await this.reconnect();
    }
  }

  /**
   * 设置WebSocket事件处理器
   */
  setupEventHandlers() {
    this.ws.on('open', () => {
      console.log('WebSocket connection established');
      this.isConnected = true;
      this.isReconnecting = false;
      this.retryCount = 0;
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      console.log('Received message:', data.toString());
      this.handleMessage(data);
    });

    this.ws.on('pong', () => {
      console.log('Received pong');
      this.lastPongTime = Date.now();
      if (this.responseTimer) {
        clearTimeout(this.responseTimer);
        this.responseTimer = null;
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`WebSocket closed: ${code} - ${reason}`);
      this.isConnected = false;
      this.stopHeartbeat();
      this.emit('disconnected', { code, reason });

      // 自动重连
      if (!this.isReconnecting) {
        this.reconnect();
      }
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    });
  }

  /**
   * 处理收到的消息
   * @param {Buffer} data - 收到的消息数据
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      console.log('Parsed message:', message);

      // 添加到消息队列
      this.messageQueue.push(message);

      // 处理消息队列
      this.processMessageQueue();

      // 触发消息事件
      this.emit('message', message);

    } catch (error) {
      console.error('Failed to parse message:', error);
      this.emit('error', error);
    }
  }

  /**
   * 处理消息队列
   */
  async processMessageQueue() {
    if (this.isProcessing || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();

      try {
        // 解密消息
        const decrypted = await this.decryptMessage(message);

        // 触发事件
        this.emit('event', decrypted);

      } catch (error) {
        console.error('Failed to process message:', error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * 解密消息
   * @param {Object} message - 加密的消息对象
   * @returns {Object} 解密后的消息
   */
  async decryptMessage(message) {
    // TODO: 实现AES-256-GCM解密
    // 当前先返回原始消息
    return message;
  }

  /**
   * 启动心跳
   */
  startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('Sending ping...');
        this.ws.ping();

        // 设置超时检测
        this.responseTimer = setTimeout(() => {
          console.warn('Heartbeat timeout, reconnecting...');
          this.reconnect();
        }, this.config.timeout * 1000);
      }
    }, this.config.heartbeatInterval * 1000);

    console.log('Heartbeat started');
  }

  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.responseTimer) {
      clearTimeout(this.responseTimer);
      this.responseTimer = null;
    }

    console.log('Heartbeat stopped');
  }

  /**
   * 断线重连
   */
  async reconnect() {
    if (this.isReconnecting) {
      console.log('Already reconnecting...');
      return;
    }

    if (this.retryCount >= this.config.maxRetries) {
      console.error('Max retries exceeded');
      this.emit('maxRetriesExceeded');
      return;
    }

    this.isReconnecting = true;
    this.retryCount++;

    const delay = 1000 * Math.pow(2, this.retryCount); // 指数退避
    console.log(`Reconnecting in ${delay}ms (attempt ${this.retryCount}/${this.config.maxRetries})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      // 关闭旧连接
      if (this.ws) {
        this.ws.removeAllListeners();
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.close();
        }
      }

      // 重新连接
      await this.connect();

    } catch (error) {
      console.error('Reconnect failed:', error);
      this.isReconnecting = false;
      await this.reconnect(); // 继续重试
    }
  }

  /**
   * 获取访问令牌
   */
  async refreshAccessToken() {
    // TODO: 实现从飞书API获取token的逻辑
    // 当前先模拟返回
    this.accessToken = 'mock_access_token_' + Date.now();
    console.log('Access token refreshed');
    return this.accessToken;
  }

  /**
   * 启动Token自动刷新
   */
  startTokenRefresh() {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
    }

    // 每小时刷新一次token
    this.tokenRefreshTimer = setInterval(async () => {
      try {
        await this.refreshAccessToken();
        console.log('Token refreshed automatically');
      } catch (error) {
        console.error('Failed to refresh token:', error);
      }
    }, 3600 * 1000);

    console.log('Token refresh timer started');
  }

  /**
   * 发送消息
   * @param {Object} message - 消息对象
   */
  send(message) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const messageStr = JSON.stringify(message);
    this.ws.send(messageStr);
    console.log('Message sent:', messageStr);
  }

  /**
   * 关闭连接
   */
  disconnect() {
    console.log('Disconnecting...');

    this.stopHeartbeat();

    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }

    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * 获取连接状态
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isReconnecting: this.isReconnecting,
      retryCount: this.retryCount,
      lastPongTime: this.lastPongTime,
      messageQueueLength: this.messageQueue.length
    };
  }
}

// 导出模块
module.exports = FeishuWebSocketConnectionManager;
