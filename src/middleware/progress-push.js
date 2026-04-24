/**
 * WebSocket Progress Push Module
 * 
 * 功能:
 * 1. 实时推送任务执行进度
 * 2. 支持多种事件类型
 * 3. 广播和点对点推送
 * 4. 认证和权限验证
 */

const WebSocket = require('ws');
const crypto = require('crypto');

// WebSocket 服务器引用
let wss = null;

// 已连接的客户端
const clients = new Map();

// 事件类型
const EVENT_TYPE = {
    TASK_STARTED: 'task_started',
    TASK_STEP_PROGRESS: 'task_step_progress',
    TASK_STEP_COMPLETED: 'task_step_completed',
    TASK_COMPLETED: 'task_completed',
    TASK_ERROR: 'task_error',
    TASK_CANCELLED: 'task_cancelled',
    TASK_PAUSED: 'task_paused',
    TASK_STATUS_CHANGED: 'task_status_changed',
    TASK_VERSION_CONFLICT: 'task_version_conflict',
    TASK_DELETED: 'task_deleted',
    TASK_RESTORED: 'task_restored',
    SYSTEM_STATUS: 'system_status',
    HEARTBEAT: 'heartbeat'
};

// 频道订阅管理
const channelSubscriptions = new Map();

// 最大连接数限制
const MAX_CONNECTIONS = 200;

/**
 * 初始化 WebSocket 服务器
 */
function initWebSocketServer(server) {
    wss = new WebSocket.Server({ server });
    
    wss.on('connection', (ws, req) => {
        // 检查连接数限制
        if (clients.size >= MAX_CONNECTIONS) {
            ws.close(4004, 'Maximum connections reached');
            return;
        }
        
        console.log('WebSocket 连接已建立');
        
        // 从 URL 获取 agentId 和 token
        const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
        const agentId = urlParams.get('agentId');
        const token = urlParams.get('token');
        const channels = urlParams.get('channels')?.split(',') || ['all'];
        
        // 验证连接
        if (!agentId || !token) {
            ws.close(4001, 'Missing agentId or token');
            return;
        }
        
        // 验证 Token (简化版 - 实际应调用 auth.verifyToken)
        if (!isValidToken(agentId, token)) {
            ws.close(4002, 'Invalid token');
            return;
        }
        
        // 保存客户端信息
        const clientId = generateClientId();
        clients.set(clientId, {
            ws,
            agentId,
            token,
            channels,
            connectedAt: new Date().toISOString(),
            lastPing: Date.now()
        });
        
        // 初始化频道订阅
        channels.forEach(channel => {
            if (!channelSubscriptions.has(channel)) {
                channelSubscriptions.set(channel, new Set());
            }
            channelSubscriptions.get(channel).add(clientId);
        });
        
        console.log(`Client connected: ${clientId} (agentId: ${agentId}, channels: ${channels.join(',')})`);
        
        // 心跳检测
        const heartbeatInterval = setInterval(() => {
            const client = clients.get(clientId);
            if (client && Date.now() - client.lastPing > 30000) {
                ws.close(4003, 'Heartbeat timeout');
                clearInterval(heartbeatInterval);
            }
        }, 10000);
        
        // 处理消息
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                handleMessage(clientId, message);
            } catch (error) {
                console.warn(`Invalid message from client ${clientId}:`, error.message);
            }
        });
        
        ws.on('pong', () => {
            const client = clients.get(clientId);
            if (client) {
                client.lastPing = Date.now();
            }
        });
        
        ws.on('close', () => {
            console.log(`Client disconnected: ${clientId}`);
            // 清理频道订阅
            const client = clients.get(clientId);
            if (client && client.channels) {
                client.channels.forEach(channel => {
                    const subscribers = channelSubscriptions.get(channel);
                    if (subscribers) {
                        subscribers.delete(clientId);
                        if (subscribers.size === 0) {
                            channelSubscriptions.delete(channel);
                        }
                    }
                });
            }
            clients.delete(clientId);
            clearInterval(heartbeatInterval);
        });
        
        ws.on('error', (error) => {
            console.error(`WebSocket error for client ${clientId}:`, error.message);
        });
        
        // 发送连接成功消息
        ws.send(JSON.stringify({
            type: 'connected',
            timestamp: new Date().toISOString(),
            data: { clientId, channels }
        }));
    });
    
    console.log('WebSocket server initialized for progress push');
}

/**
 * 处理客户端消息
 */
function handleMessage(clientId, message) {
    const { type, data } = message;
    
    switch (type) {
        case 'subscribe':
            handleSubscribe(clientId, data.channels);
            break;
        case 'unsubscribe':
            handleUnsubscribe(clientId, data.channels);
            break;
        case 'ping':
            const client = clients.get(clientId);
            if (client && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
            }
            break;
        default:
            console.log(`Unknown message type: ${type} from client ${clientId}`);
    }
}

/**
 * 处理频道订阅
 */
function handleSubscribe(clientId, newChannels) {
    const client = clients.get(clientId);
    if (!client) return;
    
    newChannels.forEach(channel => {
        if (!channelSubscriptions.has(channel)) {
            channelSubscriptions.set(channel, new Set());
        }
        channelSubscriptions.get(channel).add(clientId);
        
        if (!client.channels.includes(channel)) {
            client.channels.push(channel);
        }
    });
    
    console.log(`Client ${clientId} subscribed to: ${newChannels.join(',')}`);
}

/**
 * 处理取消订阅
 */
function handleUnsubscribe(clientId, channelsToRemove) {
    const client = clients.get(clientId);
    if (!client) return;
    
    channelsToRemove.forEach(channel => {
        const subscribers = channelSubscriptions.get(channel);
        if (subscribers) {
            subscribers.delete(clientId);
            if (subscribers.size === 0) {
                channelSubscriptions.delete(channel);
            }
        }
        client.channels = client.channels.filter(c => c !== channel);
    });
    
    console.log(`Client ${clientId} unsubscribed from: ${channelsToRemove.join(',')}`);
}

/**
 * 广播消息
 */
function broadcast(eventType, data, channel = 'all') {
    if (!wss) {
        console.warn('WebSocket server not initialized');
        return;
    }
    
    const message = JSON.stringify({
        type: eventType,
        timestamp: new Date().toISOString(),
        data
    });
    
    // 获取订阅该频道的客户端
    const subscribers = channelSubscriptions.get(channel);
    
    if (subscribers) {
        // 发送给订阅了特定频道的客户端
        subscribers.forEach(clientId => {
            const client = clients.get(clientId);
            if (client && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(message);
            }
        });
    } else {
        // 如果没有特定频道订阅，发送给所有客户端
        clients.forEach((client, clientId) => {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(message);
            }
        });
    }
}

/**
 * 推送版本冲突通知
 */
function pushVersionConflict(taskId, clientVersion, serverVersion, serverTask, clientId) {
    const data = {
        taskId,
        clientVersion,
        serverVersion,
        serverTask,
        message: '任务已被其他客户端修改，已更新为最新版本'
    };
    
    if (clientId) {
        // 推送给特定客户端
        pushToClient(clientId, EVENT_TYPE.TASK_VERSION_CONFLICT, data);
    } else {
        // 广播给所有客户端
        broadcast(EVENT_TYPE.TASK_VERSION_CONFLICT, data);
    }
    
    console.log(`[ProgressPush] Version conflict pushed for task ${taskId}: client v${clientVersion} vs server v${serverVersion}`);
}

/**
 * 推送任务状态变更
 */
function pushTaskStatusChanged(taskId, fromStatus, toStatus, actorId, task) {
    broadcast(EVENT_TYPE.TASK_STATUS_CHANGED, {
        taskId,
        fromStatus,
        toStatus,
        actorId,
        task
    });
}

/**
 * 推送任务暂停
 */
function pushTaskPaused(taskId, agentId, reason) {
    broadcast(EVENT_TYPE.TASK_PAUSED, {
        taskId,
        agentId,
        reason,
        timestamp: new Date().toISOString()
    });
}

/**
 * 点对点推送
 */
function pushToClient(clientId, eventType, data) {
    const client = clients.get(clientId);
    
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
        console.warn(`Client ${clientId} not available`);
        return false;
    }
    
    const message = JSON.stringify({
        type: eventType,
        timestamp: new Date().toISOString(),
        data
    });
    
    client.ws.send(message);
    return true;
}

/**
 * 推送任务开始
 */
function pushTaskStarted(taskId, agentId, agentName) {
    broadcast(EVENT_TYPE.TASK_STARTED, {
        taskId,
        agentId,
        agentName,
        timestamp: new Date().toISOString()
    });
}

/**
 * 推送步骤进度
 */
function pushStepProgress(taskId, agentId, stepIndex, description, progress) {
    broadcast(EVENT_TYPE.TASK_STEP_PROGRESS, {
        taskId,
        agentId,
        stepIndex,
        description,
        progress
    });
}

/**
 * 推送步骤完成
 */
function pushStepCompleted(taskId, agentId, stepIndex, description, output) {
    broadcast(EVENT_TYPE.TASK_STEP_COMPLETED, {
        taskId,
        agentId,
        stepIndex,
        description,
        output
    });
}

/**
 * 推送任务完成
 */
function pushTaskCompleted(taskId, agentId, agentName, output, metrics) {
    broadcast(EVENT_TYPE.TASK_COMPLETED, {
        taskId,
        agentId,
        agentName,
        output,
        metrics
    });
}

/**
 * 推送错误
 */
function pushError(taskId, agentId, errorCode, errorMessage, stack) {
    broadcast(EVENT_TYPE.TASK_ERROR, {
        taskId,
        agentId,
        errorCode,
        errorMessage,
        stack
    });
}

/**
 * 推送系统状态
 */
function pushSystemStatus(status) {
    broadcast(EVENT_TYPE.SYSTEM_STATUS, {
        timestamp: new Date().toISOString(),
        status
    });
}

/**
 * 通用事件推送方法
 * @param {string} eventType 事件类型
 * @param {Object} data 事件数据
 * @param {string} channel 频道（可选）
 */
function pushEvent(eventType, data, channel = 'all') {
    broadcast(eventType, data, channel);
}

/**
 * 发送心跳
 */
function sendHeartbeat() {
    const heartbeatCount = 0;
    clients.forEach((client, clientId) => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
                type: EVENT_TYPE.HEARTBEAT,
                timestamp: new Date().toISOString(),
                data: { heartbeatCount: heartbeatCount++ }
            }));
        }
    });
}

/**
 * 验证 Token (简化版)
 */
function isValidToken(agentId, token) {
    // 简化验证，实际应调用 auth.verifyToken
    // 允许两种 token 格式：
    // 1. tok-xxx (Agent token)
    // 2. tui-xxx (UI client token)
    if (!token) return false;
    
    // UI 客户端 token
    if (token.startsWith('tui-')) return true;
    
    // Agent token
    if (token.startsWith('tok-')) return true;
    
    return false;
}

/**
 * 生成客户端 ID
 */
function generateClientId() {
    return `ws-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * 获取客户端列表
 */
function getClients() {
    const result = [];
    clients.forEach((client, clientId) => {
        result.push({
            clientId,
            agentId: client.agentId,
            connectedAt: client.connectedAt,
            lastPing: client.lastPing
        });
    });
    return result;
}

/**
 * 断开所有客户端
 */
function disconnectAll() {
    clients.forEach((client, clientId) => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.close();
        }
    });
    clients.clear();
}

/**
 * 导出 API
 */
module.exports = {
    initWebSocketServer,
    broadcast,
    pushToClient,
    pushTaskStarted,
    pushStepProgress,
    pushStepCompleted,
    pushTaskCompleted,
    pushError,
    pushTaskPaused,
    pushTaskStatusChanged,
    pushVersionConflict,
    pushSystemStatus,
    pushEvent,
    sendHeartbeat,
    getClients,
    disconnectAll,
    handleSubscribe,
    handleUnsubscribe,
    EVENT_TYPE,
    MAX_CONNECTIONS
};
