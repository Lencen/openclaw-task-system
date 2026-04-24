/**
 * Planning API 路由
 * 提供 Planning 模式的 HTTP API 接口
 */

const express = require('express');
const router = express.Router();
const { PlanningEngine } = require('../../scripts/planning/planning-engine');
const { StepValidator } = require('../../scripts/planning/step-validator');
const { PlanAdjuster } = require('../../scripts/planning/plan-adjuster');

// 实例化
const engine = new PlanningEngine();
const validator = new StepValidator();
const adjuster = new PlanAdjuster();

/**
 * POST /api/planning/generate
 * 生成显式计划
 * 
 * 请求体: { taskId, task }
 * 响应: { code, data: { plan } }
 */
router.post('/generate', (req, res) => {
    try {
        const { taskId, task } = req.body;
        
        if (!task) {
            return res.status(400).json({
                code: 400,
                error: {
                    type: 'ValidationError',
                    message: '缺少必填字段: task'
                }
            });
        }
        
        // 确保任务有 ID
        if (!task.id && taskId) {
            task.id = taskId;
        }
        
        const plan = engine.generatePlan(task);
        
        res.json({
            code: 200,
            data: { plan },
            message: '计划生成成功'
        });
    } catch (err) {
        console.error('[PlanningAPI] 生成计划失败:', err);
        res.status(500).json({
            code: 500,
            error: {
                type: 'InternalError',
                message: err.message
            }
        });
    }
});

/**
 * POST /api/planning/validate-step
 * 验证步骤执行结果
 * 
 * 请求体: { step, result }
 * 响应: { code, data: { validation } }
 */
router.post('/validate-step', (req, res) => {
    try {
        const { step, result } = req.body;
        
        if (!step) {
            return res.status(400).json({
                code: 400,
                error: {
                    type: 'ValidationError',
                    message: '缺少必填字段: step'
                }
            });
        }
        
        const validation = validator.validate(step, result || {});
        
        res.json({
            code: 200,
            data: { validation },
            message: validation.status === 'valid' ? '验证通过' : '验证发现问题'
        });
    } catch (err) {
        console.error('[PlanningAPI] 验证步骤失败:', err);
        res.status(500).json({
            code: 500,
            error: {
                type: 'InternalError',
                message: err.message
            }
        });
    }
});

/**
 * POST /api/planning/analyze-failure
 * 分析步骤失败原因
 * 
 * 请求体: { step, error }
 * 响应: { code, data: { analysis } }
 */
router.post('/analyze-failure', (req, res) => {
    try {
        const { step, error } = req.body;
        
        if (!step) {
            return res.status(400).json({
                code: 400,
                error: {
                    type: 'ValidationError',
                    message: '缺少必填字段: step'
                }
            });
        }
        
        const errorObj = typeof error === 'string' ? new Error(error) : (error || new Error('Unknown error'));
        const analysis = adjuster.analyzeFailure(step, errorObj);
        
        res.json({
            code: 200,
            data: { analysis },
            message: '分析完成'
        });
    } catch (err) {
        console.error('[PlanningAPI] 分析失败原因出错:', err);
        res.status(500).json({
            code: 500,
            error: {
                type: 'InternalError',
                message: err.message
            }
        });
    }
});

/**
 * POST /api/planning/adjust
 * 调整计划
 * 
 * 请求体: { taskId, failedStepIndex, recovery }
 * 响应: { code, data: { adjustedPlan } }
 */
router.post('/adjust', (req, res) => {
    try {
        const { task, failedStepIndex, recovery } = req.body;
        
        if (!task || failedStepIndex === undefined || !recovery) {
            return res.status(400).json({
                code: 400,
                error: {
                    type: 'ValidationError',
                    message: '缺少必填字段: task, failedStepIndex, recovery'
                }
            });
        }
        
        const adjustedPlan = adjuster.adjustSteps(task, failedStepIndex, recovery);
        
        res.json({
            code: 200,
            data: { adjustedPlan },
            message: '计划调整成功'
        });
    } catch (err) {
        console.error('[PlanningAPI] 调整计划失败:', err);
        res.status(500).json({
            code: 500,
            error: {
                type: 'InternalError',
                message: err.message
            }
        });
    }
});

/**
 * POST /api/planning/recover
 * 生成恢复方案
 * 
 * 请求体: { analysis, task }
 * 响应: { code, data: { recovery } }
 */
router.post('/recover', (req, res) => {
    try {
        const { analysis, task } = req.body;
        
        if (!analysis || !task) {
            return res.status(400).json({
                code: 400,
                error: {
                    type: 'ValidationError',
                    message: '缺少必填字段: analysis, task'
                }
            });
        }
        
        const recovery = adjuster.generateRecovery(analysis, task);
        
        res.json({
            code: 200,
            data: { recovery },
            message: '恢复方案生成成功'
        });
    } catch (err) {
        console.error('[PlanningAPI] 生成恢复方案失败:', err);
        res.status(500).json({
            code: 500,
            error: {
                type: 'InternalError',
                message: err.message
            }
        });
    }
});

/**
 * GET /api/planning/status/:taskId
 * 获取计划状态
 */
router.get('/status/:taskId', (req, res) => {
    try {
        const { taskId } = req.params;
        const planId = `plan-${taskId}`;
        const plan = engine.getPlan(planId);
        
        if (!plan) {
            return res.status(404).json({
                code: 404,
                error: {
                    type: 'NotFoundError',
                    message: '计划不存在'
                }
            });
        }
        
        const status = {
            planId: plan.id,
            taskId: plan.taskId,
            taskTitle: plan.taskTitle,
            totalSteps: plan.steps.length,
            currentStep: plan.currentStep,
            progress: Math.round((plan.currentStep / plan.steps.length) * 100),
            status: plan.status,
            estimatedTime: plan.estimatedTime,
            risks: plan.risks,
            createdAt: plan.createdAt,
            updatedAt: plan.updatedAt
        };
        
        res.json({
            code: 200,
            data: { status },
            message: '获取成功'
        });
    } catch (err) {
        console.error('[PlanningAPI] 获取计划状态失败:', err);
        res.status(500).json({
            code: 500,
            error: {
                type: 'InternalError',
                message: err.message
            }
        });
    }
});

/**
 * GET /api/planning/active
 * 获取活跃计划列表
 */
router.get('/active', (req, res) => {
    try {
        const activePlans = engine.getActivePlans();
        
        res.json({
            code: 200,
            data: {
                plans: activePlans,
                count: activePlans.length
            },
            message: '获取成功'
        });
    } catch (err) {
        console.error('[PlanningAPI] 获取活跃计划失败:', err);
        res.status(500).json({
            code: 500,
            error: {
                type: 'InternalError',
                message: err.message
            }
        });
    }
});

/**
 * GET /api/planning/stats
 * 获取规划统计
 */
router.get('/stats', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const planningStats = engine.getStats(days);
        const validationStats = validator.getStats(days);
        const adjustmentStats = adjuster.getStats(days);
        
        res.json({
            code: 200,
            data: {
                planning: planningStats,
                validation: validationStats,
                adjustment: adjustmentStats,
                period: `${days} days`
            },
            message: '获取成功'
        });
    } catch (err) {
        console.error('[PlanningAPI] 获取统计失败:', err);
        res.status(500).json({
            code: 500,
            error: {
                type: 'InternalError',
                message: err.message
            }
        });
    }
});

/**
 * POST /api/planning/execute
 * 执行计划（带验证）
 * 
 * 请求体: { task, planId }
 * 响应: { code, data: { execution } }
 */
router.post('/execute', async (req, res) => {
    try {
        const { task, planId } = req.body;
        
        if (!task) {
            return res.status(400).json({
                code: 400,
                error: {
                    type: 'ValidationError',
                    message: '缺少必填字段: task'
                }
            });
        }
        
        // 获取或生成计划
        let plan = planId ? engine.getPlan(planId) : null;
        if (!plan) {
            plan = engine.generatePlan(task);
        }
        
        // 异步执行计划
        engine.executeWithValidation(task, plan)
            .then(execution => {
                console.log(`[PlanningAPI] 计划执行完成: ${execution.finalStatus}`);
            })
            .catch(err => {
                console.error(`[PlanningAPI] 计划执行失败:`, err);
            });
        
        res.json({
            code: 200,
            data: {
                planId: plan.id,
                status: 'started',
                message: '计划执行已开始'
            }
        });
    } catch (err) {
        console.error('[PlanningAPI] 启动执行失败:', err);
        res.status(500).json({
            code: 500,
            error: {
                type: 'InternalError',
                message: err.message
            }
        });
    }
});

module.exports = router;