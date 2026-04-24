/**
 * Task Execution Core API - 错误码集成版本
 * 
 * 重写核心 API 以集成统一错误码处理
 * 集成 WebSocket 实时推送通知
 * 
 * 2026-03-27: 迁移到 SQLite，使用 DAL
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const errors = require('./task-execution-errors');
const db = require('../db');

// WebSocket 推送模块引用
let progressPush = null;
try {
    progressPush = require('./progress-push');
    console.log('[TaskExecutionCore] WebSocket push module loaded');
} catch (err) {
    console.warn('[TaskExecutionCore] WebSocket push module not available:', err.message);
}

const DATA_DIR = path.join(__dirname, '../data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const EXECUTIONS_DIR = path.join(DATA_DIR, 'executions');
const LOGS_FILE = path.join(DATA_DIR, 'task-execution-logs.json');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(EXECUTIONS_DIR)) fs.mkdirSync(EXECUTIONS_DIR, { recursive: true });
if (!fs.existsSync(LOGS_FILE)) fs.writeFileSync(LOGS_FILE, JSON.stringify([], null, 2));

/**
 * 生成日志 ID
 */
function generateLogId() {
    return `log-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * 生成执行 ID
 */
function generateExecutionId() {
    return `ex-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * 记录操作日志
 */
function logOperation(taskId, actor, actorId, action, details, metadata = {}) {
    const log = {
        logId: generateLogId(),
        taskId,
        timestamp: new Date().toISOString(),
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        actor,
        actorId,
        action,
        details,
        metadata
    };
    
    // 写入全局日志文件
    try {
        const logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
        logs.push(log);
        if (logs.length > 10000) logs.splice(0, logs.length - 10000);
        fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
    } catch (error) {
        console.error('记录日志失败:', error.message);
    }
    
    // 同时写入任务的 execution_log（使用 DAL）
    try {
        const task = db.tasks.get(taskId);
        if (task) {
            const executionLog = task.execution_log || [];
            // 简化日志格式
            executionLog.push({
                time: log.time,
                action: action.toUpperCase(),
                detail: typeof details === 'string' ? details : details.stepDescription || details.summary || JSON.stringify(details),
                agent: actorId || actor
            });
            // 限制日志条数
            if (executionLog.length > 100) {
                executionLog = executionLog.slice(-100);
            }
            db.tasks.update(taskId, { execution_log: executionLog });
        }
    } catch (error) {
        console.error('写入任务执行日志失败:', error.message);
    }
    
    return log;
}

/**
 * 读取任务（使用 DAL）
 */
function readTask(taskId) {
    try {
        return db.tasks.get(taskId);
    } catch {
        return null;
    }
}

/**
 * 更新任务（使用 DAL）
 */
function updateTask(taskId, updates) {
    try {
        db.tasks.update(taskId, {
            ...updates,
            lastModified: new Date().toISOString()
        });
        return db.tasks.get(taskId);
    } catch (error) {
        console.error('更新任务失败:', error.message);
        return null;
    }
}

/**
 * 提交任务分析结果
 */
function submitAnalysis(taskId, analysis) {
    const task = readTask(taskId);
    
    if (!task) {
        return errors.createErrorResponse('TASK_NOT_FOUND', { taskId });
    }
    
    // 验证分析结果
    if (!analysis.thought || !analysis.conclusion) {
        return errors.createErrorResponse('ANALYSIS_REQUIRED_FIELD', { 
            missingFields: analysis.thought ? ['conclusion'] : ['thought']
        });
    }
    
    // 更新任务
    const updatedTask = updateTask(taskId, {
        analysis,
        status: 'pending'
    });
    
    // 记录日志
    logOperation(taskId, 'system', 'system', 'submit_analysis', { analysis });
    
    return {
        code: 200,
        data: {
            updated: true,
            task: updatedTask
        }
    };
}

/**
 * 提交任务拆解结果
 */
function submitBreakdown(taskId, breakdown) {
    const task = readTask(taskId);
    
    if (!task) {
        return errors.createErrorResponse('TASK_NOT_FOUND', { taskId });
    }
    
    // 验证拆解结果
    if (!Array.isArray(breakdown) || breakdown.length === 0) {
        return errors.createErrorResponse('VALIDATION_ARRAY_EMPTY', { 
            field: 'breakdown' 
        });
    }
    
    // 验证每个步骤
    for (let i = 0; i < breakdown.length; i++) {
        const step = breakdown[i];
        if (!step.step || !step.description) {
            return errors.createErrorResponse('BREAKDOWN_REQUIRED_FIELD', { 
                stepIndex: i,
                missingFields: step.step ? ['description'] : ['step']
            });
        }
        
        // 默认步骤状态
        if (!step.status) {
            step.status = 'pending';
        }
        if (!step.priority) {
            step.priority = 'P0';
        }
    }
    
    // 更新任务
    const updatedTask = updateTask(taskId, {
        breakdown,
        total_steps: breakdown.length,
        completed_steps: 0,
        current_step: 0,
        status: 'pending'
    });
    
    // 记录日志
    logOperation(taskId, 'system', 'system', 'submit_breakdown', { breakdown });
    
    return {
        code: 200,
        data: {
            updated: true,
            task: updatedTask,
            totalSteps: breakdown.length
        }
    };
}

/**
 * 提交步骤执行结果
 */
function completeStep(taskId, stepIndex, result, output = {}) {
    const task = readTask(taskId);
    
    if (!task) {
        return errors.createErrorResponse('TASK_NOT_FOUND', { taskId });
    }
    
    // 验证步骤索引
    if (!task.breakdown || stepIndex < 0 || stepIndex >= task.breakdown.length) {
        return errors.createErrorResponse('STEP_INVALID_INDEX', { 
            stepIndex, 
            taskId,
            totalSteps: task.breakdown?.length || 0 
        });
    }
    
    // 检查步骤是否正在进行
    const step = task.breakdown[stepIndex];
    if (step.status !== 'running') {
        return errors.createErrorResponse('STEP_NOT_RUNNING', {
            stepIndex,
            currentStatus: step.status,
            taskId
        });
    }
    
    // 更新步骤状态
    task.breakdown[stepIndex] = {
        ...step,
        status: 'completed',
        completed_at: new Date().toISOString(),
        result,
        output
    };
    
    // 更新任务统计
    const completedSteps = task.breakdown.filter(s => s.status === 'completed').length;
    const progress = Math.round((completedSteps / task.total_steps) * 100);
    
    const updatedTask = updateTask(taskId, {
        breakdown: task.breakdown,
        completed_steps: completedSteps,
        current_step: stepIndex + 1,
        progress,
        status: completedSteps === task.total_steps ? 'completed' : 'pending'
    });
    
    // 记录日志
    logOperation(taskId, 'agent', result.agentId || 'system', 'complete_step', {
        stepIndex,
        stepDescription: step.description,
        result,
        output
    });
    
    // WebSocket 实时推送步骤完成通知
    if (progressPush) {
        try {
            progressPush.pushStepCompleted(taskId, result.agentId || 'system', stepIndex, step.description, output);
            progressPush.pushStepProgress(taskId, result.agentId || 'system', stepIndex + 1, step.description, progress);
            console.log(`[TaskExecutionCore] WebSocket push: step ${stepIndex} completed, progress ${progress}%`);
        } catch (err) {
            console.warn('[TaskExecutionCore] WebSocket push failed:', err.message);
        }
    }
    
    return {
        code: 200,
        data: {
            updated: true,
            task: updatedTask,
            currentStep: stepIndex + 1,
            progress
        }
    };
}

/**
 * 开始执行步骤
 */
function startStep(taskId, stepIndex, agentId, agentName, context = {}) {
    const task = readTask(taskId);
    
    if (!task) {
        return errors.createErrorResponse('TASK_NOT_FOUND', { taskId });
    }
    
    // 验证步骤索引
    if (!task.breakdown || stepIndex < 0 || stepIndex >= task.breakdown.length) {
        return errors.createErrorResponse('STEP_INVALID_INDEX', {
            stepIndex,
            taskId,
            totalSteps: task.breakdown?.length || 0
        });
    }
    
    // 检查步骤状态
    const step = task.breakdown[stepIndex];
    if (step.status !== 'pending') {
        return errors.createErrorResponse('STEP_NOT_PENDING', {
            stepIndex,
            currentStatus: step.status,
            taskId
        });
    }
    
    // 更新步骤状态
    task.breakdown[stepIndex] = {
        ...step,
        status: 'running',
        started_at: new Date().toISOString(),
        started_by: agentId,
        started_by_name: agentName
    };
    
    // 更新任务
    const updatedTask = updateTask(taskId, {
        breakdown: task.breakdown,
        current_step: stepIndex,
        status: 'doing'
    });
    
    // 记录日志
    logOperation(taskId, 'agent', agentId, 'start_step', {
        stepIndex,
        stepDescription: step.description,
        context
    });
    
    // WebSocket 实时推送步骤开始通知
    if (progressPush) {
        try {
            // 如果是第一个步骤，推送任务开始通知
            if (stepIndex === 0) {
                progressPush.pushTaskStarted(taskId, agentId, agentName);
            }
            progressPush.pushStepProgress(taskId, agentId, stepIndex, step.description, 0);
            console.log(`[TaskExecutionCore] WebSocket push: step ${stepIndex} started by ${agentId}`);
        } catch (err) {
            console.warn('[TaskExecutionCore] WebSocket push failed:', err.message);
        }
    }
    
    // 发送任务开始通知（第一个步骤开始时）
    if (stepIndex === 0) {
        try {
            const notificationsFile = path.join(DATA_DIR, 'notifications.json');
            if (fs.existsSync(notificationsFile)) {
                const notificationsData = JSON.parse(fs.readFileSync(notificationsFile, 'utf8'));
                const notification = {
                    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
                    type: 'TASK_STARTED',
                    from: agentId,
                    to: 'all',
                    timestamp: new Date().toISOString(),
                    title: `🚀 任务开始: ${task.title}`,
                    content: {
                        taskId,
                        taskTitle: task.title,
                        startedBy: agentName,
                        totalSteps: task.total_steps
                    },
                    priority: 2,
                    read: false,
                    readAt: null
                };
                notificationsData.notifications = notificationsData.notifications || [];
                notificationsData.notifications.unshift(notification);
                if (notificationsData.notifications.length > 1000) {
                    notificationsData.notifications = notificationsData.notifications.slice(0, 1000);
                }
                fs.writeFileSync(notificationsFile, JSON.stringify(notificationsData, null, 2));
                console.log(`[TaskExecutionCore] TASK_STARTED notification sent for task ${taskId}`);
            }
        } catch (notifErr) {
            console.warn('[TaskExecutionCore] Failed to send notification:', notifErr.message);
        }
    }
    
    return {
        code: 200,
        data: {
            updated: true,
            task: updatedTask,
            step: task.breakdown[stepIndex]
        }
    };
}

/**
 * 完成整个任务
 */
function completeTask(taskId, result, output = {}) {
    const task = readTask(taskId);
    
    if (!task) {
        return errors.createErrorResponse('TASK_NOT_FOUND', { taskId });
    }
    
    // 检查是否有未完成的步骤
    const pendingSteps = task.breakdown?.filter(s => s.status !== 'completed');
    if (pendingSteps?.length > 0) {
        return errors.createErrorResponse('TASK_INVALID_STATUS', {
            taskId,
            pendingSteps: pendingSteps.length
        });
    }
    
    // 更新任务
    const updates = {
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: result.agentId || 'system',
        completed_by_name: result.agentName || 'Unknown',
        result,
        output,
        progress: 100
    };
    
    // 同步 related_docs
    if (output.related_docs && Array.isArray(output.related_docs)) {
        updates.related_docs = output.related_docs;
    }
    
    // 同步 test_acceptance
    if (output.test_acceptance) {
        updates.test_acceptance = {
            ...task.test_acceptance,
            ...output.test_acceptance,
            result: output.test_results || output.test_acceptance?.result || '验证通过'
        };
    } else if (output.test_results) {
        updates.test_acceptance = {
            ...task.test_acceptance,
            result: output.test_results
        };
    }
    
    const updatedTask = updateTask(taskId, updates);
    
    // 记录日志
    logOperation(taskId, 'agent', result.agentId || 'system', 'complete_task', {
        result,
        output
    });
    
    // WebSocket 实时推送任务完成通知
    if (progressPush) {
        try {
            const metrics = {
                totalSteps: task.total_steps,
                completedSteps: task.completed_steps,
                duration: task.started_at ? Date.now() - new Date(task.started_at).getTime() : 0
            };
            progressPush.pushTaskCompleted(taskId, result.agentId || 'system', result.agentName || 'Unknown', output, metrics);
            console.log(`[TaskExecutionCore] WebSocket push: task ${taskId} completed by ${result.agentId || 'system'}`);
        } catch (err) {
            console.warn('[TaskExecutionCore] WebSocket push failed:', err.message);
        }
    }
    
    // 发送通知到通知系统
    try {
        const notificationsFile = path.join(DATA_DIR, 'notifications.json');
        if (fs.existsSync(notificationsFile)) {
            const notificationsData = JSON.parse(fs.readFileSync(notificationsFile, 'utf8'));
            const notification = {
                id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
                type: 'TASK_COMPLETED',
                from: result.agentId || 'system',
                to: 'all',
                timestamp: new Date().toISOString(),
                title: `✅ 任务完成: ${task.title}`,
                content: {
                    taskId,
                    taskTitle: task.title,
                    completedBy: result.agentName || 'Unknown',
                    output
                },
                priority: 1,
                read: false,
                readAt: null
            };
            notificationsData.notifications = notificationsData.notifications || [];
            notificationsData.notifications.unshift(notification);
            if (notificationsData.notifications.length > 1000) {
                notificationsData.notifications = notificationsData.notifications.slice(0, 1000);
            }
            fs.writeFileSync(notificationsFile, JSON.stringify(notificationsData, null, 2));
            console.log(`[TaskExecutionCore] Notification sent for task ${taskId}`);
        }
    } catch (notifErr) {
        console.warn('[TaskExecutionCore] Failed to send notification:', notifErr.message);
    }
    
    return {
        code: 200,
        data: {
            updated: true,
            task: updatedTask
        }
    };
}

/**
 * 取消执行步骤
 */
function cancelStep(taskId, stepIndex, reason, agentId, agentName) {
    const task = readTask(taskId);
    
    if (!task) {
        return errors.createErrorResponse('TASK_NOT_FOUND', { taskId });
    }
    
    // 验证步骤索引
    if (!task.breakdown || stepIndex < 0 || stepIndex >= task.breakdown.length) {
        return errors.createErrorResponse('STEP_INVALID_INDEX', {
            stepIndex,
            taskId,
            totalSteps: task.breakdown?.length || 0
        });
    }
    
    // 检查步骤状态
    const step = task.breakdown[stepIndex];
    if (step.status !== 'running' && step.status !== 'pending') {
        return errors.createErrorResponse('STEP_INVALID_STATUS', {
            stepIndex,
            currentStatus: step.status,
            allowedStatuses: ['pending', 'running'],
            taskId
        });
    }
    
    // 更新步骤状态
    task.breakdown[stepIndex] = {
        ...step,
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: agentId,
        cancelled_by_name: agentName,
        cancel_reason: reason
    };
    
    // 更新任务
    const updatedTask = updateTask(taskId, {
        breakdown: task.breakdown,
        current_step: stepIndex + 1,
        status: 'pending'
    });
    
    // 记录日志
    logOperation(taskId, 'agent', agentId, 'cancel_step', {
        stepIndex,
        reason,
        agentName
    });
    
    // WebSocket 实时推送步骤取消通知
    if (progressPush) {
        try {
            progressPush.pushError(taskId, agentId, 'STEP_CANCELLED', reason, { stepIndex });
            console.log(`[TaskExecutionCore] WebSocket push: step ${stepIndex} cancelled by ${agentId}`);
        } catch (err) {
            console.warn('[TaskExecutionCore] WebSocket push failed:', err.message);
        }
    }
    
    return {
        code: 200,
        data: {
            updated: true,
            task: updatedTask
        }
    };
}

/**
 * 获取任务执行历史
 */
function getExecutionHistory(taskId) {
    const task = readTask(taskId);
    
    if (!task) {
        return errors.createErrorResponse('TASK_NOT_FOUND', { taskId });
    }
    
    // 读取日志文件
    try {
        const logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
        const taskLogs = logs.filter(l => l.taskId === taskId);
        
        return {
            code: 200,
            data: {
                taskId,
                logs: taskLogs,
                total: taskLogs.length
            }
        };
    } catch (error) {
        return errors.createErrorResponse('SYSTEM_FILE_ERROR', {
            detail: error.message
        });
    }
}

/**
 * 导出 API
 */
module.exports = {
    submitAnalysis,
    submitBreakdown,
    completeStep,
    startStep,
    completeTask,
    cancelStep,
    getExecutionHistory,
    
    // 工具函数
    logOperation,
    readTask,
    updateTask,
    generateExecutionId,
    generateLogId,
    errors
};
