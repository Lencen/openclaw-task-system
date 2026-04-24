/**
 * Progress Push API 路由
 */

const express = require('express');
const router = express.Router();
const progressPush = require('../middleware/progress-push');

// 获取 WebSocket 客户端列表
router.get('/progress/clients', (req, res) => {
    try {
        const clients = progressPush.getClients();
        
        res.json({
            code: 200,
            data: {
                clients,
                total: clients.length
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

// 推送系统状态
router.post('/progress/status', (req, res) => {
    const { status } = req.body;
    
    if (!status) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必填字段: status'
            }
        });
    }
    
    try {
        progressPush.pushSystemStatus(status);
        
        res.json({
            code: 200,
            data: {
                message: 'System status pushed successfully'
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
            name: 'Progress Push API',
            version: '1.0',
            description: '任务执行进度推送 API',
            endpoints: [
                { method: 'GET', path: '/progress/clients', description: '获取 WebSocket 客户端列表' },
                { method: 'POST', path: '/progress/status', description: '推送系统状态' }
            ],
            websocketEvents: Object.values(progressPush.EVENT_TYPE)
        }
    });
});

module.exports = router;
