/**
 * 任务完成和反思自动化流程主服务
 * 
 * 实现完整的任务完成 → 反思 → 应用 → 完成的流程
 * 
 * @version 1.0.0
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

// 导入必要的模块
const db = require('../src/db');
const EnhancedReflectionProcessor = require('../src/services/enhanced-reflection-processor');
const { processTaskEvolution } = require('../scripts/self-evolution/task-evolution-trigger');

class TaskCompletionAndReflectionService {
    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * 设置中间件
     */
    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
    }

    /**
     * 设置路由
     */
    setupRoutes() {
        // 任务完成处理 - 从 completed 到 reflection_pending
        this.app.post('/api/tasks/:id/complete', async (req, res) => {
            try {
                const { id } = req.params;
                
                // 获取任务
                const task = db.tasks.get(id);
                if (!task) {
                    return res.status(404).json({
                        success: false,
                        error: '任务不存在'
                    });
                }

                // 检查当前状态
                if (task.status !== 'doing' && task.status !== 'assigned') {
                    return res.status(400).json({
                        success: false,
                        error: `无法完成任务，当前状态: ${task.status}`
                    });
                }

                // 更新任务状态为 completed
                const updatedTask = await db.tasks.update(id, {
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    completed_result: req.body.result || '任务完成',
                    last_status_change_at: new Date().toISOString(),
                    status_change_reason: '任务完成，等待反思'
                });

                // 立即触发反思流程
                setTimeout(async () => {
                    try {
                        await this.triggerTaskReflection(id, updatedTask);
                    } catch (error) {
                        console.error(`[TaskService] 触发任务反思失败:`, error);
                    }
                }, 1000); // 延迟1秒以确保数据库更新

                res.json({
                    success: true,
                    message: '任务已标记为完成，反思流程将在后台启动',
                    task: updatedTask
                });

            } catch (error) {
                console.error('[TaskService] 任务完成失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // 任务反思处理 - 启动反思流程
        this.app.post('/api/tasks/:id/reflect', async (req, res) => {
            try {
                const { id } = req.params;
                
                const task = db.tasks.get(id);
                if (!task) {
                    return res.status(404).json({
                        success: false,
                        error: '任务不存在'
                    });
                }

                // 检查任务是否已完成
                if (task.status !== 'completed' && task.status !== 'reflection_pending') {
                    return res.status(400).json({
                        success: false,
                        error: `任务状态不能进行反思: ${task.status}`
                    });
                }

                // 启动反思流程
                const success = await this.triggerTaskReflection(id, task);
                
                if (success) {
                    res.json({
                        success: true,
                        message: '任务反思流程已启动',
                        taskId: id
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: '启动反思流程失败'
                    });
                }

            } catch (error) {
                console.error('[TaskService] 任务反思失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // 获取任务反思状态
        this.app.get('/api/tasks/:id/reflection-status', async (req, res) => {
            try {
                const { id } = req.params;
                
                const task = db.tasks.get(id);
                if (!task) {
                    return res.status(404).json({
                        success: false,
                        error: '任务不存在'
                    });
                }

                const reflection = EnhancedReflectionProcessor.getTaskReflectionStatus(id);
                
                res.json({
                    success: true,
                    data: {
                        taskId: id,
                        taskStatus: task.status,
                        reflectionStatus: task.reflection_status,
                        reflection: reflection
                    }
                });

            } catch (error) {
                console.error('[TaskService] 获取反思状态失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // 标记任务为完成（在反思完成后）
        this.app.post('/api/tasks/:id/mark-done', async (req, res) => {
            try {
                const { id } = req.params;
                
                const task = db.tasks.get(id);
                if (!task) {
                    return res.status(404).json({
                        success: false,
                        error: '任务不存在'
                    });
                }

                // 检查是否已完成反思
                const reflection = EnhancedReflectionProcessor.getTaskReflectionStatus(id);
                
                if (!reflection || (reflection.status !== 'completed' && reflection.status !== 'skipped')) {
                    return res.status(400).json({
                        success: false,
                        error: '任务反思尚未完成，不能标记为 done',
                        currentReflectionStatus: reflection ? reflection.status : 'none'
                    });
                }

                // 更新任务状态为 done
                const updatedTask = await db.tasks.update(id, {
                    status: 'done',
                    reflection_status: 'completed',
                    last_status_change_at: new Date().toISOString(),
                    status_change_reason: '反思完成，任务正式结束'
                });

                res.json({
                    success: true,
                    message: '任务已标记为完成',
                    task: updatedTask
                });

            } catch (error) {
                console.error('[TaskService] 标记任务为完成失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // 批量处理待反思的任务
        this.app.post('/api/tasks/process-pending-reflections', async (req, res) => {
            try {
                // 获取所有状态为 completed 但没有反思记录的任务
                const completedTasks = db.all(
                    'SELECT * FROM tasks WHERE status = ? AND reflection_status IN (?, ?)',
                    ['completed', 'pending', 'not_required']
                );

                const results = {
                    processed: 0,
                    errors: 0,
                    tasks: []
                };

                for (const task of completedTasks) {
                    try {
                        const success = await this.triggerTaskReflection(task.id, task);
                        if (success) {
                            results.processed++;
                            results.tasks.push({ id: task.id, success: true });
                        } else {
                            results.errors++;
                            results.tasks.push({ id: task.id, success: false });
                        }
                    } catch (error) {
                        console.error(`[TaskService] 处理任务反思失败 ${task.id}:`, error);
                        results.errors++;
                        results.tasks.push({ id: task.id, success: false, error: error.message });
                    }
                }

                res.json({
                    success: true,
                    data: results
                });

            } catch (error) {
                console.error('[TaskService] 批量处理反思失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // 获取反思统计
        this.app.get('/api/reflection/stats', async (req, res) => {
            try {
                const stats = EnhancedReflectionProcessor.getReflectionStats();
                
                // 获取任务状态统计
                const taskStats = await db.tasks.getStats();
                
                res.json({
                    success: true,
                    data: {
                        reflectionStats: stats,
                        taskStats: taskStats,
                        summary: {
                            totalTasks: Object.values(taskStats.byStatus).reduce((sum, count) => sum + count, 0),
                            completedTasks: taskStats.byStatus.completed || 0,
                            tasksNeedingReflection: taskStats.byStatus.completed || 0,
                            totalReflections: stats.total || 0,
                            completedReflections: stats.completed || 0
                        }
                    }
                });

            } catch (error) {
                console.error('[TaskService] 获取统计失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
    }

    /**
     * 触发任务反思流程
     */
    async triggerTaskReflection(taskId, task) {
        try {
            console.log(`[TaskService] 触发任务反思: ${taskId}`);
            
            // 更新任务状态为 reflection_pending
            await db.tasks.update(taskId, {
                status: 'reflection_pending',
                reflection_status: 'pending',
                last_status_change_at: new Date().toISOString(),
                status_change_reason: '任务完成，启动反思流程'
            });

            // 启动异步反思处理
            setTimeout(async () => {
                try {
                    // 获取完整的任务信息
                    const fullTask = await this.getFullTask(taskId);
                    
                    // 使用 EnhancedReflectionProcessor 处理反思
                    const success = await EnhancedReflectionProcessor.processCompletedTask(taskId);
                    
                    if (success) {
                        console.log(`[TaskService] ✅ 任务反思处理成功: ${taskId}`);
                        
                        // 检查反思是否完成
                        const reflection = EnhancedReflectionProcessor.getTaskReflectionStatus(taskId);
                        
                        if (reflection && reflection.status === 'completed') {
                            // 反思已完成，可以将任务标记为 done
                            await db.tasks.update(taskId, {
                                reflection_status: 'completed',
                                last_status_change_at: new Date().toISOString(),
                                status_change_reason: '反思完成，等待标记为 done'
                            });
                            
                            console.log(`[TaskService] 任务反思已完成: ${taskId}`);
                        }
                    } else {
                        console.log(`[TaskService] ❌ 任务反思处理失败: ${taskId}`);
                        
                        // 更新状态表示反思失败
                        await db.tasks.update(taskId, {
                            reflection_status: 'failed',
                            last_status_change_at: new Date().toISOString(),
                            status_change_reason: '反思处理失败'
                        });
                    }
                } catch (error) {
                    console.error(`[TaskService] 异步处理任务反思失败 ${taskId}:`, error);
                    
                    // 更新状态表示反思失败
                    try {
                        await db.tasks.update(taskId, {
                            reflection_status: 'failed',
                            last_status_change_at: new Date().toISOString(),
                            status_change_reason: `反思处理异常: ${error.message}`
                        });
                    } catch (updateError) {
                        console.error(`[TaskService] 更新反思失败状态失败:`, updateError);
                    }
                }
            }, 1000); // 延迟1秒执行，避免阻塞当前请求

            return true;
        } catch (error) {
            console.error(`[TaskService] 触发任务反思失败 ${taskId}:`, error);
            return false;
        }
    }

    /**
     * 获取完整任务信息（包括解析JSON字段）
     */
    async getFullTask(taskId) {
        const task = db.tasks.get(taskId);
        if (!task) return null;

        // 辅助函数：安全解析 JSON 字段
        function parseJsonField(value, defaultValue = null) {
            if (value === null || value === undefined) {
                return defaultValue;
            }
            if (typeof value === 'string') {
                try {
                    return JSON.parse(value);
                } catch {
                    return defaultValue;
                }
            }
            return value;
        }

        return {
            ...task,
            analysis: parseJsonField(task.analysis, {}),
            breakdown: parseJsonField(task.breakdown, []),
            execution_log: parseJsonField(task.execution_log, []),
            completed_steps: parseJsonField(task.completed_steps, []),
            issues: parseJsonField(task.issues, []),
            related_docs: parseJsonField(task.related_docs, []),
            test_acceptance: parseJsonField(task.test_acceptance, {}),
            process_validation: parseJsonField(task.process_validation, {}),
            quality_acceptance: parseJsonField(task.quality_acceptance, {}),
            reflection: parseJsonField(task.reflection, {}),
            audit_monitor: parseJsonField(task.audit_monitor, {}),
            tags: parseJsonField(task.tags, [])
        };
    }

    /**
     * 启动服务
     */
    start(port = 8082) {
        this.app.listen(port, () => {
            console.log(`🚀 任务完成和反思自动化服务已启动 - 端口: ${port}`);
            console.log(`   - 任务完成: POST /api/tasks/:id/complete`);
            console.log(`   - 任务反思: POST /api/tasks/:id/reflect`);
            console.log(`   - 反思状态: GET /api/tasks/:id/reflection-status`);
            console.log(`   - 标记完成: POST /api/tasks/:id/mark-done`);
            console.log(`   - 批量处理: POST /api/tasks/process-pending-reflections`);
            console.log(`   - 统计信息: GET /api/reflection/stats`);
        });
    }
}

// 如果直接运行此文件
if (require.main === module) {
    const service = new TaskCompletionAndReflectionService();
    const port = process.env.PORT || 8082;
    service.start(port);
}

module.exports = TaskCompletionAndReflectionService;