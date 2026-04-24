/**
 * JWT Authentication Module for Agent IM Federation
 * 
 * 功能:
 * 1. JWT Token 生成和验证
 * 2. API Key 验证（MVP 阶段）
 * 3. Token 刷新机制
 * 
 * 身份模型: {instanceId}:{agentName}
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const API_KEYS_FILE = path.join(DATA_DIR, 'api-keys.json');

// JWT 配置
const JWT_CONFIG = {
    // MVP 阶段使用固定密钥，v2.0 改为从环境变量读取
    secret: process.env.JWT_SECRET || 'agent-im-federation-mvp-secret-key-2026',
    issuer: 'agent-im-federation',
    audience: 'agent-im-clients',
    expiresIn: '24h',  // Token 有效期 24 小时
    refreshExpiresIn: '7d'  // 刷新 Token 有效期 7 天
};

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * API Key 管理
 */
class ApiKeyManager {
    constructor() {
        this.keys = this.loadApiKeys();
    }

    /**
     * 加载 API Keys
     */
    loadApiKeys() {
        try {
            if (!fs.existsSync(API_KEYS_FILE)) {
                return this.initDefaultApiKeys();
            }
            return JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf8'));
        } catch (error) {
            console.error('[JWT] 加载 API Keys 失败:', error.message);
            return this.initDefaultApiKeys();
        }
    }

    /**
     * 初始化默认 API Keys（MVP 阶段）
     */
    initDefaultApiKeys() {
        // MVP 阶段：为已知 Agent 生成固定 API Key
        const defaultKeys = [
            { key: 'ak-main-2026', agentId: 'agent-main', description: 'Main Agent API Key', permissions: ['read', 'write', 'execute', 'manage'] },
            { key: 'ak-coder-2026', agentId: 'agent-coder', description: 'Coder Agent API Key', permissions: ['read', 'write', 'execute'] },
            { key: 'ak-deep-2026', agentId: 'agent-deep', description: 'Deep Agent API Key', permissions: ['read', 'write', 'execute', 'manage'] },
            { key: 'ak-fast-2026', agentId: 'agent-fast', description: 'Fast Agent API Key', permissions: ['read', 'write', 'execute'] },
            { key: 'ak-chat-2026', agentId: 'agent-chat', description: 'Chat Agent API Key', permissions: ['read', 'write', 'execute'] },
            { key: 'ak-test-2026', agentId: 'agent-test', description: 'Test Agent API Key', permissions: ['read', 'write', 'execute', 'manage'] },
            { key: 'ak-office-2026', agentId: 'agent-office', description: 'Office Agent API Key', permissions: ['read', 'write', 'execute'] },
            { key: 'ak-office-1-2026', agentId: 'agent-office-1', description: 'Office-1 Agent API Key', permissions: ['read', 'write', 'execute'] },
            { key: 'ak-coder-1-2026', agentId: 'agent-coder-1', description: 'Coder-1 Agent API Key', permissions: ['read', 'write', 'execute'] },
            { key: 'ak-coder-2-2026', agentId: 'agent-coder-2', description: 'Coder-2 Agent API Key', permissions: ['read', 'write', 'execute'] }
        ];

        fs.writeFileSync(API_KEYS_FILE, JSON.stringify(defaultKeys, null, 2));
        console.log('[JWT] 初始化默认 API Keys 完成');
        return defaultKeys;
    }

    /**
     * 验证 API Key
     * @param {string} apiKey - API Key
     * @returns {{ valid: boolean, agentId?: string, permissions?: string[], error?: string }}
     */
    verifyApiKey(apiKey) {
        const keyEntry = this.keys.find(k => k.key === apiKey);
        
        if (!keyEntry) {
            return { valid: false, error: 'API Key 无效' };
        }

        return {
            valid: true,
            agentId: keyEntry.agentId,
            permissions: keyEntry.permissions || ['read', 'write', 'execute']
        };
    }

    /**
     * 添加新的 API Key
     */
    addApiKey(agentId, description = '', permissions = ['read', 'write', 'execute']) {
        const key = `ak-${agentId}-${crypto.randomBytes(8).toString('hex')}`;
        
        const keyEntry = {
            key,
            agentId,
            description,
            permissions,
            createdAt: new Date().toISOString()
        };

        this.keys.push(keyEntry);
        this.saveApiKeys();

        return keyEntry;
    }

    /**
     * 保存 API Keys
     */
    saveApiKeys() {
        fs.writeFileSync(API_KEYS_FILE, JSON.stringify(this.keys, null, 2));
    }
}

/**
 * JWT Token 管理器
 */
class JwtTokenManager {
    constructor() {
        this.apiKeyManager = new ApiKeyManager();
        this.tokenBlacklist = new Map(); // Token 黑名单（用于登出）
    }

    /**
     * 生成 JWT Token
     * @param {string} instanceId - 实例 ID（如 'local'）
     * @param {string} agentName - Agent 名称（如 'main'）
     * @param {string} apiKey - API Key（用于验证）
     * @returns {{ success: boolean, token?: string, refreshToken?: string, error?: string }}
     */
    generateToken(instanceId, agentName, apiKey) {
        // 1. 验证 API Key
        const keyResult = this.apiKeyManager.verifyApiKey(apiKey);
        
        if (!keyResult.valid) {
            return { success: false, error: keyResult.error };
        }

        // 2. 验证 Agent ID 匹配
        const expectedAgentId = `agent-${agentName}`;
        if (keyResult.agentId !== expectedAgentId) {
            return { success: false, error: 'API Key 与 Agent ID 不匹配' };
        }

        // 3. 构建身份标识
        const fullAgentId = `${instanceId}:${agentName}`;

        // 4. 生成 JWT Token
        const payload = {
            sub: fullAgentId,           // Subject: 完整 Agent ID
            instanceId,                 // 实例 ID
            agentName,                  // Agent 名称
            agentId: keyResult.agentId, // 原始 Agent ID
            permissions: keyResult.permissions,
            iat: Math.floor(Date.now() / 1000)
        };

        try {
            const token = jwt.sign(payload, JWT_CONFIG.secret, {
                issuer: JWT_CONFIG.issuer,
                audience: JWT_CONFIG.audience,
                expiresIn: JWT_CONFIG.expiresIn
            });

            // 5. 生成刷新 Token
            const refreshToken = jwt.sign(
                { sub: fullAgentId, type: 'refresh' },
                JWT_CONFIG.secret,
                {
                    issuer: JWT_CONFIG.issuer,
                    audience: JWT_CONFIG.audience,
                    expiresIn: JWT_CONFIG.refreshExpiresIn
                }
            );

            return {
                success: true,
                token,
                refreshToken,
                expiresIn: JWT_CONFIG.expiresIn,
                fullAgentId
            };
        } catch (error) {
            console.error('[JWT] Token 生成失败:', error.message);
            return { success: false, error: 'Token 生成失败' };
        }
    }

    /**
     * 验证 JWT Token
     * @param {string} token - JWT Token
     * @returns {{ valid: boolean, payload?: object, error?: string }}
     */
    verifyToken(token) {
        // 1. 检查黑名单
        if (this.tokenBlacklist.has(token)) {
            return { valid: false, error: 'Token 已失效' };
        }

        try {
            const payload = jwt.verify(token, JWT_CONFIG.secret, {
                issuer: JWT_CONFIG.issuer,
                audience: JWT_CONFIG.audience
            });

            return {
                valid: true,
                payload: {
                    fullAgentId: payload.sub,
                    instanceId: payload.instanceId,
                    agentName: payload.agentName,
                    agentId: payload.agentId,
                    permissions: payload.permissions
                }
            };
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return { valid: false, error: 'Token 已过期', expired: true };
            }
            if (error.name === 'JsonWebTokenError') {
                return { valid: false, error: 'Token 无效' };
            }
            return { valid: false, error: error.message };
        }
    }

    /**
     * 刷新 Token
     * @param {string} refreshToken - 刷新 Token
     * @returns {{ success: boolean, token?: string, error?: string }}
     */
    refreshToken(refreshToken) {
        // 1. 检查黑名单
        if (this.tokenBlacklist.has(refreshToken)) {
            return { success: false, error: '刷新 Token 已失效' };
        }

        try {
            const payload = jwt.verify(refreshToken, JWT_CONFIG.secret, {
                issuer: JWT_CONFIG.issuer,
                audience: JWT_CONFIG.audience
            });

            if (payload.type !== 'refresh') {
                return { success: false, error: '无效的刷新 Token' };
            }

            // 2. 生成新的 Token
            const newPayload = {
                sub: payload.sub,
                instanceId: payload.instanceId,
                agentName: payload.agentName,
                agentId: payload.agentId,
                permissions: payload.permissions,
                iat: Math.floor(Date.now() / 1000)
            };

            const newToken = jwt.sign(newPayload, JWT_CONFIG.secret, {
                issuer: JWT_CONFIG.issuer,
                audience: JWT_CONFIG.audience,
                expiresIn: JWT_CONFIG.expiresIn
            });

            return {
                success: true,
                token: newToken,
                expiresIn: JWT_CONFIG.expiresIn
            };
        } catch (error) {
            return { success: false, error: '刷新 Token 无效或已过期' };
        }
    }

    /**
     * 使 Token 失效（加入黑名单）
     * @param {string} token - JWT Token
     */
    invalidateToken(token) {
        // 解码获取过期时间
        try {
            const decoded = jwt.decode(token);
            if (decoded && decoded.exp) {
                // 在 Token 过期后自动从黑名单移除
                const ttl = decoded.exp * 1000 - Date.now();
                if (ttl > 0) {
                    this.tokenBlacklist.set(token, true);
                    setTimeout(() => {
                        this.tokenBlacklist.delete(token);
                    }, ttl);
                }
            }
        } catch (error) {
            // 忽略无效 Token
        }
    }

    /**
     * 验证权限
     * @param {object} payload - Token payload
     * @param {string} requiredPermission - 所需权限
     * @returns {boolean}
     */
    checkPermission(payload, requiredPermission) {
        return payload.permissions && payload.permissions.includes(requiredPermission);
    }
}

/**
 * WebSocket 连接验证中间件
 */
function createWsAuthMiddleware(tokenManager) {
    return function(ws, req, callback) {
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        const token = parsedUrl.searchParams.get('token');
        const apiKey = parsedUrl.searchParams.get('apiKey');

        // 方式1: JWT Token 验证
        if (token) {
            const result = tokenManager.verifyToken(token);
            if (result.valid) {
                ws._auth = result.payload;
                return callback(true);
            } else {
                console.warn(`[JWT] Token 验证失败: ${result.error}`);
                return callback(false, result.error);
            }
        }

        // 方式2: API Key 验证（MVP 阶段简化）
        if (apiKey) {
            const result = tokenManager.apiKeyManager.verifyApiKey(apiKey);
            if (result.valid) {
                // 从路径提取 agentName
                const pathname = parsedUrl.pathname;
                const agentMatch = pathname.match(/^\/agent-(.+)$/) || pathname.match(/^\/(\w+)$/);
                const agentName = agentMatch ? agentMatch[1] : result.agentId.replace('agent-', '');

                ws._auth = {
                    fullAgentId: `local:${agentName}`,
                    instanceId: 'local',
                    agentName,
                    agentId: result.agentId,
                    permissions: result.permissions
                };
                return callback(true);
            } else {
                console.warn(`[JWT] API Key 验证失败: ${result.error}`);
                return callback(false, result.error);
            }
        }

        // 无认证信息，允许连接（兼容模式）
        console.warn('[JWT] 无认证信息，使用兼容模式');
        callback(true);
    };
}

/**
 * Express 认证中间件
 */
function createExpressAuthMiddleware(tokenManager) {
    return function(req, res, next) {
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

        const result = tokenManager.verifyToken(token);
        
        if (!result.valid) {
            return res.status(401).json({
                code: 401,
                error: {
                    type: 'AuthenticationError',
                    message: result.error
                }
            });
        }

        req.auth = result.payload;
        next();
    };
}

// 单例实例
let tokenManagerInstance = null;

/**
 * 获取 Token 管理器单例
 */
function getTokenManager() {
    if (!tokenManagerInstance) {
        tokenManagerInstance = new JwtTokenManager();
    }
    return tokenManagerInstance;
}

/**
 * 导出
 */
module.exports = {
    JwtTokenManager,
    ApiKeyManager,
    getTokenManager,
    createWsAuthMiddleware,
    createExpressAuthMiddleware,
    JWT_CONFIG
};