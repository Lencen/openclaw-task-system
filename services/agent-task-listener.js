/**
 * Agent 任务监听器 v3.0 - 监听器（只监听，不处理）
 * 
 * 架构变更：
 * - 第1版：监听 + 处理 + 启动 Subagent
 * - 第2版：监听 + 处理（不动状态）
 * - 第3版：只负责监听，将任务推送到任务队列
 * 
 * 新职责：
 * - 监听任务通知（WebSocket/Redis/Polling）
 * - 验证任务格式
 * - 推送到任务队列
 * - 不处理任务
 * - 不启动 Subagent
 * 
 * 不再负责：
 * - ❌ 处理任务（由 TaskHandler 负责）
 * - ❌ 启动 Subagent（由 Executor 负责）
 * - ❌ 更新状态（由 StatusUpdater 负责）
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const http = require('http');

class AgentTaskListener extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Agent配置
    this.agentId = options.agentId || 'main';
    this.instanceId = options.instanceId || process.env.INSTANCE_ID || 'default';
    this.apiKey = options.apiKey || process.env.AGENT_API_KEY || null;
    
    // 回调函数 - 只推送任务，不处理
    this.onTaskReceived = options.onTaskReceived || this.defaultOnTaskReceived.bind(this);
    
    // WebSocket配置
    this.wsUrl = options.wsUrl || process.env.AGENT_WS_URL || 'ws://localhost:18789';
    this.wsReconnectInterval = options.wsReconnectInterval || 5000;
    this.wsMaxReconnectAttempts = options.wsMaxReconnectAttempts || 10;
    
    // 🔧 连接管理（防止连接数暴涨）
    this.wsConnecting = false;
    this.wsConnectionTimeout = options.wsConnectionTimeout || 10000;
    this.wsReconnectBackoff = options.wsReconnectBackoff || 1.5;
    this.wsMaxReconnectInterval = options.wsMaxReconnectInterval || 60000;
    this.wsConnectionTimer = null;
    
    // 🔧 连接管理配置（防止连接数暴涨）
    this.wsConnecting = false;           // 是否正在连接中
    this.wsConnectionTimeout = options.wsConnectionTimeout || 10000; // 连接超时 10秒
    this.wsMaxConnections = options.wsMaxConnections || 1;           // 最大连接数（只允许1个）
    this.wsReconnectBackoff = options.wsReconnectBackoff || 1.5;     // 指数退避倍数
    this.wsMaxReconnectInterval = options.wsMaxReconnectInterval || 60000; // 最大重试间隔 60秒
    this.wsConnectionTimer = null;       // 连接超时定时器
    
    // Redis配置
    this.redisClient = options.redisClient || null;
    this.redisUrl = options.redisUrl || process.env.REDIS_URL || null;
    this.redisSubscriber = null;
    
    // 轮询配置
    this.pollInterval = options.pollInterval || 30000; // 30秒
    this.pollUrl = options.pollUrl || process.env.TASK_SYSTEM_URL || 'http://localhost:8081';
    
    // 任务队列（任务推送到这里，由执行模块处理）
    this.taskQueue = [];
    this.maxQueueSize = options.maxQueueSize || 100;
    
    // 状态
    this.isRunning = false;
    this.ws = null;
    this.wsReconnectAttempts = 0;
    this.pollTimer = null;
    
    // 统计
    this.stats = {
      wsNotifications: 0,
      redisNotifications: 0,
      pollNotifications: 0,
      tasksReceived: 0,
      queueSize: 0,
      errors: 0
    };
    
    // 去重（防止重复处理）
    this.processingTasks = new Set();
    this.processedTasks = new Map(); // taskId -> timestamp
    this.dedupWindow = options.dedupWindow || 300000; // 5分钟去重窗口
  }

  /**
   * 默认任务接收回调（只推送，不处理）
   */
  defaultOnTaskReceived(task) {
    console.log(`[${this.agentId}] 收到任务:`, task.id, task.title);
    this.emit('task', task);
  }

  /**
   * 将任务推送到队列（只推送，不动状态）
   */
  pushTaskToQueue(task) {
    if (this.taskQueue.length >= this.maxQueueSize) {
      // 队列已满，丢弃最旧的任务
      this.taskQueue.shift();
    }
    
    this.taskQueue.push({
      ...task,
      receivedAt: Date.now(),
      receivedFrom: this.agentId
    });
    
    this.stats.queueSize = this.taskQueue.length;
    this.stats.tasksReceived++;
    
    console.log(`[${this.agentId}] 任务已推送到队列: ${task.id}, 队列大小: ${this.stats.queueSize}`);
    
    
    // 🔧 新增：调用 onTaskReceived 回调（飞书模式：收到任务 → 启动 subagent）
    if (this.onTaskReceived) {
      this.onTaskReceived(task).catch(err => {
        console.error(`[${this.agentId}] onTaskReceived 错误:`, err.message);
      });
    }
    return this.taskQueue.length;
  }

  /**
   * 从队列获取任务（由执行模块调用）
   */
  popTaskFromQueue() {
    if (this.taskQueue.length === 0) {
      return null;
    }
    
    const task = this.taskQueue.shift();
    this.stats.queueSize = this.taskQueue.length;
    
    return task;
  }

  /**
   * 获取队列中的任务数量
   */
  getQueueSize() {
    return this.taskQueue.length;
  }

  /**
   * 获取队列中的所有任务
   */
  getQueueTasks() {
    return [...this.taskQueue];
  }

  /**
   * 启动任务监听循环（只监听，不动状态）
   */
  async start() {
    if (this.isRunning) {
      console.log(`[${this.agentId}] 任务监听器已在运行`);
      return;
    }
    
    this.isRunning = true;
    console.log(`[${this.agentId}] 启动任务监听循环 v3.0`);
    console.log('  只负责监听，将任务推送到队列');
    
    // 启动三层监听
    await Promise.allSettled([
      this.connectWebSocket(),
      this.subscribeRedis(),
      this.startPolling()
    ]);
    
    this.emit('started');
  }

  /**
   * 停止任务监听循环
   */
  stop() {
    this.isRunning = false;
    console.log(`[${this.agentId}] 停止任务监听循环`);
    
    // 关闭WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // 关闭Redis订阅
    if (this.redisSubscriber) {
      this.redisSubscriber.quit();
      this.redisSubscriber = null;
    }
    
    // 停止轮询
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    
    // 停止心跳定时器
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    this.emit('stopped');
  }

  // ============================================
  // WebSocket 监听（实时推送）
  // ============================================
  
  async connectWebSocket() {
    // 🔧 连接保护：防止重复连接
    if (!this.isRunning) {
      console.log(`[${this.agentId}] 跳过：服务未运行`);
      return;
    }
    
    if (this.wsConnecting) {
      console.log(`[${this.agentId}] 跳过：已在连接中`);
      return;
    }
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log(`[${this.agentId}] 跳过：已有活跃连接`);
      return;
    }
    
    this.wsConnecting = true;
    
    try {
      const apiKey = this.apiKey || process.env.AGENT_API_KEY;
      let url = `${this.wsUrl}/agent-${this.agentId}?instanceId=${this.instanceId}`;
      if (apiKey) {
        url += `&apiKey=${apiKey}`;
      }
      console.log(`[${this.agentId}] 连接WebSocket: ${url} (尝试 ${this.wsReconnectAttempts + 1}/${this.wsMaxReconnectAttempts})`);
      
      // 🔧 连接超时保护
      const connectionTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          console.log(`[${this.agentId}] 连接超时，强制关闭`);
          this.ws.terminate();
          this.ws = null;
          this.wsConnecting = false;
          this._scheduleReconnect();
        }
      }, this.wsConnectionTimeout);
      
      this.ws = new WebSocket(url);
      
      this.ws.on('open', () => {
        clearTimeout(connectionTimeout);
        this.wsConnecting = false;
        console.log(`[${this.agentId}] ✅ WebSocket 已连接`);
        this.wsReconnectAttempts = 0;
        this.emit('ws:connected');
        this.sendHeartbeat();
      });
      
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleWebSocketMessage(msg);
        } catch (error) {
          console.error(`[${this.agentId}] WebSocket消息解析失败:`, error.message);
        }
      });
      
      this.ws.on('close', () => {
        clearTimeout(connectionTimeout);
        this.wsConnecting = false;
        console.log(`[${this.agentId}] WebSocket 已断开`);
        this.emit('ws:disconnected');
        
        if (this.heartbeatTimer) {
          clearTimeout(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
        
        this.ws = null;
        this._scheduleReconnect();
      });
      
      this.ws.on('error', (error) => {
        clearTimeout(connectionTimeout);
        this.wsConnecting = false;
        console.error(`[${this.agentId}] WebSocket错误:`, error.message);
        this.stats.errors++;
        this.emit('ws:error', error);
        this._scheduleReconnect();
      });
      
    } catch (error) {
      this.wsConnecting = false;
      console.error(`[${this.agentId}] WebSocket连接失败:`, error.message);
      this.stats.errors++;
      this._scheduleReconnect();
    }
  }
  
  /**
   * 🔧 智能重连调度（指数退避）
   */
  _scheduleReconnect() {
    if (!this.isRunning) return;
    
    if (this.wsReconnectAttempts >= this.wsMaxReconnectAttempts) {
      console.error(`[${this.agentId}] ❌ 达到最大重连次数 (${this.wsMaxReconnectAttempts})，停止重连`);
      return;
    }
    
    // 指数退避
    const backoffDelay = Math.min(
      this.wsReconnectInterval * Math.pow(this.wsReconnectBackoff || 1.5, this.wsReconnectAttempts),
      this.wsMaxReconnectInterval || 60000
    );
    
    this.wsReconnectAttempts++;
    console.log(`[${this.agentId}] ⏳ ${backoffDelay}ms 后重连 (尝试 ${this.wsReconnectAttempts}/${this.wsMaxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.isRunning && !this.wsConnecting) {
        this.connectWebSocket();
      }
    }, backoffDelay);
  }

  /**
   * 发送心跳
   */
  sendHeartbeat() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const heartbeatMsg = {
        type: 'heartbeat',
        agentId: this.agentId,
        timestamp: Date.now()
      };
      this.ws.send(JSON.stringify(heartbeatMsg));
      console.log(`[${this.agentId}] ❤️ 心跳发送:`, JSON.stringify(heartbeatMsg));
      
      this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), 5000);
    }
  }

  /**
   * 处理 WebSocket 消息
   */
  handleWebSocketMessage(msg) {
    // 处理欢迎消息
    if (msg.type === 'welcome') {
      console.log(`[${this.agentId}] 收到欢迎消息`);
      if (msg.heartbeat) {
        this.heartbeatInterval = msg.heartbeat.interval || 30000;
      }
      this.sendHeartbeat();
      return;
    }
    
    // 处理心跳响应
    if (msg.type === 'heartbeat_ack' || msg.type === 'pong') {
      return;
    }
    
    // TASK_WAKEUP 消息
    if (msg.type === 'TASK_WAKEUP' || msg.type === 'task_wakeup') {
      this.stats.wsNotifications++;
      
      console.log(`[${this.agentId}] 📨 收到 TASK_WAKEUP 消息`);
      console.log(`[${this.agentId}]   任务 ID: ${msg.taskId}`);
      console.log(`[${this.agentId}]   不回复，直接推送到队列...`);
      
      this.pushTaskToQueue({
        taskId: msg.taskId,
        task: msg.task,
        targetAgent: msg.targetAgent
      });
      return;
    }
    
    // 任务分配
    if (msg.type === 'task_assigned' || msg.type === 'task_assignment') {
      this.stats.wsNotifications++;
      
      let taskData = msg;
      if (msg.content && typeof msg.content === 'string') {
        try {
          taskData = JSON.parse(msg.content);
        } catch (e) {
          console.error(`[${this.agentId}] 解析 content 失败:`, e.message);
        }
      }
      
      const taskId = taskData.taskId || (taskData.task && taskData.task.id);
      const targetAgent = taskData.targetAgent || (taskData.task && taskData.task.targetAgent);
      
      console.log(`[${this.agentId}] WebSocket收到任务通知:`, taskId);
      
      this.pushTaskToQueue({
        taskId: taskId,
        task: taskData.task,
        targetAgent: targetAgent
      });
      return;
    }
    
    // P2P 消息
    if (msg.type === 'message' && msg.content) {
      let innerMsg;
      try {
        innerMsg = JSON.parse(msg.content);
      } catch (e) {
        this.emit('ws:message', msg);
        return;
      }
      
      if (innerMsg.type === 'task_assignment' || innerMsg.type === 'task_assigned' || innerMsg.type === 'task_notification' || innerMsg.type === 'task_spawn_request') {
        this.stats.wsNotifications++;
        
        const taskId = innerMsg.taskId || (innerMsg.task && innerMsg.task.id);
        console.log(`[${this.agentId}] WebSocket收到 P2P 任务通知:`, taskId);
        
        this.pushTaskToQueue({
          taskId: taskId,
          task: innerMsg.task,
          targetAgent: innerMsg.targetAgent
        });
        return;
      }
      
      this.emit('ws:message', msg);
      return;
    }
    
    this.emit('ws:message', msg);
  }

  // ============================================
  // Redis 订阅（可靠通知）
  // ============================================
  
  async subscribeRedis() {
    if (this.redisClient) {
      // 使用传入的客户端
    } else if (this.redisUrl) {
      try {
        const redis = require('redis');
        this.redisSubscriber = redis.createClient({ url: this.redisUrl });
        
        await this.redisSubscriber.connect();
        
        const channel = `agent:${this.agentId}:notifications`;
        await this.redisSubscriber.subscribe(channel, (message) => {
          try {
            const msg = JSON.parse(message);
            this.stats.redisNotifications++;
            console.log(`[${this.agentId}] Redis收到通知:`, msg);
            
            // 推送到队列
            this.pushTaskToQueue(msg);
          } catch (error) {
            console.error(`[${this.agentId}] Redis消息解析失败:`, error.message);
          }
        });
        
        console.log(`[${this.agentId}] Redis订阅成功: ${channel}`);
        this.emit('redis:subscribed', channel);
        
      } catch (error) {
        console.error(`[${this.agentId}] Redis订阅失败:`, error.message);
        this.stats.errors++;
      }
    } else {
      console.log(`[${this.agentId}] Redis未配置，跳过订阅`);
    }
  }

  // ============================================
  // 定时轮询（兜底机制）
  // ============================================
  
  startPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    
    console.log(`[${this.agentId}] 启动定时轮询，间隔: ${this.pollInterval / 1000}秒`);
    
    this.pollQueue();
    
    this.pollTimer = setInterval(() => {
      this.pollQueue();
    }, this.pollInterval);
  }

  /**
   * 轮询任务队列
   */
  async pollQueue() {
    if (!this.isRunning) return;
    
    try {
      const url = `${this.pollUrl}/api/agents/${this.agentId}/queue`;
      
      const data = await new Promise((resolve, reject) => {
        http.get(url, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });
      
      if (data.success && data.hasTask && data.current) {
        this.stats.pollNotifications++;
        console.log(`[${this.agentId}] 轮询发现任务:`, data.current.id);
        
        // 推送到队列
        this.pushTaskToQueue({
          taskId: data.current.id,
          task: data.current
        });
      }
      
    } catch (error) {
      if (error.code !== 'ECONNREFUSED') {
        console.error(`[${this.agentId}] 轮询失败:`, error.message);
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      processingCount: this.processingTasks.size,
      processedCount: this.processedTasks.size,
      isRunning: this.isRunning,
      wsConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
      redisConnected: this.redisSubscriber && this.redisSubscriber.isOpen,
      queueSize: this.taskQueue.length,
      maxQueueSize: this.maxQueueSize
    };
  }

  /**
   * 清理过期的已处理任务记录
   */
  cleanupProcessedTasks() {
    const now = Date.now();
    for (const [taskId, timestamp] of this.processedTasks) {
      if (now - timestamp > this.dedupWindow) {
        this.processedTasks.delete(taskId);
      }
    }
  }
}

/**
 * 创建任务监听器（工厂函数）
 */
function createTaskListener(options) {
  return new AgentTaskListener(options);
}

/**
 * 集成到 OpenClaw Gateway（只监听，不动状态）
 */
function integrateWithGateway(gateway, agentId, options = {}) {
  const listener = new AgentTaskListener({
    agentId,
    ...options
  });
  
  // 任务接收：只推送，不处理
  listener.on('task', (task) => {
    console.log(`[${agentId}] 任务接收:`, task.id, task.title);
    // 不启动 Subagent，由执行模块处理
  });
  
  return listener;
}

module.exports = {
  AgentTaskListener,
  createTaskListener,
  integrateWithGateway
};
