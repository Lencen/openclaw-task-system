/**
 * Agent 统一 API 路由
 * 
 * @version 2.0
 * @date 2026-03-15
 */

const express = require('express');
const router = express.Router();
const agentAuth = require('../middleware/agent-auth');

/**
 * POST /api/agents/register
 * 注册 Agent
 */
router.post('/register', (req, res) => {
    try {
        const { name, type, permissions, capabilities } = req.body;
        
        if (!type) {
            return res.status(400).json({
                code: 'MISSING_TYPE',
                error: '缺少 type 参数'
            });
        }
        
        const result = agentAuth.registerAgent({
            name,
            type,
            permissions,
            capabilities
        });
        
        res.json({
            code: 200,
            data: result
        });
    } catch (e) {
        res.status(500).json({
            code: 'INTERNAL_ERROR',
            error: e.message
        });
    }
});

/**
 * POST /api/agents/heartbeat
 * 心跳
 */
router.post('/heartbeat', agentAuth.authenticateAgent, (req, res) => {
    try {
        const { agentId, status } = req.body;
        
        if (!agentId) {
            return res.status(400).json({
                code: 'MISSING_AGENT_ID',
                error: '缺少 agentId 参数'
            });
        }
        
        const result = agentAuth.updateHeartbeat(agentId, status);
        
        res.json({
            code: 200,
            data: result
        });
    } catch (e) {
        res.status(500).json({
            code: 'INTERNAL_ERROR',
            error: e.message
        });
    }
});

/**
 * POST /api/agents/heartbeat/batch
 * 批量心跳
 */
router.post('/heartbeat/batch', (req, res) => {
    try {
        const { heartbeats } = req.body;
        
        if (!Array.isArray(heartbeats)) {
            return res.status(400).json({
                code: 'INVALID_FORMAT',
                error: 'heartbeats 必须是数组'
            });
        }
        
        const results = heartbeats.map(hb => {
            // 简化验证，只检查 token 存在
            if (hb.token && hb.agentId) {
                return agentAuth.updateHeartbeat(hb.agentId, hb.status);
            }
            return { success: false, error: '缺少 token 或 agentId' };
        });
        
        res.json({
            code: 200,
            data: {
                total: heartbeats.length,
                success: results.filter(r => r.success).length,
                results
            }
        });
    } catch (e) {
        res.status(500).json({
            code: 'INTERNAL_ERROR',
            error: e.message
        });
    }
});

/**
 * POST /api/agents/verify
 * 验证 Token
 */
router.post('/verify', (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({
                code: 'MISSING_TOKEN',
                error: '缺少 token 参数'
            });
        }
        
        const agent = agentAuth.findAgentByToken(token);
        
        if (!agent) {
            return res.json({
                code: 200,
                data: {
                    valid: false,
                    error: '无效 Token'
                }
            });
        }
        
        if (agent.tokenExpiresAt && agent.tokenExpiresAt < Date.now()) {
            return res.json({
                code: 200,
                data: {
                    valid: false,
                    error: 'Token 已过期'
                }
            });
        }
        
        res.json({
            code: 200,
            data: {
                valid: true,
                agentId: agent.id,
                name: agent.name,
                permissions: agent.permissions
            }
        });
    } catch (e) {
        res.status(500).json({
            code: 'INTERNAL_ERROR',
            error: e.message
        });
    }
});

/**
 * GET /api/agents/list
 * 获取 Agent 列表
 */
router.get('/list', (req, res) => {
    try {
        const { status, type } = req.query;
        
        const agents = agentAuth.listAgents({ status, type });
        
        res.json({
            code: 200,
            data: {
                agents,
                total: agents.length
            }
        });
    } catch (e) {
        res.status(500).json({
            code: 'INTERNAL_ERROR',
            error: e.message
        });
    }
});

/**
 * GET /api/agents/health
 * 健康检查 (必须在 /:id 之前注册)
 */
router.get('/health', (req, res) => {
    try {
        const result = agentAuth.checkHealth();
        
        res.json({
            code: 200,
            data: {
                status: result.unhealthy > 0 ? 'degraded' : 'healthy',
                ...result,
                timestamp: Date.now()
            }
        });
    } catch (e) {
        res.status(500).json({
            code: 'INTERNAL_ERROR',
            error: e.message
        });
    }
});

/**
 * GET /api/agents/search
 * 搜索 Agent
 */
router.get('/search', (req, res) => {
    try {
        const { status, type } = req.query;
        
        const agents = agentAuth.listAgents({ status, type });
        
        res.json({
            code: 200,
            data: {
                agents,
                total: agents.length,
                filter: { status, type }
            }
        });
    } catch (e) {
        res.status(500).json({
            code: 'INTERNAL_ERROR',
            error: e.message
        });
    }
});

/**
 * GET /api/agents/:id
 * 获取 Agent 详情
 */
router.get('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const registry = agentAuth.loadRegistry();
        const agent = registry.agents[id];
        
        if (!agent) {
            return res.status(404).json({
                code: 'AGENT_NOT_FOUND',
                error: 'Agent 不存在'
            });
        }
        
        res.json({
            code: 200,
            data: agent
        });
    } catch (e) {
        res.status(500).json({
            code: 'INTERNAL_ERROR',
            error: e.message
        });
    }
});

/**
 * GET /api/agents/:id/capabilities
 * 获取 Agent 能力
 */
router.get('/:id/capabilities', (req, res) => {
    try {
        const { id } = req.params;
        const registry = agentAuth.loadRegistry();
        const agent = registry.agents[id];
        
        if (!agent) {
            return res.status(404).json({
                code: 'AGENT_NOT_FOUND',
                error: 'Agent 不存在'
            });
        }
        
        res.json({
            code: 200,
            data: {
                agentId: id,
                capabilities: agent.capabilities || [],
                permissions: agent.permissions || []
            }
        });
    } catch (e) {
        res.status(500).json({
            code: 'INTERNAL_ERROR',
            error: e.message
        });
    }
});

/**
 * POST /api/agents/offline
 * 标记离线
 */
router.post('/offline', agentAuth.authenticateAgent, (req, res) => {
    try {
        const { agentId } = req.body;
        const registry = agentAuth.loadRegistry();
        
        if (!registry.agents[agentId]) {
            return res.status(404).json({
                code: 'AGENT_NOT_FOUND',
                error: 'Agent 不存在'
            });
        }
        
        registry.agents[agentId].status = 'offline';
        registry.agents[agentId].offlineAt = Date.now();
        
        agentAuth.saveRegistry(registry);
        
        res.json({
            code: 200,
            data: {
                agentId,
                status: 'offline'
            }
        });
    } catch (e) {
        res.status(500).json({
            code: 'INTERNAL_ERROR',
            error: e.message
        });
    }
});

/**
 * POST /api/agents/token/refresh
 * 刷新 Token
 */
router.post('/token/refresh', agentAuth.authenticateAgent, (req, res) => {
    try {
        const agentId = req.agent.id;
        
        const result = agentAuth.refreshToken(agentId);
        
        if (!result) {
            return res.status(404).json({
                code: 'AGENT_NOT_FOUND',
                error: 'Agent 不存在'
            });
        }
        
        res.json({
            code: 200,
            data: result
        });
    } catch (e) {
        res.status(500).json({
            code: 'INTERNAL_ERROR',
            error: e.message
        });
    }
});

/**
 * POST /api/agents/token/invalidate
 * 无效化 Token
 */
router.post('/token/invalidate', agentAuth.authenticateAgent, (req, res) => {
    try {
        const { token } = req.body;
        
        const success = agentAuth.invalidateToken(token);
        
        res.json({
            code: 200,
            data: { success }
        });
    } catch (e) {
        res.status(500).json({
            code: 'INTERNAL_ERROR',
            error: e.message
        });
    }
});

// 兼容旧端点（重定向）
router.post('/auth/register', (req, res) => {
    res.status(301).json({
        code: 'DEPRECATED',
        message: '请使用新端点: POST /api/agents/register'
    });
});

router.post('/auth/verify', (req, res) => {
    res.status(301).json({
        code: 'DEPRECATED',
        message: '请使用新端点: POST /api/agents/verify'
    });
});

module.exports = router;