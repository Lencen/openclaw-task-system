/**
 * Agent IM Server - Agent 即时通讯服务器
 * 
 * 功能：
 * 1. 支持 Human 和 Agent 连接
 * 2. 消息路由（点对点、广播）
 * 3. Agent 在线状态
 * 4. 输入状态通知
 * 5. JWT Token 验证
 * 6. API Key 验证（MVP 阶段）
 * 7. 心跳机制（30s 间隔，60s 超时）
 * 8. 离线检测
 * 
 * 使用方式：
 * - Human 连接: ws://host:port/human-{userId}?token={jwt}
 * - Agent 连接: ws://host:port/agent-{agentId}?token={jwt}&instanceId={instanceId}
 * - API Key 连接: ws://host:port/agent-{agentId}?apiKey={apiKey}
 * 
 * 身份模型: {instanceId}:{agentName}
 */

const WebSocket = require('ws');
const http = require('http');
const url = require('url');

// 导入 JWT 和实例注册模块
const { getTokenManager, createWsAuthMiddleware } = require('./jwt-auth');
const { getRegistry, InstanceStatus } = require('./instance-registry');
const { getMessageLoopGuard } = require('./message-loop-guard');
const { getChatMessageStore } = require('./chat-message-store');

/**
 * 心跳配置
 */
const HEARTBEAT_CONFIG = {
  interval: 30000,     // 心跳间隔 30 秒
  timeout: 60000,      // 超时时间 60 秒
  maxMissed: 2         // 最大丢失心跳次数（60s / 30s = 2）
};

class AgentIMServer {
  constructor(options = {}) {
    this.port = options.port || 18789;
    this.server = null;
    this.wss = null;
    
    // JWT 和注册管理器
    this.tokenManager = getTokenManager();
    this.registry = getRegistry();
    
    // 连接池
    this.humans = new Map();  // userId -> ws
    this.agents = new Map();  // fullAgentId -> ws
    
    // 在线状态
    this.agentStatus = new Map(); // fullAgentId -> { online, lastSeen, typing }
    
    // 心跳管理
    this.heartbeatTimers = new Map();      // clientId -> interval timer
    this.heartbeatTimeouts = new Map();    // clientId -> timeout tracker
    this.missedHeartbeats = new Map();     // clientId -> missed count
    
    // 离线检测
    this.offlineCheckInterval = null;
    
    // 消息循环防护
    this.messageGuard = getMessageLoopGuard({
      maxReplyDepth: 3,
      lockTimeout: 300000,  // 5 分钟
      cleanupInterval: 60000  // 1 分钟
    });
    this.MAX_REPLY_DEPTH = 3;
  }

  /**
   * 启动服务器
   */
  start() {
    return new Promise((resolve, reject) => {
      // 创建 HTTP 服务器
      this.server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url, true);
        
        if (parsedUrl.pathname === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            humans: this.humans.size,
            agents: this.agents.size,
            agentStatus: Object.fromEntries(
              [...this.agentStatus].map(([id, s]) => [id, { online: s.online, lastSeen: s.lastSeen }])
            ),
            registry: this.registry.getStats(),
            heartbeat: HEARTBEAT_CONFIG,
            messageGuard: this.messageGuard.getStats()
          }));
        } else if (parsedUrl.pathname === '/api/guard/stats') {
          // 消息循环防护统计
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.messageGuard.getStats()));
        } else if (parsedUrl.pathname === '/api/auth/token') {
          // Token 生成接口
          this.handleTokenRequest(req, res);
        } else if (parsedUrl.pathname === '/api/auth/refresh') {
          // Token 刷新接口
          this.handleRefreshRequest(req, res);
        } else if (parsedUrl.pathname === '/api/agents') {
          // 获取在线 Agent 列表
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            agents: this.getOnlineAgents(),
            stats: this.registry.getStats()
          }));
        } else if (parsedUrl.pathname === '/api/message' && req.method === 'POST') {
          // 发送消息给 Agent（HTTP API）
          this.handleMessageRequest(req, res);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      // 创建 WebSocket 服务器
      this.wss = new WebSocket.Server({ server: this.server });

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });

      this.server.listen(this.port, () => {
        console.log(`[AgentIM] 服务已启动 on port ${this.port}`);
        console.log(`[AgentIM] 心跳配置: 间隔=${HEARTBEAT_CONFIG.interval}ms, 超时=${HEARTBEAT_CONFIG.timeout}ms`);
        
        // 启动离线检测
        this.startOfflineDetection();
        
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * 停止服务器
   */
  stop() {
    return new Promise((resolve) => {
      // 停止离线检测
      if (this.offlineCheckInterval) {
        clearInterval(this.offlineCheckInterval);
        this.offlineCheckInterval = null;
      }

      // 清理所有心跳定时器和超时追踪
      this.heartbeatTimers.forEach(timer => clearInterval(timer));
      this.heartbeatTimers.clear();
      this.heartbeatTimeouts.forEach(timeout => clearTimeout(timeout));
      this.heartbeatTimeouts.clear();
      this.missedHeartbeats.clear();

      // 关闭所有连接
      this.humans.forEach(ws => ws.close());
      this.agents.forEach(ws => ws.close());
      this.humans.clear();
      this.agents.clear();

      if (this.wss) {
        this.wss.close(() => {
          if (this.server) {
            this.server.close(resolve);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 启动离线检测
   * 定期扫描所有连接，检测超时的客户端
   */
  startOfflineDetection() {
    this.offlineCheckInterval = setInterval(() => {
      const now = Date.now();
      
      // 检测所有 Agent 连接
      this.agents.forEach((ws, fullAgentId) => {
        const status = this.agentStatus.get(fullAgentId);
        if (status && status.online) {
          const timeSinceLastSeen = now - status.lastSeen;
          
          if (timeSinceLastSeen > HEARTBEAT_CONFIG.timeout) {
            console.warn(`[AgentIM] Agent 超时离线: ${fullAgentId} (${Math.round(timeSinceLastSeen/1000)}s 无响应)`);
            this.markAgentOffline(fullAgentId, ws, 'heartbeat_timeout');
          }
        }
      });
      
      // 检测所有 Human 连接
      this.humans.forEach((ws, userId) => {
        const lastSeen = ws._lastSeen || now;
        const timeSinceLastSeen = now - lastSeen;
        
        if (timeSinceLastSeen > HEARTBEAT_CONFIG.timeout) {
          console.warn(`[AgentIM] Human 超时离线: ${userId} (${Math.round(timeSinceLastSeen/1000)}s 无响应)`);
          this.handleDisconnect(ws, 'human', userId);
        }
      });
      
    }, HEARTBEAT_CONFIG.timeout);  // 每 60 秒检测一次
  }

  /**
   * 标记 Agent 为离线
   */
  markAgentOffline(fullAgentId, ws, reason = 'unknown') {
    // 更新状态
    this.agentStatus.set(fullAgentId, { 
      online: false, 
      lastSeen: Date.now(), 
      typing: false,
      offlineReason: reason
    });
    
    // 更新注册表
    this.registry.updateAgentStatus(fullAgentId, InstanceStatus.OFFLINE);
    this.registry.removeAgentConnection(fullAgentId);
    
    // 广播离线状态
    this.broadcastAgentStatus(fullAgentId, 'offline', { reason });
    
    // 清理连接
    this.agents.delete(fullAgentId);
    
    // 清理心跳追踪
    const clientId = `agent:${fullAgentId}`;
    this.cleanupHeartbeat(clientId);
    
    // 关闭连接
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close(1001, `Offline: ${reason}`);
    }
    
    console.log(`[AgentIM] Agent 已标记离线: ${fullAgentId} (原因: ${reason})`);
  }

  /**
   * 处理 Token 生成请求
   */
  handleTokenRequest(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { instanceId, agentName, apiKey } = JSON.parse(body);
        
        if (!instanceId || !agentName || !apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: '缺少必要参数' }));
        }
        
        const result = this.tokenManager.generateToken(instanceId, agentName, apiKey);
        
        if (result.success) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            token: result.token,
            refreshToken: result.refreshToken,
            expiresIn: result.expiresIn,
            fullAgentId: result.fullAgentId
          }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效请求' }));
      }
    });
  }

  /**
   * 处理 Token 刷新请求
   */
  handleRefreshRequest(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { refreshToken } = JSON.parse(body);
        
        if (!refreshToken) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: '缺少 refreshToken' }));
        }
        
        const result = this.tokenManager.refreshToken(refreshToken);
        
        if (result.success) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            token: result.token,
            expiresIn: result.expiresIn
          }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效请求' }));
      }
    });
  }

  /**
   * 处理消息发送请求（HTTP API）
   */
  handleMessageRequest(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { to, type, task, content } = JSON.parse(body);
        
        if (!to) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: '缺少目标 Agent' }));
        }
        
        // 🔧 调试：打印 agents Map keys
        console.log(`[AgentIM] agents Map keys:`, Array.from(this.agents.keys()).slice(0, 5));
        // 直接检查 WebSocket 连接
        const ws = this.agents.get(to);
        const isOnline = ws && ws.readyState === WebSocket.OPEN;
        
        if (!isOnline) {
          // Agent 离线 - 像飞书一样自动激活 Agent
          console.log(`[AgentIM] 目标 Agent 离线: ${to}，尝试自动激活...`);
          
          // 解析目标 agent ID（从 "agent:coder" 提取 "coder"）
          const targetAgent = to.replace(/^(agent:|default:)/, '');
          const taskId = task?.id || `auto-${Date.now()}`;
          
          // 调用 Gateway 的 sessions_spawn 启动 Agent
          try {
            const spawnResponse = await fetch('http://localhost:18789/tools/invoke', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GATEWAY_TOKEN || 'b47aeb9ce48976322ea3564aae177db8cc7a0ce81f524945'}`
              },
              body: JSON.stringify({
                tool: 'sessions_spawn',
                args: {
                  agentId: targetAgent,
                  task: task ? `处理任务：${task.title}` : 'Federation 任务通知',
                  mode: 'run',
                  timeoutSeconds: 3600,
                  label: `federation-${taskId}`
                }
              })
            });
            
            const spawnResult = await spawnResponse.json();
            console.log(`[AgentIM] ✅ 已启动 Agent ${targetAgent}:`, spawnResult);
            
            // 等待 2 秒让 Agent 建立 WebSocket 连接
            await new Promise(r => setTimeout(r, 2000));
            
            // 再次检查连接
            const ws2 = this.agents.get(to);
            if (ws2 && ws2.readyState === WebSocket.OPEN) {
              const message = {
                type: type || 'message',
                to,
                content: content || (task ? JSON.stringify({ type: 'task_assignment', task }) : ''),
                timestamp: Date.now()
              };
              ws2.send(JSON.stringify(message));
              console.log(`[AgentIM] ✅ 消息已发送给激活的 Agent ${to}`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ 
                success: true, 
                activated: true,
                sessionId: spawnResult.sessionId
              }));
            }
          } catch (spawnError) {
            console.error(`[AgentIM] ❌ 启动 Agent 失败:`, spawnError);
          }
          
          // 如果自动激活失败，返回原来的错误
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ 
            success: false, 
            error: 'Agent 离线',
            note: '尝试自动激活失败'
          }));
        }
        
        // 发送消息
        const message = {
          type: type || 'message',
          to,
          content: content || (task ? JSON.stringify({ type: 'task_assignment', task }) : ''),
          timestamp: Date.now()
        };
        
        ws.send(JSON.stringify(message));
        console.log(`[AgentIM] 消息已发送给 ${to}: ${type || 'message'}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        
      } catch (error) {
        console.error('[AgentIM] 处理消息请求失败:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  }

  /**
   * 处理新连接（带 JWT 验证）
   */
  handleConnection(ws, req) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;
    
    // 解析认证信息
    const token = query.token;
    const apiKey = query.apiKey;
    const instanceId = query.instanceId || 'local';
    
    // 认证结果
    let authResult = null;
    
    // ===== JWT Token 验证 =====
    if (token) {
      const result = this.tokenManager.verifyToken(token);
      if (result.valid) {
        authResult = result.payload;
        console.log(`[AgentIM] ✅ JWT 验证成功: ${authResult.fullAgentId}`);
      } else {
        console.warn(`[AgentIM] ❌ JWT 验证失败: ${result.error}`);
        this.send(ws, { 
          type: 'auth_error', 
          error: result.error,
          expired: result.expired || false
        });
        ws.close(1008, `Authentication failed: ${result.error}`);
        return;
      }
    }
    
    // ===== API Key 验证（MVP 阶段）=====
    if (!authResult && apiKey) {
      const result = this.tokenManager.apiKeyManager.verifyApiKey(apiKey);
      if (result.valid) {
        // 从路径提取 agentName
        const agentMatch = pathname.match(/^\/agent-(.+)$/);
        const agentName = agentMatch ? agentMatch[1] : result.agentId.replace('agent-', '');
        
        authResult = {
          fullAgentId: `${instanceId}:${agentName}`,
          instanceId,
          agentName,
          agentId: result.agentId,
          permissions: result.permissions
        };
        console.log(`[AgentIM] ✅ API Key 验证成功: ${authResult.fullAgentId}`);
      } else {
        console.warn(`[AgentIM] ❌ API Key 验证失败: ${result.error}`);
        this.send(ws, { type: 'auth_error', error: result.error });
        ws.close(1008, `Authentication failed: ${result.error}`);
        return;
      }
    }
    
    // 解析客户端类型和 ID
    const humanMatch = pathname.match(/^\/human-(.+)$/);
    const agentMatch = pathname.match(/^\/agent-(.+)$/);
    // 支持直接使用 agentId（如 /main, /coder）
    const directMatch = pathname.match(/^\/(\w+)$/);
    
    let clientType, clientId, fullAgentId;
    
    if (humanMatch) {
      clientType = 'human';
      clientId = humanMatch[1];
      fullAgentId = null;
      this.humans.set(clientId, ws);
      console.log(`[AgentIM] 👤 Human 连接: ${clientId}`);
    } else if (agentMatch) {
      clientType = 'agent';
      const agentName = agentMatch[1];
      fullAgentId = authResult ? authResult.fullAgentId : `${instanceId}:${agentName}`;
      clientId = fullAgentId;
      
      // 注册 Agent
      this.registry.registerAgent(instanceId, agentName, {
        displayName: agentName,
        capabilities: []
      });
      
      this.agents.set(fullAgentId, ws);
      this.agentStatus.set(fullAgentId, { 
        online: true, 
        lastSeen: Date.now(), 
        typing: false,
        connectedAt: Date.now()
      });
      this.registry.setAgentConnection(fullAgentId, ws);
      console.log(`[AgentIM] 🤖 Agent 连接: ${fullAgentId}`);
      
      // 广播 Agent 上线
      this.broadcastAgentStatus(fullAgentId, 'online');
    } else if (directMatch) {
      // 已知的 Agent ID 列表
      const knownAgents = ['main', 'coder', 'deep', 'fast', 'chat', 'test', 'office', 'office-1', 'coder-1', 'coder-2', 'federation'];
      const id = directMatch[1];
      
      if (knownAgents.includes(id)) {
        clientType = 'agent';
        fullAgentId = `${instanceId}:${id}`;
        clientId = fullAgentId;
        
        this.registry.registerAgent(instanceId, id, {
          displayName: id,
          capabilities: []
        });
        
        this.agents.set(fullAgentId, ws);
        this.agentStatus.set(fullAgentId, { 
          online: true, 
          lastSeen: Date.now(), 
          typing: false,
          connectedAt: Date.now()
        });
        this.registry.setAgentConnection(fullAgentId, ws);
        console.log(`[AgentIM] 🤖 Agent 连接: ${fullAgentId}`);
        this.broadcastAgentStatus(fullAgentId, 'online');
      } else {
        // 未知 ID 当作 Human 处理
        clientType = 'human';
        clientId = id;
        this.humans.set(clientId, ws);
        console.log(`[AgentIM] 👤 Human 连接: ${clientId}`);
      }
    } else {
      console.log(`[AgentIM] ⚠️ 无效路径: ${pathname}`);
      ws.close();
      return;
    }

    // 存储客户端信息
    ws._imClientType = clientType;
    ws._imClientId = clientId;
    ws._imFullAgentId = fullAgentId;
    ws._auth = authResult;
    ws._lastSeen = Date.now();

    // 发送欢迎消息
    this.send(ws, {
      type: 'welcome',
      clientType,
      clientId,
      agents: this.getOnlineAgents(),
      timestamp: Date.now(),
      heartbeat: {
        interval: HEARTBEAT_CONFIG.interval,
        timeout: HEARTBEAT_CONFIG.timeout
      }
    });

    // 如果是 Human，发送当前在线 Agent 状态
    if (clientType === 'human') {
      this.sendAgentList(ws);
    }

    // 设置心跳（服务端主动发送）
    this.setupHeartbeat(ws, clientId, clientType);

    // 处理消息
    ws.on('message', (data) => {
      this.handleMessage(ws, data, clientType, clientId);
    });

    // 处理断开
    ws.on('close', (code, reason) => {
      this.handleDisconnect(ws, clientType, clientId, reason?.toString() || 'connection_closed');
    });

    // 处理错误
    ws.on('error', (error) => {
      console.error(`[AgentIM] ${clientType}:${clientId} 错误:`, error.message);
    });
  }

  /**
   * 处理消息
   */
  handleMessage(ws, data, clientType, clientId) {
    // 更新最后活跃时间
    ws._lastSeen = Date.now();
    
    // 重置心跳超时计数
    const missedCount = this.missedHeartbeats.get(clientId) || 0;
    if (missedCount > 0) {
      this.missedHeartbeats.set(clientId, 0);
    }
    
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      console.error(`[AgentIM] 解析消息失败:`, e);
      return;
    }

    console.log(`[AgentIM] ${clientType}:${clientId} 消息:`, msg.type);

    switch (msg.type) {
      case 'message':
        // 点对点消息
        this.handleP2PMessage(ws, clientType, clientId, msg);
        break;

      case 'broadcast':
        // 广播消息
        this.handleBroadcast(clientType, clientId, msg);
        break;

      case 'task_assignment':
        // 任务分配消息（去中心化架构）
        this.handleTaskAssignment(ws, clientType, clientId, msg);
        break;

      case 'agent_reply':
        // Agent 回复（带 replyChainId 去重）
        this.handleAgentReply(ws, clientType, clientId, msg);
        break;

      case 'typing':
        // 输入状态
        this.handleTyping(clientType, clientId, msg);
        break;

      case 'heartbeat':
        // 心跳请求（客户端发送）
        this.handleHeartbeat(ws, clientType, clientId);
        break;
        
      case 'heartbeat_ack':
        // 心跳响应（客户端响应服务端心跳）
        this.handleHeartbeatAck(ws, clientType, clientId);
        break;
        
      case 'guard_stats':
        // 获取消息循环防护统计
        this.send(ws, {
          type: 'guard_stats',
          stats: this.messageGuard.getStats()
        });
        break;

      case 'get_agents':
        // 获取在线 Agent 列表
        this.sendAgentList(ws);
        break;
        
      case 'pong':
        // 兼容旧版心跳响应
        this.handleHeartbeatAck(ws, clientType, clientId);
        break;
    }
  }

  /**
   * 处理心跳请求（客户端发起）
   */
  handleHeartbeat(ws, clientType, clientId) {
    // 更新最后活跃时间
    ws._lastSeen = Date.now();
    
    // 更新 Agent 状态
    if (clientType === 'agent' && ws._imFullAgentId) {
      const status = this.agentStatus.get(ws._imFullAgentId);
      if (status) {
        status.lastSeen = Date.now();
      }
      this.registry.heartbeat(ws._imFullAgentId);
    }
    
    // 响应心跳
    this.send(ws, { 
      type: 'heartbeat_ack', 
      timestamp: Date.now(),
      serverTime: Date.now()
    });
  }

  /**
   * 处理心跳响应（响应服务端心跳）
   */
  handleHeartbeatAck(ws, clientType, clientId) {
    // 重置心跳超时计数
    this.missedHeartbeats.set(clientId, 0);
    
    // 更新最后活跃时间
    ws._lastSeen = Date.now();
    
    // 更新 Agent 状态
    if (clientType === 'agent' && ws._imFullAgentId) {
      const status = this.agentStatus.get(ws._imFullAgentId);
      if (status) {
        status.lastSeen = Date.now();
      }
    }
  }

  /**
   * 处理点对点消息（带消息循环防护）
   */
  handleP2PMessage(ws, fromType, fromId, msg) {
    const { to, content, mentions, replyDepth = 0, replyChainId, parentMsgId, roomId } = msg;
    
    if (!to) {
      console.warn(`[AgentIM] 消息缺少目标`);
      return;
    }

    // ===== 消息循环防护：replyDepth 限制 =====
    if (replyDepth > this.MAX_REPLY_DEPTH) {
      console.warn(`[AgentIM] 🚫 回复深度超限: ${replyDepth} > ${this.MAX_REPLY_DEPTH}`);
      // 通知发送者
      this.send(ws, {
        type: 'error',
        error: 'REPLY_DEPTH_EXCEEDED',
        message: `回复深度已达到上限 (${this.MAX_REPLY_DEPTH})，停止传播`,
        msgId: msg.id
      });
      return;
    }

    // 构建转发消息
    const forwardMsg = {
      type: 'message',
      id: msg.id || `${fromId}-${Date.now()}`,
      from: fromId,
      fromType,
      to,
      content,
      mentions: mentions || [],
      timestamp: msg.timestamp || Date.now(),
      replyDepth,
      replyChainId: replyChainId || `${roomId || 'default'}:${msg.id || fromId}`,
      parentMsgId,
      roomId: roomId || 'default'
    };

    // 保存消息到 SQLite
    try {
      const chatStore = getChatMessageStore();
      chatStore.saveMessage({
        id: forwardMsg.id,
        timestamp: new Date(forwardMsg.timestamp).toISOString(),
        sender: fromId,
        senderType: fromType,
        text: content,
        targetAgent: to,
        roomId: roomId || 'default',
        metadata: { mentions, replyDepth, replyChainId }
      });
    } catch (e) {
      console.error('[AgentIM] 保存消息失败:', e.message);
    }

    // 查找目标并发送
    let targetWs;
    
    // 🔧 调试：打印当前 agents Map 的 keys
    if (!this.agents.has(to)) {
      console.log(`[AgentIM] agents Map keys:`, Array.from(this.agents.keys()).slice(0, 5));
    }
    
    if (to.startsWith('agent-') || this.agents.has(to)) {
      targetWs = this.agents.get(to);
    } else if (to.startsWith('human-') || this.humans.has(to)) {
      targetWs = this.humans.get(to);
    } else {
      // 尝试直接用 ID 查找
      targetWs = this.agents.get(to) || this.humans.get(to);
    }

    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      this.send(targetWs, forwardMsg);
      console.log(`[AgentIM] 消息转发: ${fromId} -> ${to}, depth=${replyDepth}`);
    } else {
      console.warn(`[AgentIM] 目标不在线: ${to}`);
      // 发送离线通知
      this.send(ws, {
        type: 'delivery_status',
        status: 'offline',
        to,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 处理 Agent 回复（带 replyChainId 去重）
   * 核心：防止消息循环和竞态条件
   */
  handleAgentReply(ws, fromType, fromId, msg) {
    // 只有 Agent 才能发送回复
    if (fromType !== 'agent') {
      console.warn(`[AgentIM] 非 Agent 尝试发送 agent_reply: ${fromType}`);
      return;
    }
    
    const { 
      to, 
      content, 
      replyDepth = 0, 
      replyChainId, 
      parentMsgId, 
      roomId,
      originalMsgId 
    } = msg;
    
    // ===== 1. 使用消息循环防护模块进行检查 =====
    const messageMeta = {
      id: originalMsgId || msg.id || `${fromId}-${Date.now()}`,
      replyDepth,
      replyChainId,
      parentMsgId,
      roomId: roomId || 'default',
      from: to, // 原始消息的发送者
      content,
      mentions: [],
      timestamp: Date.now()
    };
    
    // 获取 agentId（从 fullAgentId 中提取）
    const agentId = fromId.includes(':') ? fromId : `local:${fromId}`;
    
    // ===== 2. 原子性检查并获取锁 =====
    const checkResult = this.messageGuard.checkAndAcquire(messageMeta, agentId);
    
    if (!checkResult.allowed) {
      console.warn(`[AgentIM] 🚫 Agent 回复被阻止: ${fromId}, reason=${checkResult.reason}`);
      // 通知 Agent
      this.send(ws, {
        type: 'reply_blocked',
        reason: checkResult.reason,
        originalMsgId: messageMeta.id
      });
      return;
    }
    
    // ===== 3. 检查回复深度 =====
    const newReplyDepth = replyDepth + 1;
    if (newReplyDepth > this.MAX_REPLY_DEPTH) {
      console.warn(`[AgentIM] 🚫 回复深度超限: ${newReplyDepth} > ${this.MAX_REPLY_DEPTH}`);
      this.messageGuard.releaseChainLock(checkResult.chainKey);
      this.send(ws, {
        type: 'reply_blocked',
        reason: `REPLY_DEPTH_EXCEEDED:${newReplyDepth}`,
        originalMsgId: messageMeta.id
      });
      return;
    }
    
    // ===== 4. 创建回复消息 =====
    const replyMsg = {
      type: 'message',
      id: `${fromId}-reply-${Date.now()}`,
      from: fromId,
      fromType,
      to,
      content,
      replyDepth: newReplyDepth,
      replyChainId: replyChainId || checkResult.chainKey.split(':')[0] + ':' + checkResult.chainKey.split(':')[1],
      parentMsgId: originalMsgId || parentMsgId,
      roomId: roomId || 'default',
      timestamp: Date.now()
    };
    
    // ===== 5. 发送回复 =====
    let targetWs;
    if (to.startsWith('agent-') || this.agents.has(to)) {
      targetWs = this.agents.get(to);
    } else if (to.startsWith('human-') || this.humans.has(to)) {
      targetWs = this.humans.get(to);
    } else {
      targetWs = this.humans.get(to) || this.agents.get(to);
    }
    
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      this.send(targetWs, replyMsg);
      console.log(`[AgentIM] ✅ Agent 回复已发送: ${fromId} -> ${to}, depth=${newReplyDepth}`);
      
      // 标记为已回复
      this.messageGuard.markReplied(checkResult.chainKey);
      
      // 确认给发送者
      this.send(ws, {
        type: 'reply_sent',
        msgId: replyMsg.id,
        chainKey: checkResult.chainKey
      });
    } else {
      console.warn(`[AgentIM] 目标不在线: ${to}`);
      this.messageGuard.releaseChainLock(checkResult.chainKey);
      this.send(ws, {
        type: 'delivery_status',
        status: 'offline',
        to,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 处理广播消息
   */
  handleBroadcast(fromType, fromId, msg) {
    const broadcastMsg = {
      type: 'broadcast',
      from: fromId,
      fromType,
      content: msg.content,
      mentions: msg.mentions || [],
      timestamp: msg.timestamp || Date.now()
    };

    // 发送给所有 Human
    this.humans.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.OPEN && userId !== fromId) {
        this.send(ws, broadcastMsg);
      }
    });

    // 发送给所有 Agent
    this.agents.forEach((ws, agentId) => {
      if (ws.readyState === WebSocket.OPEN && agentId !== fromId) {
        this.send(ws, broadcastMsg);
      }
    });

    console.log(`[AgentIM] 广播消息: ${fromId}`);
  }

  /**
   * 处理任务分配消息（去中心化架构）
   * 
   * 让目标 Agent 成为"主 Agent"，自己启动 Subagent 执行任务
   */
  handleTaskAssignment(ws, fromType, fromId, msg) {
    const { to, task, targetAgent } = msg;
    
    if (!to) {
      console.warn(`[AgentIM] 任务分配缺少目标 Agent`);
      this.send(ws, {
        type: 'error',
        error: 'MISSING_TARGET',
        message: '任务分配必须指定目标 Agent'
      });
      return;
    }
    
    if (!task) {
      console.warn(`[AgentIM] 任务分配缺少任务信息`);
      this.send(ws, {
        type: 'error',
        error: 'MISSING_TASK',
        message: '任务分配必须包含任务信息'
      });
      return;
    }
    
    // 🔧 修复：保留 targetAgent 字段
    // 构建任务分配消息
    const assignmentMsg = {
      type: 'task_assignment',
      from: fromId,
      fromType,
      to,
      targetAgent: targetAgent,  // 保留目标 Agent 字段（如果是跨 Agent 分配）
      task: {
        id: task.id || `task-${Date.now()}`,
        title: task.title,
        description: task.description,
        priority: task.priority || 'P2',
        ...task
      },
      timestamp: Date.now()
    };
    
    // 查找目标 Agent
    let targetWs = this.agents.get(to);
    
    // 尝试不同的 ID 格式
    if (!targetWs) {
      // 尝试 local:agentName 格式
      targetWs = this.agents.get(`local:${to}`);
    }
    if (!targetWs) {
      // 尝试 agent-agentName 格式
      targetWs = this.agents.get(`agent-${to}`);
    }
    if (!targetWs) {
      // 尝试 instanceId:agentName 格式（如 <hostname>-fast:fast）
      // 遍历所有连接，查找 agentName 匹配的
      const agentName = to.replace(/^agent-/, '');  // 去掉 agent- 前缀
      for (const [fullId, ws] of this.agents) {
        const parts = fullId.split(':');
        if (parts.length === 2 && parts[1] === agentName) {
          // 🔧 优先匹配 <hostname>- 前缀（真正的 Agent listener）
          if (fullId.startsWith('<hostname>-')) {
            targetWs = ws;
            console.log(`[AgentIM] 📍 通过 agentName 匹配（<hostname>-优先）: ${fullId} -> ${agentName}`);
            break;
          }
          targetWs = ws;
          console.log(`[AgentIM] 📍 通过 agentName 匹配: ${fullId} -> ${agentName}`);
          break;
        }
      }
    }
    
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      this.send(targetWs, assignmentMsg);
      console.log(`[AgentIM] 📋 任务分配: ${fromId} -> ${to}, 任务: ${task.title || task.id}`);
      
      // 发送确认给发送者
      
      // 🔧 新增：转发给 Federation 插件（让 Federation 启动 subagent）
      const federationKey = 'default:federation';
      const federationWs = this.agents.get(federationKey);
      
      // 调试：列出所有 agents
      console.log(`[AgentIM] 🔍 所有 Agents: ${Array.from(this.agents.keys()).join(', ')}`);
      
      if (federationWs && federationWs.readyState === WebSocket.OPEN) {
        this.send(federationWs, assignmentMsg);
        console.log(`[AgentIM] 🔄 任务已转发给 Federation: ${to}`);
      } else {
        console.log(`[AgentIM] ⚠️ Federation 不在线或未连接`);
      }
      this.send(ws, {
        type: 'task_delivered',
        taskId: assignmentMsg.task.id,
        to,
        timestamp: Date.now()
      });
    } else {
      console.warn(`[AgentIM] 目标 Agent 不在线: ${to}`);
      this.send(ws, {
        type: 'delivery_status',
        status: 'offline',
        to,
        taskId: assignmentMsg.task.id,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 处理输入状态
   */
  handleTyping(fromType, fromId, msg) {
    const typingMsg = {
      type: 'typing',
      from: fromId,
      fromType,
      to: msg.to,
      timestamp: Date.now()
    };

    // 发送给目标
    if (msg.to) {
      const targetWs = this.agents.get(msg.to) || this.humans.get(msg.to);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        this.send(targetWs, typingMsg);
      }
    } else {
      // 广播给所有人
      this.humans.forEach((ws, userId) => {
        if (ws.readyState === WebSocket.OPEN && userId !== fromId) {
          this.send(ws, typingMsg);
        }
      });
    }
  }

  /**
   * 处理断开连接
   */
  handleDisconnect(ws, clientType, clientId, reason = 'unknown') {
    // 清理心跳追踪
    this.cleanupHeartbeat(clientId);

    if (clientType === 'human') {
      this.humans.delete(clientId);
      console.log(`[AgentIM] 👤 Human 断开: ${clientId} (原因: ${reason})`);
    } else if (clientType === 'agent') {
      const fullAgentId = ws._imFullAgentId || clientId;
      this.agents.delete(fullAgentId);
      this.agentStatus.set(fullAgentId, { 
        online: false, 
        lastSeen: Date.now(), 
        typing: false,
        offlineReason: reason
      });
      this.registry.removeAgentConnection(fullAgentId);
      console.log(`[AgentIM] 🤖 Agent 断开: ${fullAgentId} (原因: ${reason})`);
      
      // 广播 Agent 离线
      this.broadcastAgentStatus(fullAgentId, 'offline', { reason });
    }
  }

  /**
   * 清理心跳追踪
   */
  cleanupHeartbeat(clientId) {
    // 清理定时器
    const timer = this.heartbeatTimers.get(clientId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(clientId);
    }
    
    // 清理超时追踪
    const timeout = this.heartbeatTimeouts.get(clientId);
    if (timeout) {
      clearTimeout(timeout);
      this.heartbeatTimeouts.delete(clientId);
    }
    
    // 清理心跳计数
    this.missedHeartbeats.delete(clientId);
  }

  /**
   * 广播 Agent 状态变化
   */
  broadcastAgentStatus(agentId, status, extra = {}) {
    const statusMsg = {
      type: status === 'online' ? 'agent_online' : 'agent_offline',
      agentId,
      timestamp: Date.now(),
      ...extra
    };

    // 发送给所有 Human
    this.humans.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(ws, statusMsg);
      }
    });

    // 发送给其他 Agent（用于感知其他 Agent 状态）
    this.agents.forEach((ws, id) => {
      if (ws.readyState === WebSocket.OPEN && id !== agentId) {
        this.send(ws, statusMsg);
      }
    });

    console.log(`[AgentIM] 📢 Agent ${agentId} ${status}`);
  }

  /**
   * 发送 Agent 列表
   */
  sendAgentList(ws) {
    const agents = [...this.agentStatus].map(([id, status]) => ({
      id,
      online: status.online,
      lastSeen: status.lastSeen,
      connectedAt: status.connectedAt
    }));

    this.send(ws, {
      type: 'status',
      agents: Object.fromEntries(agents.map(a => [a.id, { 
        status: a.online ? 'online' : 'offline',
        lastSeen: a.lastSeen
      }])),
      timestamp: Date.now()
    });
  }

  /**
   * 获取在线 Agent 列表
   */
  getOnlineAgents() {
    return [...this.agentStatus]
      .filter(([_, status]) => status.online)
      .map(([id, status]) => ({
        id,
        lastSeen: status.lastSeen,
        connectedAt: status.connectedAt
      }));
  }

  /**
   * 设置心跳（服务端主动发送）
   */
  setupHeartbeat(ws, clientId, clientType) {
    // 初始化心跳计数
    this.missedHeartbeats.set(clientId, 0);
    
    // 设置心跳定时器
    const timer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        this.cleanupHeartbeat(clientId);
        return;
      }
      
      // 检查超时
      const missedCount = this.missedHeartbeats.get(clientId) || 0;
      
      if (missedCount >= HEARTBEAT_CONFIG.maxMissed) {
        // 超时，标记离线
        console.warn(`[AgentIM] ⏱️ ${clientType}:${clientId} 心跳超时 (${missedCount} 次未响应)`);
        
        if (clientType === 'agent') {
          const fullAgentId = ws._imFullAgentId || clientId;
          this.markAgentOffline(fullAgentId, ws, 'heartbeat_timeout');
        } else {
          this.handleDisconnect(ws, clientType, clientId, 'heartbeat_timeout');
        }
        return;
      }
      
      // 发送心跳
      console.log(`[AgentIM] 🫀 发送心跳给 ${clientType}:${clientId} (missed: ${missedCount})`);
      this.send(ws, { 
        type: 'heartbeat', 
        timestamp: Date.now(),
        serverTime: Date.now()
      });
      
      // 增加心跳计数（等待 ack）
      this.missedHeartbeats.set(clientId, missedCount + 1);
      
    }, HEARTBEAT_CONFIG.interval);

    this.heartbeatTimers.set(clientId, timer);
  }

  /**
   * 发送消息
   */
  send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch (error) {
        console.error(`[AgentIM] 发送消息失败:`, error.message);
      }
    }
  }
  
  /**
   * 获取服务器统计信息
   */
  getStats() {
    return {
      connections: {
        humans: this.humans.size,
        agents: this.agents.size
      },
      agents: this.agentStatus,
      heartbeat: HEARTBEAT_CONFIG,
      registry: this.registry.getStats()
    };
  }
}

// 导出
module.exports = { AgentIMServer, HEARTBEAT_CONFIG };

// 如果直接运行
if (require.main === module) {
  const port = parseInt(process.env.PORT) || 18789;
  const server = new AgentIMServer({ port });
  
  server.start().then(() => {
    console.log('[AgentIM] 服务器启动成功');
    console.log(`[AgentIM] 访问 http://localhost:${port}/health 查看状态`);
  }).catch(err => {
    console.error('[AgentIM] 启动失败:', err);
    process.exit(1);
  });

  // 优雅关闭
  process.on('SIGINT', async () => {
    console.log('[AgentIM] 正在关闭...');
    await server.stop();
    process.exit(0);
  });
}