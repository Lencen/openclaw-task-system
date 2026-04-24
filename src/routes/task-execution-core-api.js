/**
 * Task Execution Core API 路由
 */

const express = require('express');
const router = express.Router();
const executionCore = require('../middleware/task-execution-core');
const path = require('path');
const { spawn } = require('child_process');

/**
 * 触发任务级自我进化（带节流）
 * @param {Object} task - 任务对象
 */
const evolutionThrottle = {
    lastTrigger: {},
    minInterval: 5 * 60 * 1000 // 5分钟
};

function triggerTaskEvolution(task) {
    try {
        // 节流检查：同一类任务5分钟内只进化一次
        const category = categorizeTaskSimple(task.title || '');
        const now = Date.now();
        const lastTime = evolutionThrottle.lastTrigger[category] || 0;
        
        if (now - lastTime < evolutionThrottle.minInterval) {
            console.log(`[Evolution] 节流跳过: ${category} 类任务，距上次进化 ${Math.round((now - lastTime) / 1000)} 秒`);
            return;
        }
        
        evolutionThrottle.lastTrigger[category] = now;
        
        const evolutionScript = path.join(__dirname, '../scripts/self-evolution/task-evolution-trigger.js');
        
        // 异步触发进化，不阻塞响应
        const child = spawn('node', [evolutionScript, JSON.stringify(task)], {
            detached: true,
            stdio: 'ignore'
        });
        
        child.unref();
        
        console.log(`[Evolution] 已触发任务 ${task.id} 的自我进化 (${category})`);
    } catch (err) {
        console.error('[Evolution] 触发进化失败:', err.message);
    }
}

/**
 * 简单任务分类（用于节流）
 */
function categorizeTaskSimple(title) {
    if (/开发|实现|编写|创建|添加|修改|重构/i.test(title)) return 'development';
    if (/修复|解决|调试|排查|bug|错误/i.test(title)) return 'bugfix';
    if (/优化|改进|提升|加速/i.test(title)) return 'optimization';
    if (/文档|说明|README/i.test(title)) return 'documentation';
    if (/测试|验证|检查/i.test(title)) return 'testing';
    if (/配置|设置|部署|安装/i.test(title)) return 'configuration';
    return 'other';
}

/**
 * POST /api/task-execution/analysis
 * Agent 提交任务分析结果
 * 请求体: { taskId, analysis, suggestedBreakdown }
 */
router.post('/analysis', (req, res) => {
    const { taskId, analysis, suggestedBreakdown } = req.body;
    
    if (!taskId || !analysis) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必填字段: taskId, analysis'
            }
        });
    }
    
    let result = executionCore.submitAnalysis(taskId, analysis);
    
    // 如果提供了 suggestedBreakdown，自动调用 breakdown 接口
    if (suggestedBreakdown && Array.isArray(suggestedBreakdown) && suggestedBreakdown.length > 0) {
        let breakdownResult = executionCore.submitBreakdown(taskId, suggestedBreakdown);
        result.data.suggestedBreakdown = {
            processed: true,
            result: breakdownResult
        };
    }
    
    res.json(result);
});

/**
 * POST /api/task-execution/breakdown
 * Agent 提交任务分解
 * 请求体: { taskId, breakdown }
 */
router.post('/breakdown', (req, res) => {
    const { taskId, breakdown } = req.body;
    
    if (!taskId || !breakdown) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必填字段: taskId, breakdown'
            }
        });
    }
    
    const result = executionCore.submitBreakdown(taskId, breakdown);
    res.json(result);
});

/**
 * POST /api/task-execution/step
 * Agent 完成步骤并报告结果
 * 请求体: { taskId, stepIndex, status, result, output }
 * status: 'completed' | 'failed' | 'skipped'
 */
router.post('/step', (req, res) => {
    const { taskId, stepIndex, status, result, output = {} } = req.body;
    
    if (!taskId || stepIndex === undefined || !status || !result) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必填字段: taskId, stepIndex, status, result'
            }
        });
    }
    
    let completeResult;
    
    // 根据 status 调用不同的方法
    if (status === 'completed') {
        completeResult = executionCore.completeStep(taskId, stepIndex, result, output);
    } else if (status === 'failed' || status === 'interrupted' || status === 'skipped') {
        // 失败、中断或跳过的步骤标记为 cancelled
        completeResult = executionCore.cancelStep(taskId, stepIndex, `步骤 ${status}`, result.agentId, result.agentName || 'Unknown');
    } else {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: 'status 必须是 completed, failed, interrupted 或 skipped'
            }
        });
    }
    
    res.json(completeResult);
});

/**
 * POST /api/task-execution/step/start
 * Agent 开始执行步骤
 * 请求体: { taskId, stepIndex, agentId, agentName, context }
 */
router.post('/step/start', (req, res) => {
    const { taskId, stepIndex, agentId, agentName = 'Unknown', context = {} } = req.body;
    
    if (!taskId || stepIndex === undefined || !agentId) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必填字段: taskId, stepIndex, agentId'
            }
        });
    }
    
    const result = executionCore.startStep(taskId, stepIndex, agentId, agentName, context);
    res.json(result);
});

/**
 * POST /api/task-execution/complete
 * Agent 完成整个任务
 * 请求体: { taskId, result, output }
 */
router.post('/complete', (req, res) => {
    const { taskId, result, output = {} } = req.body;
    
    if (!taskId || !result) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必填字段: taskId, result'
            }
        });
    }
    
    const resultObj = executionCore.completeTask(taskId, result, output);
    
    // 触发任务级自我进化
    if (resultObj.success && resultObj.task) {
        triggerTaskEvolution(resultObj.task);
    }
    
    res.json(resultObj);
});

/**
 * POST /api/task-execution/step/cancel
 * Agent 取消执行步骤
 * 请求体: { taskId, stepIndex, reason, agentId, agentName }
 */
router.post('/step/cancel', (req, res) => {
    const { taskId, stepIndex, reason, agentId, agentName = 'Unknown' } = req.body;
    
    if (!taskId || stepIndex === undefined || !agentId || !reason) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必填字段: taskId, stepIndex, agentId, reason'
            }
        });
    }
    
    const result = executionCore.cancelStep(taskId, stepIndex, reason, agentId, agentName);
    res.json(result);
});

/**
 * GET /api/task-execution/history/:taskId
 * 获取任务执行历史
 */
router.get('/history/:taskId', (req, res) => {
    const { taskId } = req.params;
    
    const result = executionCore.getExecutionHistory(taskId);
    res.json(result);
});

/**
 * GET /api/task-execution
 * API 说明
 */
router.get('/', (req, res) => {
    res.json({
        code: 200,
        data: {
            name: 'Task Execution Core API',
            version: '1.0',
            description: '任务执行核心接口',
            endpoints: [
                { method: 'POST', path: '/api/task-execution/analysis', description: '提交任务分析结果' },
                { method: 'POST', path: '/api/task-execution/breakdown', description: '提交任务拆解结果' },
                { method: 'POST', path: '/api/task-execution/step', description: '提交步骤执行结果' },
                { method: 'POST', path: '/api/task-execution/step/start', description: '开始执行步骤' },
                { method: 'POST', path: '/api/task-execution/complete', description: '完成整个任务' },
                { method: 'POST', path: '/api/task-execution/step/cancel', description: '取消执行步骤' },
                { method: 'GET', path: '/api/task-execution/history/:taskId', description: '获取任务执行历史' }
            ]
        }
    });
});

module.exports = router;
