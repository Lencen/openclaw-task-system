/**
 * 并发控制模块 - 乐观锁 + 版本号
 * 
 * 为任务执行提供并发安全保障
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');

const DATA_DIR = path.join(__dirname, '../data');

/**
 * 生成任务版本号
 */
function generateVersion() {
    return crypto.randomBytes(8).toString('hex');
}

/**
 * 加载任务（兼容旧代码，使用DAL）
 */
async function loadTasks() {
    return db.tasks.list();
}

/**
 * 保存任务（兼容旧代码，使用DAL）
 */
async function saveTasks(tasks) {
    // 这个方法现在主要用于兼容性，实际应该逐个更新任务
    // 因为 DAL 的 update 需要任务 ID，而这里只有任务数组
    for (const task of tasks) {
        await db.tasks.update(task.id, task);
    }
    return true;
}

/**
 * 获取任务（带版本号）
 */
async function getTaskWithVersion(taskId) {
    const task = await db.tasks.get(taskId);
    
    if (!task) {
        return null;
    }
    
    return {
        task,
        version: task.version || generateVersion()
    };
}

/**
 * 乐观锁更新任务
 * 
 * @param {string} taskId - 任务 ID
 * @param {function} updateFn - 任务更新函数，接收当前任务并返回新任务
 * @param {string} expectedVersion - 期望的版本号（用于乐观锁验证）
 * @returns {object} - 更新后的任务和新版本号
 */
async function optimisticUpdate(taskId, updateFn, expectedVersion = null) {
    const task = await db.tasks.get(taskId);
    
    if (!task) {
        throw new Error(`Task not found: ${taskId}`);
    }
    
    // 验证版本号（乐观锁）
    if (expectedVersion && task.version !== expectedVersion) {
        throw new Error(`Version conflict: expected ${expectedVersion}, got ${task.version}. Task has been modified by another process.`);
    }
    
    // 执行更新函数
    const updatedTask = updateFn(task);
    
    // 生成新版本号
    updatedTask.version = generateVersion();
    updatedTask.lastModified = new Date().toISOString();
    
    // 保存更新
    await db.tasks.update(taskId, updatedTask);
    
    return {
        task: updatedTask,
        version: updatedTask.version,
        oldVersion: expectedVersion || task.version
    };
}

/**
 * 检查任务是否被其他进程修改（并发冲突检测）
 */
async function checkVersionConflict(taskId, currentVersion) {
    const task = await db.tasks.get(taskId);
    
    if (!task) {
        return false; // 任务不存在，不算冲突
    }
    
    return task.version !== currentVersion;
}

/**
 * 任务锁 - 临时锁定任务
 */
async function lockTask(taskId, agentId, timeoutMs = 300000) {
    const task = await db.tasks.get(taskId);
    
    if (!task) {
        throw new Error(`Task not found: ${taskId}`);
    }
    
    // 检查是否已被锁定
    if (task.locked && Date.now() < task.lockedUntil) {
        throw new Error(`Task is locked by ${task.lockedBy} until ${new Date(task.lockedUntil).toISOString()}`);
    }
    
    // 设置锁定
    task.locked = true;
    task.lockedBy = agentId;
    task.lockedUntil = Date.now() + timeoutMs;
    
    await db.tasks.update(taskId, task);
    
    return {
        locked: true,
        lockedBy: agentId,
        lockedUntil: task.lockedUntil
    };
}

/**
 * 解锁任务
 */
async function unlockTask(taskId, agentId) {
    const task = await db.tasks.get(taskId);
    
    if (!task) {
        throw new Error(`Task not found: ${taskId}`);
    }
    
    // 验证锁定者
    if (task.locked && task.lockedBy !== agentId) {
        throw new Error(`Task is locked by another agent: ${task.lockedBy}`);
    }
    
    // 解锁
    task.locked = false;
    task.lockedBy = null;
    task.lockedUntil = 0;
    
    await db.tasks.update(taskId, task);
    
    return { locked: false };
}

/**
 * 刷新锁定（延长锁定时间）
 */
async function refreshLock(taskId, agentId, timeoutMs = 300000) {
    const task = await db.tasks.get(taskId);
    
    if (!task) {
        throw new Error(`Task not found: ${taskId}`);
    }
    
    // 验证锁定者
    if (task.locked && task.lockedBy !== agentId) {
        throw new Error(`Task is locked by another agent: ${task.lockedBy}`);
    }
    
    // 刷新锁定时间
    task.lockedUntil = Date.now() + timeoutMs;
    
    await db.tasks.update(taskId, task);
    
    return {
        locked: true,
        lockedBy: agentId,
        lockedUntil: task.lockedUntil
    };
}

/**
 * 执行器锁 - 防止多个执行器同时执行同一任务
 */
class TaskExecutionLock {
    constructor(taskId, agentId, lockDir = path.join(DATA_DIR, 'execution-locks')) {
        this.taskId = taskId;
        this.agentId = agentId;
        this.lockFile = path.join(lockDir, `${taskId}.lock`);
        this.locked = false;
        
        // 确保目录存在
        if (!fs.existsSync(lockDir)) {
            fs.mkdirSync(lockDir, { recursive: true });
        }
    }
    
    /**
     * 获取锁
     */
    async acquire(timeoutMs = 30000) {
        const start = Date.now();
        
        while (Date.now() - start < timeoutMs) {
            try {
                if (fs.existsSync(this.lockFile)) {
                    const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
                    const elapsed = Date.now() - lockData.acquiredAt;
                    
                    // 锁已过期，强制释放
                    if (elapsed > lockData.ttlMs) {
                        fs.unlinkSync(this.lockFile);
                        continue;
                    }
                    
                    // 等待锁释放
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                }
                
                // 创建锁文件
                fs.writeFileSync(this.lockFile, JSON.stringify({
                    taskId: this.taskId,
                    agentId: this.agentId,
                    acquiredAt: Date.now(),
                    ttlMs: 300000 // 5 minutes
                }, null, 2));
                
                this.locked = true;
                return true;
            } catch (error) {
                if (error.code === 'ENOENT') {
                    continue; // 文件不存在，重试
                }
                throw error;
            }
        }
        
        throw new Error(`Failed to acquire lock for task ${this.taskId} within ${timeoutMs}ms`);
    }
    
    /**
     * 释放锁
     */
    async release() {
        if (!this.locked) {
            return true;
        }
        
        try {
            if (fs.existsSync(this.lockFile)) {
                const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
                
                // 验证锁持有者
                if (lockData.agentId !== this.agentId) {
                    throw new Error(`Lock is held by another agent: ${lockData.agentId}`);
                }
                
                fs.unlinkSync(this.lockFile);
            }
            
            this.locked = false;
            return true;
        } catch (error) {
            throw new Error(`Failed to release lock: ${error.message}`);
        }
    }
    
    /**
     * 刷新锁
     */
    async refresh() {
        if (!this.locked) {
            throw new Error('Lock not acquired');
        }
        
        try {
            if (fs.existsSync(this.lockFile)) {
                const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
                lockData.acquiredAt = Date.now();
                fs.writeFileSync(this.lockFile, JSON.stringify(lockData, null, 2));
            }
        } catch (error) {
            throw new Error(`Failed to refresh lock: ${error.message}`);
        }
    }
}

/**
 * 导出 API
 */
module.exports = {
    optimisticUpdate,
    getTaskWithVersion,
    checkVersionConflict,
    
    // 任务级锁定
    lockTask,
    unlockTask,
    refreshLock,
    
    // 执行器级锁定
    TaskExecutionLock,
    
    // 工具函数
    loadTasks,
    saveTasks,
    generateVersion
};
