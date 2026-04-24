/**
 * Agent 身份认证中间件
 * 
 * 功能:
 * 1. Agent ID + Token 验证
 * 2. 生成新 Token
 * 3. 获取 Agent 列表
 * 4. 验证请求权限
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../data');
const AGENTS_FILE = path.join(DATA_DIR, 'agents-registry.json');
const TOKENS_FILE = path.join(DATA_DIR, 'agent-tokens.json');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * 读取 Agent 注册表
 */
function readAgents() {
    try {
        if (!fs.existsSync(AGENTS_FILE)) {
            return {
                agents: [],
                nextAgentId: 1
            };
        }
        return JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8'));
    } catch (error) {
        console.error('读取 Agent 注册表失败:', error.message);
        return { agents: [], nextAgentId: 1 };
    }
}

/**
 * 保存 Agent 注册表
 */
function saveAgents(data) {
    try {
        fs.writeFileSync(AGENTS_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('保存 Agent 注册表失败:', error.message);
        return false;
    }
}

/**
 * 读取 Token 表
 */
function readTokens() {
    try {
        if (!fs.existsSync(TOKENS_FILE)) {
            return [];
        }
        return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    } catch (error) {
        console.error('读取 Token 表失败:', error.message);
        return [];
    }
}

/**
 * 保存 Token 表
 */
function saveTokens(tokens) {
    try {
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
        return true;
    } catch (error) {
        console.error('保存 Token 表失败:', error.message);
        return false;
    }
}

/**
 * 生成 Token
 */
function generateToken() {
    return `tok-${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * 生成 Agent ID
 */
function generateAgentId() {
    return `agent-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * 注册新 Agent
 */
function registerAgent(name, description = '') {
    const data = readAgents();
    
    const agent = {
        agentId: generateAgentId(),
        name,
        description,
        status: 'active',
        createdAt: new Date().toISOString(),
        lastLogin: null,
        permissions: ['read', 'write', 'execute', 'manage']
    };
    
    data.agents.push(agent);
    saveAgents(data);
    
    // 生成初始 Token
    const token = generateToken();
    addToken(agent.agentId, token);
    
    return {
        agentId: agent.agentId,
        token,
        name: agent.name,
        description: agent.description
    };
}

/**
 * 添加 Token
 */
function addToken(agentId, token, expiresAt = null) {
    const tokens = readTokens();
    
    const tokenEntry = {
        agentId,
        token,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30天
        lastUsed: null,
        isActive: true
    };
    
    tokens.push(tokenEntry);
    saveTokens(tokens);
    
    return tokenEntry.token;
}

/**
 * 验证 Token
 */
function verifyToken(token) {
    // First try to find token in agent-tokens.json
    const tokens = readTokens();
    const tokenEntry = tokens.find(t => t.token === token && t.isActive);
    
    if (tokenEntry) {
        // Check expiration
        const now = new Date();
        if (new Date(tokenEntry.expiresAt) < now) {
            return {
                valid: false,
                error: 'Token 已过期'
            };
        }
        
        // Update last used time
        tokenEntry.lastUsed = now.toISOString();
        saveTokens(tokens);
        
        return {
            valid: true,
            agentId: tokenEntry.agentId,
            token: tokenEntry.token
        };
    }
    
    // Also check for tokens stored in agents-registry.json
    const agentData = readAgents();
    for (const agent of agentData.agents) {
        const agentTokens = agent.tokens || [];
        const foundToken = agentTokens.find(t => t.token === token && t.active !== false);
        
        if (foundToken) {
            // Check expiration
            const now = new Date();
            const expiresAt = foundToken.expiresAt || foundToken.expiresAt;
            
            if (expiresAt && new Date(expiresAt) < now) {
                return {
                    valid: false,
                    error: 'Token 已过期'
                };
            }
            
            // Update last used time in agent registry
            if (agent.tokens) {
                const tokenIdx = agent.tokens.findIndex(t => t.token === token);
                if (tokenIdx !== -1) {
                    agent.tokens[tokenIdx].lastUsed = now.toISOString();
                }
                saveAgents(agentData);
            }
            
            return {
                valid: true,
                agentId: agent.agentId || agent.id,
                token: token
            };
        }
    }
    
    return {
        valid: false,
        error: 'Token 无效'
    };
}

/**
 * 验证 Agent 权限
 */
function verifyPermission(agentId, requiredPermission) {
    const data = readAgents();
    const agent = data.agents.find(a => a.agentId === agentId);
    
    if (!agent) {
        return {
            valid: false,
            error: 'Agent 不存在'
        };
    }
    
    if (!agent.permissions.includes(requiredPermission)) {
        return {
            valid: false,
            error: `缺少权限: ${requiredPermission}`
        };
    }
    
    return {
        valid: true,
        agentName: agent.name,
        permissions: agent.permissions
    };
}

/**
 * 获取 Agent 信息
 */
function getAgent(agentId) {
    const data = readAgents();
    return data.agents.find(a => a.agentId === agentId || a.id === agentId);
}

/**
 * 获取所有 Agent
 */
function listAgents(status = null) {
    const data = readAgents();
    
    if (status) {
        return data.agents.filter(a => a.status === status);
    }
    
    return data.agents;
}

/**
 * 无效化 Token
 */
function invalidateToken(token) {
    const tokens = readTokens();
    const index = tokens.findIndex(t => t.token === token);
    
    if (index === -1) {
        return { success: false, error: 'Token 不存在' };
    }
    
    tokens[index].isActive = false;
    saveTokens(tokens);
    
    return { success: true };
}

/**
 * 批量验证中间件 (Express)
 */
function authenticateMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({
            code: 401,
            error: {
                type: 'AuthenticationError',
                message: '缺少 Authorization 头'
            }
        });
    }
    
    // 支持 Bearer token
    const token = authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : authHeader;
    
    const verifyResult = verifyToken(token);
    
    if (!verifyResult.valid) {
        return res.status(401).json({
            code: 401,
            error: {
                type: 'AuthenticationError',
                message: verifyResult.error
            }
        });
    }
    
    // 将 Agent 信息添加到请求对象
    req.agent = {
        agentId: verifyResult.agentId,
        token: verifyResult.token
    };
    
    next();
}

/**
 * 权限验证中间件 (Express)
 */
function permissionMiddleware(requiredPermission) {
    return (req, res, next) => {
        if (!req.agent) {
            return res.status(401).json({
                code: 401,
                error: {
                    type: 'AuthenticationError',
                    message: '未认证'
                }
            });
        }
        
        const verifyResult = verifyPermission(req.agent.agentId, requiredPermission);
        
        if (!verifyResult.valid) {
            return res.status(403).json({
                code: 403,
                error: {
                    type: 'PermissionError',
                    message: verifyResult.error
                }
            });
        }
        
        next();
    };
}

/**
 * 初始化默认 Agent
 */
function initDefaultAgents() {
    const data = readAgents();
    
    if (data.agents.length > 0) {
        console.log('Agent 注册表已存在，跳过初始化');
        return;
    }
    
    // 创建默认 Agent
    const defaultAgents = [
        { name: 'Main Agent', description: '主 Agent' },
        { name: 'Coder Agent', description: '代码执行 Agent' },
        { name: 'Deep Agent', description: '深度思考 Agent' },
        { name: 'Fast Agent', description: '快速执行 Agent' },
        { name: 'Chat Agent', description: '对话 Agent' },
        { name: 'Test Agent', description: '测试 Agent' }
    ];
    
    const tokens = [];
    
    for (const agentDesc of defaultAgents) {
        const data = readAgents();
        
        const agent = {
            agentId: generateAgentId(),
            name: agentDesc.name,
            description: agentDesc.description,
            status: 'active',
            createdAt: new Date().toISOString(),
            lastLogin: null,
            permissions: ['read', 'write', 'execute', 'manage']
        };
        
        data.agents.push(agent);
        
        // 生成 Token
        const token = generateToken();
        tokens.push({
            agentId: agent.agentId,
            token,
            createdAt: agent.createdAt,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            lastUsed: null,
            isActive: true
        });
    }
    
    saveAgents(data);
    
    // 保存 Token
    const existingTokens = readTokens();
    saveTokens([...existingTokens, ...tokens]);
    
    console.log('默认 Agent 初始化完成:');
    defaultAgents.forEach(a => {
        console.log(`  - ${a.name}`);
    });
}

/**
 * 导出 API
 */
module.exports = {
    // Agent 管理
    registerAgent,
    getAgent,
    listAgents,
    initDefaultAgents,
    
    // Token 管理
    addToken,
    verifyToken,
    invalidateToken,
    generateToken,
    
    // 权限验证
    verifyPermission,
    
    // 中间件
    authenticateMiddleware,
    permissionMiddleware
};
