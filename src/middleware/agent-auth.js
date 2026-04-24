/**
 * Agent 统一认证中间件
 * 融合 Token 验证 + 权限检查 + 心跳更新
 * 
 * @version 2.0
 * @date 2026-03-15
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../data');
const REGISTRY_FILE = path.join(DATA_DIR, 'registered-agents.json');

// 内存缓存
let agentCache = new Map();
let heartbeatCache = new Map();
let lastFlushTime = Date.now();
const FLUSH_INTERVAL = 30000; // 30秒批量写入

/**
 * 加载 Agent 注册表
 */
function loadRegistry() {
    try {
        const content = fs.readFileSync(REGISTRY_FILE, 'utf8');
        const data = JSON.parse(content);
        if (data.agents) {
            // 对象结构
            Object.entries(data.agents).forEach(([id, agent]) => {
                agentCache.set(id, agent);
            });
        }
        return data;
    } catch (e) {
        console.error('加载 Agent 注册表失败:', e.message);
        return { version: 1, agents: {} };
    }
}

/**
 * 保存 Agent 注册表
 */
function saveRegistry(data) {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
}

/**
 * 刷新心跳缓存到文件
 */
function flushHeartbeats() {
    if (heartbeatCache.size === 0) return;
    
    const registry = loadRegistry();
    const now = Date.now();
    
    heartbeatCache.forEach((data, agentId) => {
        if (registry.agents[agentId]) {
            registry.agents[agentId].lastHeartbeat = data.timestamp || now;
            if (data.currentTask) {
                registry.agents[agentId].currentTask = data.currentTask;
            }
            if (data.progress !== undefined) {
                registry.agents[agentId].progress = data.progress;
            }
        }
    });
    
    saveRegistry(registry);
    heartbeatCache.clear();
    lastFlushTime = now;
    console.log(`[AgentAuth] 已刷新 ${heartbeatCache.size} 个心跳`);
}

// 定时刷新心跳
setInterval(flushHeartbeats, FLUSH_INTERVAL);

/**
 * 通过 Token 查找 Agent
 */
function findAgentByToken(token) {
    const tokenHash = hashToken(token);
    
    for (const [id, agent] of agentCache) {
        if (agent.tokenHash === tokenHash) {
            return agent;
        }
    }
    
    // 缓存未命中，从文件加载
    const registry = loadRegistry();
    for (const [id, agent] of Object.entries(registry.agents || {})) {
        if (agent.tokenHash === tokenHash) {
            agentCache.set(id, agent);
            return agent;
        }
    }
    
    return null;
}

/**
 * 哈希 Token
 */
function hashToken(token) {
    return 'sha256:' + crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
}

/**
 * 生成 Token
 */
function generateToken() {
    return 'tok-' + crypto.randomBytes(32).toString('hex');
}

/**
 * Agent 认证中间件
 */
function authenticateAgent(req, res, next) {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.body?.token;
    
    if (!token) {
        return res.status(401).json({ 
            code: 'MISSING_TOKEN',
            error: '缺少 Token' 
        });
    }
    
    const agent = findAgentByToken(token);
    
    if (!agent) {
        return res.status(401).json({ 
            code: 'INVALID_TOKEN',
            error: '无效 Token' 
        });
    }
    
    if (agent.tokenExpiresAt && agent.tokenExpiresAt < Date.now()) {
        return res.status(401).json({ 
            code: 'TOKEN_EXPIRED',
            error: 'Token 已过期' 
        });
    }
    
    // 注入 Agent 信息到请求
    req.agent = agent;
    next();
}

/**
 * 权限检查中间件
 */
function requirePermission(...permissions) {
    return (req, res, next) => {
        const agent = req.agent;
        
        if (!agent) {
            return res.status(401).json({ 
                code: 'UNAUTHORIZED',
                error: '未认证' 
            });
        }
        
        const hasPermission = permissions.every(p => 
            agent.permissions && agent.permissions.includes(p)
        );
        
        if (!hasPermission) {
            return res.status(403).json({ 
                code: 'PERMISSION_DENIED',
                error: '权限不足',
                required: permissions,
                current: agent.permissions || []
            });
        }
        
        next();
    };
}

/**
 * 注册 Agent
 */
function registerAgent(info) {
    const { name, type, permissions, capabilities } = info;
    
    const agentId = `agent-${type}`;
    const token = generateToken();
    const tokenHash = hashToken(token);
    
    const registry = loadRegistry();
    
    // 检查是否已存在
    if (registry.agents[agentId]) {
        // 已存在，更新
        registry.agents[agentId].name = name || registry.agents[agentId].name;
        registry.agents[agentId].permissions = permissions || registry.agents[agentId].permissions;
        registry.agents[agentId].capabilities = capabilities || registry.agents[agentId].capabilities;
        registry.agents[agentId].tokenHash = tokenHash;
        registry.agents[agentId].tokenExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
        registry.agents[agentId].status = 'online';
    } else {
        // 新建
        registry.agents[agentId] = {
            id: agentId,
            name: name || `${type} Agent`,
            type: type,
            description: '',
            status: 'online',
            
            tokenHash: tokenHash,
            tokenExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
            permissions: permissions || ['read', 'write', 'execute'],
            
            registeredAt: Date.now(),
            lastHeartbeat: Date.now(),
            currentTask: null,
            capabilities: capabilities || [],
            
            stats: {
                tasksCompleted: 0,
                tasksFailed: 0,
                totalExecutionTime: 0
            },
            
            metadata: {},
            tags: []
        };
    }
    
    saveRegistry(registry);
    agentCache.set(agentId, registry.agents[agentId]);
    
    return {
        agentId,
        token,
        expiresAt: registry.agents[agentId].tokenExpiresAt
    };
}

/**
 * 更新心跳（内存缓存）
 */
function updateHeartbeat(agentId, status = {}) {
    heartbeatCache.set(agentId, {
        timestamp: Date.now(),
        currentTask: status.currentTask,
        progress: status.progress
    });
    
    return {
        success: true,
        timestamp: Date.now()
    };
}

/**
 * 获取 Agent 列表
 */
function listAgents(filter = {}) {
    const registry = loadRegistry();
    let agents = Object.values(registry.agents || {});
    
    if (filter.status) {
        agents = agents.filter(a => a.status === filter.status);
    }
    if (filter.type) {
        agents = agents.filter(a => a.type === filter.type);
    }
    
    return agents.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        status: a.status,
        lastHeartbeat: a.lastHeartbeat,
        currentTask: a.currentTask,
        permissions: a.permissions
    }));
}

/**
 * 健康检查
 */
function checkHealth() {
    const registry = loadRegistry();
    const now = Date.now();
    const timeout = 2 * 60 * 1000; // 2分钟
    
    const result = {
        online: 0,
        unhealthy: 0,
        offline: 0,
        agents: []
    };
    
    Object.values(registry.agents || {}).forEach(agent => {
        const elapsed = agent.lastHeartbeat ? now - agent.lastHeartbeat : Infinity;
        
        if (elapsed > timeout) {
            agent.status = 'unhealthy';
            result.unhealthy++;
        } else {
            agent.status = 'online';
            result.online++;
        }
        
        result.agents.push({
            id: agent.id,
            status: agent.status,
            lastHeartbeat: agent.lastHeartbeat,
            elapsed: Math.round(elapsed / 1000)
        });
    });
    
    saveRegistry(registry);
    return result;
}

/**
 * 刷新 Token
 */
function refreshToken(agentId) {
    const registry = loadRegistry();
    
    if (!registry.agents[agentId]) {
        return null;
    }
    
    const token = generateToken();
    registry.agents[agentId].tokenHash = hashToken(token);
    registry.agents[agentId].tokenExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    
    saveRegistry(registry);
    agentCache.set(agentId, registry.agents[agentId]);
    
    return {
        token,
        expiresAt: registry.agents[agentId].tokenExpiresAt
    };
}

/**
 * 无效化 Token
 */
function invalidateToken(token) {
    const agent = findAgentByToken(token);
    if (!agent) return false;
    
    const registry = loadRegistry();
    if (registry.agents[agent.id]) {
        registry.agents[agent.id].tokenHash = 'invalidated:' + Date.now();
        saveRegistry(registry);
        agentCache.delete(agent.id);
    }
    
    return true;
}

module.exports = {
    authenticateAgent,
    requirePermission,
    registerAgent,
    updateHeartbeat,
    listAgents,
    checkHealth,
    refreshToken,
    invalidateToken,
    generateToken,
    hashToken,
    findAgentByToken,
    flushHeartbeats,
    loadRegistry,
    saveRegistry
};