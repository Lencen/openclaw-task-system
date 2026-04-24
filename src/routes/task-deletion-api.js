/**
 * Task Deletion API 路由
 * 
 * 提供任务删除、回收站、恢复等 API
 */

const express = require('express');
const router = express.Router();
const taskDeletionCore = require('../middleware/task-deletion-core');
const db = require('../db');

/**
 * DELETE /api/tasks/:taskId
 * 软删除任务
 * 
 * 请求体: { deletedBy, reason, version }
 */
router.delete('/tasks/:taskId', (req, res) => {
    const { taskId } = req.params;
    const { deletedBy, reason, version } = req.body;
    
    const result = taskDeletionCore.deleteTask(taskId, {
        deletedBy: deletedBy || req.headers['x-agent-id'] || 'api',
        reason,
        version
    });
    
    res.status(result.code === 200 ? 200 : result.code).json(result);
});

/**
 * GET /api/tasks/trash
 * 获取回收站列表
 * 
 * 查询参数: page, limit, deletedBy
 */
router.get('/tasks/trash', (req, res) => {
    const { page, limit, deletedBy } = req.query;
    
    const result = taskDeletionCore.getTrashList({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        deletedBy
    });
    
    res.json(result);
});

/**
 * POST /api/tasks/:taskId/restore
 * 从回收站恢复任务
 * 
 * 请求体: { restoredBy }
 */
router.post('/tasks/:taskId/restore', (req, res) => {
    const { taskId } = req.params;
    const { restoredBy } = req.body;
    
    const result = taskDeletionCore.restoreTask(taskId, {
        restoredBy: restoredBy || req.headers['x-agent-id'] || 'api'
    });
    
    res.status(result.code === 200 ? 200 : result.code).json(result);
});

/**
 * DELETE /api/tasks/:taskId/permanent
 * 永久删除任务（从回收站彻底删除）
 * 
 * 请求体: { deletedBy }
 */
router.delete('/tasks/:taskId/permanent', (req, res) => {
    const { taskId } = req.params;
    const { deletedBy } = req.body;
    
    const result = taskDeletionCore.permanentDelete(taskId, {
        deletedBy: deletedBy || req.headers['x-agent-id'] || 'api'
    });
    
    res.status(result.code === 200 ? 200 : result.code).json(result);
});

/**
 * POST /api/tasks/trash/empty
 * 清空回收站（删除超过指定天数的任务）
 * 
 * 请求体: { days }
 */
router.post('/tasks/trash/empty', (req, res) => {
    const { days = 30 } = req.body;
    
    const result = taskDeletionCore.emptyTrash({ days });
    
    res.json(result);
});

/**
 * GET /api/tasks/:taskId/deletable
 * 检查任务是否可删除
 */
router.get('/tasks/:taskId/deletable', (req, res) => {
    const { taskId } = req.params;
    
    try {
        const task = db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
        
        if (!task) {
            return res.status(404).json({
                code: 404,
                error: {
                    type: 'NotFoundError',
                    message: '任务不存在'
                }
            });
        }
        
        const checkResult = taskDeletionCore.checkDeletable(task);
        
        res.json({
            code: 200,
            data: {
                taskId,
                deletable: checkResult.deletable,
                reason: checkResult.reason || null,
                currentStatus: task.status
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

/**
 * GET /api/tasks/deletion-logs
 * 获取删除日志
 * 
 * 查询参数: taskId, action, page, limit
 */
router.get('/tasks/deletion-logs', (req, res) => {
    const { taskId, action, page, limit } = req.query;
    
    const result = taskDeletionCore.getDeletionLogs({
        taskId,
        action,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50
    });
    
    res.json(result);
});

/**
 * GET /api/tasks/deletion-logs/:taskId
 * 获取指定任务的删除日志
 */
router.get('/tasks/deletion-logs/:taskId', (req, res) => {
    const { taskId } = req.params;
    
    const result = taskDeletionCore.getDeletionLogs({ taskId });
    
    res.json(result);
});

/**
 * API 说明
 */
router.get('/', (req, res) => {
    res.json({
        code: 200,
        data: {
            name: 'Task Deletion API',
            version: '1.0',
            description: '任务删除、回收站、恢复等功能 API',
            endpoints: [
                { method: 'DELETE', path: '/api/tasks/:taskId', description: '软删除任务' },
                { method: 'GET', path: '/api/tasks/trash', description: '获取回收站列表' },
                { method: 'POST', path: '/api/tasks/:taskId/restore', description: '从回收站恢复任务' },
                { method: 'DELETE', path: '/api/tasks/:taskId/permanent', description: '永久删除任务' },
                { method: 'POST', path: '/api/tasks/trash/empty', description: '清空回收站' },
                { method: 'GET', path: '/api/tasks/:taskId/deletable', description: '检查任务是否可删除' },
                { method: 'GET', path: '/api/tasks/deletion-logs', description: '获取删除日志列表' },
                { method: 'GET', path: '/api/tasks/deletion-logs/:taskId', description: '获取指定任务的删除日志' }
            ]
        }
    });
});

module.exports = router;