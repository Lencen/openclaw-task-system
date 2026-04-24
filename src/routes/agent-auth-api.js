/**
 * Agent 认证 API 路由
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// 注册新 Agent
router.post('/register', (req, res) => {
    const { name, description = '' } = req.body;
    
    if (!name) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必填字段: name'
            }
        });
    }
    
    try {
        const result = auth.registerAgent(name, description);
        
        res.json({
            code: 200,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            error: {
                type: 'SystemError',
                message: error.message
            }
        });
    }
});

// 验证 Token
router.post('/verify', (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必填字段: token'
            }
        });
    }
    
    try {
        const result = auth.verifyToken(token);
        
        res.json({
            code: result.valid ? 200 : 401,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            error: {
                type: 'SystemError',
                message: error.message
            }
        });
    }
});

// 获取 Agent 列表
router.get('/agents', (req, res) => {
    try {
        const agents = auth.listAgents();
        
        res.json({
            code: 200,
            data: {
                agents,
                total: agents.length
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            error: {
                type: 'SystemError',
                message: error.message
            }
        });
    }
});

// 获取 Agent 详情
router.get('/agents/:agentId', (req, res) => {
    const { agentId } = req.params;
    
    try {
        const agent = auth.getAgent(agentId);
        
        if (!agent) {
            return res.status(404).json({
                code: 404,
                error: {
                    type: 'NotFoundError',
                    message: 'Agent 不存在'
                }
            });
        }
        
        res.json({
            code: 200,
            data: agent
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            error: {
                type: 'SystemError',
                message: error.message
            }
        });
    }
});

// 无效化 Token
router.post('/invalidate', (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必填字段: token'
            }
        });
    }
    
    try {
        const result = auth.invalidateToken(token);
        
        res.json({
            code: result.success ? 200 : 404,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            error: {
                type: 'SystemError',
                message: error.message
            }
        });
    }
});

// 生成新 Token (为现有 Agent)
router.post('/token', (req, res) => {
    const { agentId } = req.body;
    
    if (!agentId) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必填字段: agentId'
            }
        });
    }
    
    try {
        const agent = auth.getAgent(agentId);
        
        if (!agent) {
            return res.status(404).json({
                code: 404,
                error: {
                    type: 'NotFoundError',
                    message: 'Agent 不存在'
                }
            });
        }
        
        const token = auth.addToken(agentId, auth.generateToken());
        
        res.json({
            code: 200,
            data: {
                agentId,
                token: token.token,
                expiresAt: token.expiresAt
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            error: {
                type: 'SystemError',
                message: error.message
            }
        });
    }
});

// 初始化默认 Agent
router.post('/init', (req, res) => {
    try {
        auth.initDefaultAgents();
        
        res.json({
            code: 200,
            data: {
                message: '默认 Agent 初始化完成'
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            error: {
                type: 'SystemError',
                message: error.message
            }
        });
    }
});

// API 说明
router.get('/', (req, res) => {
    res.json({
        code: 200,
        data: {
            name: 'Agent Auth API',
            version: '1.0',
            description: 'Agent 身份认证 API',
            endpoints: [
                { method: 'POST', path: '/auth/register', description: '注册新 Agent' },
                { method: 'POST', path: '/auth/verify', description: '验证 Token' },
                { method: 'GET', path: '/auth/agents', description: '获取 Agent 列表' },
                { method: 'GET', path: '/auth/agents/:agentId', description: '获取 Agent 详情' },
                { method: 'POST', path: '/auth/invalidate', description: '无效化 Token' },
                { method: 'POST', path: '/auth/token', description: '生成新 Token' },
                { method: 'POST', path: '/auth/init', description: '初始化默认 Agent' }
            ]
        }
    });
});

module.exports = router;
