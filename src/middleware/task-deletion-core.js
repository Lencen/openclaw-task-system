/**
 * Task Deletion Core - 任务删除核心模块
 * 
 * 实现软删除、回收站、恢复、删除日志等功能
 * 
 * @version 1.1.0
 * @date 2026-03-27
 * @change 迁移到 SQLite，使用 DAL
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');

const DATA_DIR = path.join(__dirname, '../data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const TASK_TRASH_FILE = path.join(DATA_DIR, 'task-trash.json');
const DELETION_LOGS_FILE = path.join(DATA_DIR, 'deletion-logs.json');
const TASK_EXECUTION_LOGS_FILE = path.join(DATA_DIR, 'task-execution-logs.json');
const AGENT_QUEUES_FILE = path.join(DATA_DIR, 'agent-queues.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');
const STEP_RECOVERY_FILE = path.join(DATA_DIR, 'step-recovery-state.json');

// WebSocket 推送模块引用
let progressPush = null;
try {
    progressPush = require('./progress-push');
    console.log('[TaskDeletionCore] WebSocket push module loaded');
} catch (err) {
    console.warn('[TaskDeletionCore] WebSocket push module not available:', err.message);
}

// 确保必要的文件存在
function ensureFilesExist() {
    if (!fs.existsSync(DELETION_LOGS_FILE)) {
        fs.writeFileSync(DELETION_LOGS_FILE, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(TASK_TRASH_FILE)) {
        fs.writeFileSync(TASK_TRASH_FILE, JSON.stringify([], null, 2));
    }
}

ensureFilesExist();

/**
 * 生成删除日志 ID
 */
function generateDeletionLogId() {
    return `del-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * 读取任务列表（使用 DAL）
 */
function readTasks() {
    try {
        return db.tasks.list();
    } catch {
        return [];
    }
}

/**
 * 写入任务列表（已废弃 - 使用 DAL 代替）
 * @deprecated
 */
function writeTasks(tasks) {
    console.warn('[TaskDeletionCore] writeTasks() is deprecated, use db.tasks.update() instead');
}

/**
 * 读取回收站
 */
function readTrash() {
    try {
        return JSON.parse(fs.readFileSync(TASK_TRASH_FILE, 'utf8'));
    } catch {
        return [];
    }
}

/**
 * 写入回收站
 */
function writeTrash(trash) {
    fs.writeFileSync(TASK_TRASH_FILE, JSON.stringify(trash, null, 2));
}

/**
 * 读取删除日志
 */
function readDeletionLogs() {
    try {
        return JSON.parse(fs.readFileSync(DELETION_LOGS_FILE, 'utf8'));
    } catch {
        return [];
    }
}

/**
 * 写入删除日志
 */
function writeDeletionLogs(logs) {
    fs.writeFileSync(DELETION_LOGS_FILE, JSON.stringify(logs, null, 2));
}

/**
 * 检查任务是否可删除
 * @param {Object} task 任务对象
 * @returns {Object} { deletable: boolean, reason?: string }
 */
function checkDeletable(task) {
    if (!task) {
        return { deletable: false, reason: '任务不存在' };
    }
    
    // 已删除的任务不能再删除
    if (task.status === 'deleted' || task.deleted_at) {
        return { deletable: false, reason: '任务已被删除' };
    }
    
    // 正在执行的任务不能删除
    if (task.status === 'doing' || task.status === 'running') {
        return { deletable: false, reason: '任务正在执行中，请先暂停或取消' };
    }
    
    // 有前置依赖的任务不能删除
    if (task.preTaskId) {
        return { deletable: false, reason: '任务有前置依赖，请先解除依赖关系' };
    }
    
    return { deletable: true };
}

/**
 * 清理关联数据
 * @param {string} taskId 任务 ID
 * @returns {Object} 清理结果
 */
function cleanupRelatedData(taskId) {
    const cleanupResults = {
        executionLogs: { removed: 0 },
        agentQueues: { removed: 0 },
        notifications: { removed: 0 },
        stepRecovery: { removed: 0 }
    };
    
    try {
        // 1. 清理 task-execution-logs.json
        if (fs.existsSync(TASK_EXECUTION_LOGS_FILE)) {
            const logs = JSON.parse(fs.readFileSync(TASK_EXECUTION_LOGS_FILE, 'utf8'));
            const originalLength = logs.length;
            const filteredLogs = logs.filter(log => log.taskId !== taskId);
            fs.writeFileSync(TASK_EXECUTION_LOGS_FILE, JSON.stringify(filteredLogs, null, 2));
            cleanupResults.executionLogs.removed = originalLength - filteredLogs.length;
        }
        
        // 2. 清理 agent-queues.json
        if (fs.existsSync(AGENT_QUEUES_FILE)) {
            const queues = JSON.parse(fs.readFileSync(AGENT_QUEUES_FILE, 'utf8'));
            let removedFromQueues = 0;
            
            for (const agentId in queues) {
                if (queues[agentId].currentTasks) {
                    const originalLength = queues[agentId].currentTasks.length;
                    queues[agentId].currentTasks = queues[agentId].currentTasks.filter(id => id !== taskId);
                    removedFromQueues += originalLength - queues[agentId].currentTasks.length;
                }
            }
            
            fs.writeFileSync(AGENT_QUEUES_FILE, JSON.stringify(queues, null, 2));
            cleanupResults.agentQueues.removed = removedFromQueues;
        }
        
        // 3. 清理 notifications.json
        if (fs.existsSync(NOTIFICATIONS_FILE)) {
            const notifData = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
            if (notifData.notifications) {
                const originalLength = notifData.notifications.length;
                notifData.notifications = notifData.notifications.filter(n => 
                    !(n.content && n.content.taskId === taskId)
                );
                fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifData, null, 2));
                cleanupResults.notifications.removed = originalLength - notifData.notifications.length;
            }
        }
        
        // 4. 清理 step-recovery-state.json
        if (fs.existsSync(STEP_RECOVERY_FILE)) {
            const recoveryState = JSON.parse(fs.readFileSync(STEP_RECOVERY_FILE, 'utf8'));
            const keysToRemove = Object.keys(recoveryState).filter(key => key.startsWith(taskId));
            keysToRemove.forEach(key => delete recoveryState[key]);
            fs.writeFileSync(STEP_RECOVERY_FILE, JSON.stringify(recoveryState, null, 2));
            cleanupResults.stepRecovery.removed = keysToRemove.length;
        }
        
    } catch (error) {
        console.error('[TaskDeletionCore] 清理关联数据失败:', error.message);
    }
    
    return cleanupResults;
}

/**
 * 恢复关联数据
 * @param {string} taskId 任务 ID
 * @param {Object} cleanupData 清理时的数据（可选）
 * @returns {Object} 恢复结果
 */
function restoreRelatedData(taskId, cleanupData = null) {
    // 注意：由于关联数据已删除，恢复时需要重新创建
    // 这里主要返回成功状态，实际数据可能需要重新生成
    return {
        executionLogs: { restored: 0, note: '执行日志已删除，无法恢复' },
        agentQueues: { restored: 0, note: '任务需要重新分配' },
        notifications: { restored: 0, note: '通知已删除，无法恢复' },
        stepRecovery: { restored: 0, note: '恢复状态已清理，需重新执行' }
    };
}

/**
 * 记录删除日志
 * @param {Object} logEntry 日志条目
 */
function logDeletion(logEntry) {
    const logs = readDeletionLogs();
    logs.push({
        id: generateDeletionLogId(),
        ...logEntry,
        timestamp: new Date().toISOString()
    });
    
    // 限制日志数量
    if (logs.length > 10000) {
        logs.splice(0, logs.length - 10000);
    }
    
    writeDeletionLogs(logs);
}

/**
 * 软删除任务
 * @param {string} taskId 任务 ID
 * @param {Object} options 选项
 * @param {string} options.deletedBy 删除者
 * @param {string} options.reason 删除原因
 * @param {number} options.version 版本号（乐观锁）
 * @returns {Object} 删除结果
 */
function deleteTask(taskId, options = {}) {
    const { deletedBy = 'system', reason = '', version } = options;
    
    // 使用 DAL 读取任务
    const task = db.tasks.get(taskId);
    
    if (!task) {
        return {
            code: 404,
            error: {
                type: 'NotFoundError',
                message: '任务不存在'
            }
        };
    }
    
    // 检查是否可删除
    const checkResult = checkDeletable(task);
    if (!checkResult.deletable) {
        return {
            code: 400,
            error: {
                type: 'ValidationError',
                message: checkResult.reason
            }
        };
    }
    
    // 乐观锁检查
    if (version !== undefined && task.version !== undefined && task.version !== version) {
        return {
            code: 409,
            error: {
                type: 'ConflictError',
                message: '任务已被修改，请刷新后重试'
            }
        };
    }
    
    // 备份原始任务数据（用于恢复）
    const taskBackup = { ...task };
    
    // 清理关联数据
    const cleanupResults = cleanupRelatedData(taskId);
    
    // 更新任务状态为 deleted（使用 DAL）
    db.tasks.update(taskId, {
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        deleted_by: deletedBy,
        deleted_reason: reason,
        version: (task.version || 0) + 1,
        cleanup_data: cleanupResults
    });
    
    // 添加到回收站（JSON 文件保留）
    const trash = readTrash();
    trash.unshift({
        ...task,
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        deleted_by: deletedBy,
        deleted_reason: reason,
        version: (task.version || 0) + 1,
        cleanup_data: cleanupResults
    });
    if (trash.length > 1000) {
        trash.splice(1000);
    }
    writeTrash(trash);
    
    // 记录删除日志
    logDeletion({
        taskId,
        taskTitle: task.title,
        action: 'DELETE',
        deletedBy,
        reason,
        previousStatus: task.status,
        cleanupResults,
        taskSnapshot: {
            id: task.id,
            title: task.title,
            priority: task.priority,
            status: task.status,
            created_at: task.created_at
        }
    });
    
    // WebSocket 推送删除通知
    if (progressPush) {
        try {
            progressPush.pushEvent('TASK_DELETED', {
                taskId,
                taskTitle: task.title,
                deletedBy,
                reason,
                timestamp: new Date().toISOString()
            });
            console.log(`[TaskDeletionCore] WebSocket push: task ${taskId} deleted`);
        } catch (err) {
            console.warn('[TaskDeletionCore] WebSocket push failed:', err.message);
        }
    }
    
    return {
        code: 200,
        data: {
            deleted: true,
            taskId,
            deletedAt: deletedTask.deleted_at,
            cleanupResults
        }
    };
}

/**
 * 获取回收站列表
 * @param {Object} options 查询选项
 * @returns {Object} 回收站列表
 */
function getTrashList(options = {}) {
    const { page = 1, limit = 20, deletedBy } = options;
    
    let trash = readTrash();
    
    // 过滤
    if (deletedBy) {
        trash = trash.filter(t => t.deleted_by === deletedBy);
    }
    
    // 排序（最新删除的在前）
    trash.sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
    
    // 分页
    const total = trash.length;
    const offset = (page - 1) * limit;
    const paginatedTrash = trash.slice(offset, offset + limit);
    
    return {
        code: 200,
        data: {
            trash: paginatedTrash,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    };
}

/**
 * 从回收站恢复任务
 * @param {string} taskId 任务 ID
 * @param {Object} options 选项
 * @param {string} options.restoredBy 恢复者
 * @returns {Object} 恢复结果
 */
function restoreTask(taskId, options = {}) {
    const { restoredBy = 'system' } = options;
    
    // 从回收站查找
    const trash = readTrash();
    const trashIndex = trash.findIndex(t => t.id === taskId);
    
    if (trashIndex === -1) {
        return {
            code: 404,
            error: {
                type: 'NotFoundError',
                message: '任务不在回收站中'
            }
        };
    }
    
    const task = trash[trashIndex];
    
    // 检查是否已被彻底删除（超过30天）
    const deletedAt = new Date(task.deleted_at);
    const daysSinceDeleted = Math.floor((Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceDeleted > 30) {
        return {
            code: 400,
            error: {
                type: 'ValidationError',
                message: '任务已在回收站超过30天，无法恢复'
            }
        };
    }
    
    // 恢复任务（使用 DAL）
    db.tasks.update(taskId, {
        status: 'pending',
        restored_at: new Date().toISOString(),
        restored_by: restoredBy,
        version: (task.version || 0) + 1,
        // 删除删除相关字段
        deleted_at: null,
        deleted_by: null,
        deleted_reason: null,
        cleanup_data: null
    });
    
    // 从回收站移除
    trash.splice(trashIndex, 1);
    writeTrash(trash);
    
    // 恢复关联数据
    const restoreResults = restoreRelatedData(taskId, task.cleanup_data);
    
    // 记录恢复日志
    logDeletion({
        taskId,
        taskTitle: task.title,
        action: 'RESTORE',
        restoredBy,
        previousStatus: 'deleted',
        newStatus: 'pending',
        restoreResults
    });
    
    // WebSocket 推送恢复通知
    if (progressPush) {
        try {
            progressPush.pushEvent('TASK_RESTORED', {
                taskId,
                taskTitle: task.title,
                restoredBy,
                timestamp: new Date().toISOString()
            });
            console.log(`[TaskDeletionCore] WebSocket push: task ${taskId} restored`);
        } catch (err) {
            console.warn('[TaskDeletionCore] WebSocket push failed:', err.message);
        }
    }
    
    return {
        code: 200,
        data: {
            restored: true,
            taskId,
            restoredAt: restoredTask.restored_at,
            restoreResults
        }
    };
}

/**
 * 彻底删除任务（从回收站）
 * @param {string} taskId 任务 ID
 * @param {Object} options 选项
 * @param {string} options.deletedBy 删除者
 * @returns {Object} 删除结果
 */
function permanentDelete(taskId, options = {}) {
    const { deletedBy = 'system' } = options;
    
    const trash = readTrash();
    const trashIndex = trash.findIndex(t => t.id === taskId);
    
    if (trashIndex === -1) {
        return {
            code: 404,
            error: {
                type: 'NotFoundError',
                message: '任务不在回收站中'
            }
        };
    }
    
    const task = trash[trashIndex];
    
    // 记录永久删除日志
    logDeletion({
        taskId,
        taskTitle: task.title,
        action: 'PERMANENT_DELETE',
        deletedBy,
        reason: '用户主动永久删除'
    });
    
    // 从回收站移除
    trash.splice(trashIndex, 1);
    writeTrash(trash);
    
    return {
        code: 200,
        data: {
            permanentlyDeleted: true,
            taskId
        }
    };
}

/**
 * 获取删除日志
 * @param {Object} options 查询选项
 * @returns {Object} 日志列表
 */
function getDeletionLogs(options = {}) {
    const { taskId, action, page = 1, limit = 50 } = options;
    
    let logs = readDeletionLogs();
    
    // 过滤
    if (taskId) {
        logs = logs.filter(l => l.taskId === taskId);
    }
    if (action) {
        logs = logs.filter(l => l.action === action);
    }
    
    // 排序（最新在前）
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // 分页
    const total = logs.length;
    const offset = (page - 1) * limit;
    const paginatedLogs = logs.slice(offset, offset + limit);
    
    return {
        code: 200,
        data: {
            logs: paginatedLogs,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    };
}

/**
 * 清空回收站（删除超过指定天数的任务）
 * @param {Object} options 选项
 * @param {number} options.days 天数阈值
 * @returns {Object} 清理结果
 */
function emptyTrash(options = {}) {
    const { days = 30 } = options;
    
    const trash = readTrash();
    const now = Date.now();
    const threshold = days * 24 * 60 * 60 * 1000;
    
    const toDelete = trash.filter(t => {
        const deletedAt = new Date(t.deleted_at).getTime();
        return (now - deletedAt) > threshold;
    });
    
    // 记录日志
    toDelete.forEach(task => {
        logDeletion({
            taskId: task.id,
            taskTitle: task.title,
            action: 'AUTO_PERMANENT_DELETE',
            deletedBy: 'system',
            reason: `回收站自动清理（超过${days}天）`
        });
    });
    
    // 保留未过期的任务
    const remainingTrash = trash.filter(t => {
        const deletedAt = new Date(t.deleted_at).getTime();
        return (now - deletedAt) <= threshold;
    });
    
    writeTrash(remainingTrash);
    
    return {
        code: 200,
        data: {
            deletedCount: toDelete.length,
            remainingCount: remainingTrash.length
        }
    };
}

/**
 * 导出 API
 */
module.exports = {
    // 核心功能
    deleteTask,
    checkDeletable,
    
    // 回收站
    getTrashList,
    restoreTask,
    permanentDelete,
    emptyTrash,
    
    // 删除日志
    getDeletionLogs,
    logDeletion,
    
    // 工具函数
    cleanupRelatedData,
    restoreRelatedData
};