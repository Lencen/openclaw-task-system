/**
 * Task State Manager - 任务状态统一管理器
 * 
 * 功能:
 * 1. 统一状态转换入口
 * 2. 状态机验证
 * 3. 版本控制（乐观锁）
 * 4. 权限检查
 * 5. Agent 队列自动同步
 * 6. 变更日志记录
 * 
 * @version v1.2
 * @date 2026-03-27
 * @change 迁移到 SQLite，使用 DAL
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const db = require('../db');

const DATA_DIR = path.join(__dirname, '../data');
const QUEUES_FILE = path.join(DATA_DIR, 'agent-queues.json');
const CHANGE_LOG_FILE = path.join(DATA_DIR, 'task-change-log.json');

// WebSocket 推送模块引用
let progressPush = null;
try {
    progressPush = require('./progress-push');
    console.log('[TaskStateManager] WebSocket push module loaded');
} catch (err) {
    console.warn('[TaskStateManager] WebSocket push module not available:', err.message);
}

/**
 * 任务状态机定义
 * 
 * 状态流转规则：
 * pending → doing → completed
 *    ↓        ↓        ↓
 * cancelled  paused  cancelled
 *              ↓
 *            doing
 */
const TASK_STATE_MACHINE = {
    states: {
        pending: {
            description: '等待执行',
            transitions: ['doing', 'cancelled'],
            color: '#8b5cf6'
        },
        doing: {
            description: '执行中',
            transitions: ['paused', 'completed', 'cancelled'],
            color: '#10b981'
        },
        paused: {
            description: '已暂停',
            transitions: ['doing', 'cancelled'],
            color: '#f59e0b'
        },
        completed: {
            description: '已完成',
            transitions: [], // 终态
            color: '#22c55e'
        },
        cancelled: {
            description: '已取消',
            transitions: [], // 终态
            color: '#ef4444'
        }
    },
    
    // 允许的状态转换
    transitions: {
        'pending->doing': { action: 'start', required: ['assignedAgent'] },
        'pending->cancelled': { action: 'cancel' },
        'doing->paused': { action: 'pause' },
        'doing->completed': { action: 'complete', required: ['completed_at'] },
        'doing->cancelled': { action: 'cancel' },
        'paused->doing': { action: 'resume' },
        'paused->cancelled': { action: 'cancel' }
    }
};

/**
 * 状态转换权限规则
 */
const TRANSITION_PERMISSION_RULES = {
    'pending->doing': {
        allowedRoles: ['agent', 'admin'],
        checkOwnership: (task, actorId) => (task.assigned_agent || task.assignedAgent) === actorId
    },
    'pending->cancelled': {
        allowedRoles: ['user', 'admin'],
        checkOwnership: (task, actorId) => task.creator === actorId
    },
    'doing->paused': {
        allowedRoles: ['agent', 'admin'],
        checkOwnership: (task, actorId) => (task.assigned_agent || task.assignedAgent) === actorId
    },
    'doing->completed': {
        allowedRoles: ['agent'],
        checkOwnership: (task, actorId) => (task.assigned_agent || task.assignedAgent) === actorId
    },
    'doing->cancelled': {
        allowedRoles: ['user', 'admin'],
        checkOwnership: (task, actorId) => task.creator === actorId
    },
    'paused->doing': {
        allowedRoles: ['agent', 'admin'],
        checkOwnership: (task, actorId) => (task.assigned_agent || task.assignedAgent) === actorId
    },
    'paused->cancelled': {
        allowedRoles: ['user', 'admin'],
        checkOwnership: (task, actorId) => task.creator === actorId
    }
};

/**
 * TaskStateManager 类
 */
class TaskStateManager extends EventEmitter {
    constructor() {
        super();
        this.stateMachine = TASK_STATE_MACHINE;
        this.permissionRules = TRANSITION_PERMISSION_RULES;
    }
    
    /**
     * 统一状态转换入口
     * @param {string} taskId - 任务 ID
     * @param {string} toStatus - 目标状态
     * @param {Object} options - 选项
     * @param {number} options.version - 客户端持有的版本号（乐观锁）
     * @param {string} options.actorId - 触发者 ID
     * @param {string} options.actorRole - 触发者角色
     * @returns {Object} 更新后的任务
     */
    async transition(taskId, toStatus, options = {}) {
        const { version, actorId, actorRole = 'agent' } = options;
        
        // 使用 DAL 读取任务
        const task = db.tasks.get(taskId);
        
        if (!task) {
            const error = new Error(`Task not found: ${taskId}`);
            error.code = 'TASK_NOT_FOUND';
            throw error;
        }
        
        const fromStatus = task.status;
        
        // 状态相同，无需转换
        if (fromStatus === toStatus) {
            return task;
        }
        
        // 版本检查（乐观锁）
        if (version !== undefined && task._version !== undefined && task._version !== version) {
            const conflictError = new Error('VERSION_CONFLICT');
            conflictError.code = 'VERSION_CONFLICT';
            conflictError.currentVersion = task._version;
            conflictError.clientVersion = version;
            conflictError.task = task;
            throw conflictError;
        }
        
        // 权限检查
        if (!this._checkTransitionPermission(task, toStatus, actorId, actorRole)) {
            const permError = new Error('PERMISSION_DENIED');
            permError.code = 'PERMISSION_DENIED';
            permError.transition = `${fromStatus}->${toStatus}`;
            permError.actorId = actorId;
            permError.actorRole = actorRole;
            permError.taskId = taskId;
            throw permError;
        }
        
        // 验证状态转换
        if (!this._isValidTransition(fromStatus, toStatus)) {
            const invalidError = new Error(`Invalid transition: ${fromStatus} -> ${toStatus}`);
            invalidError.code = 'INVALID_TRANSITION';
            invalidError.fromStatus = fromStatus;
            invalidError.toStatus = toStatus;
            throw invalidError;
        }
        
        // 更新任务状态 - 使用 DAL
        const now = new Date().toISOString();
        const newVersion = (task._version || 0) + 1;
        
        const updates = {
            status: toStatus,
            lastModified: now,
            _version: newVersion
        };
        
        // 根据状态更新时间戳
        if (toStatus === 'doing' && !task.started_at) {
            updates.started_at = now;
        }
        if (toStatus === 'completed') {
            updates.completed_at = now;
            updates.progress = 100;
        }
        if (toStatus === 'paused') {
            updates.paused_at = now;
        }
        if (toStatus === 'cancelled') {
            updates.cancelled_at = now;
        }
        
        // 应用额外更新（不包含内部字段）
        Object.keys(options).forEach(key => {
            if (!['version', 'actorId', 'actorRole'].includes(key)) {
                updates[key] = options[key];
            }
        });
        
        // 使用 DAL 更新
        db.tasks.update(taskId, updates);
        
        // 同步 Agent 队列
        await this._syncAgentQueue(task.assigned_agent || task.assignedAgent, taskId, fromStatus, toStatus);
        
        // 记录变更日志
        this._logChange({
            taskId,
            fromStatus,
            toStatus,
            version: newVersion,
            actorId,
            actorRole,
            timestamp: now,
            changes: updates
        });
        
        // 获取更新后的任务
        const updatedTask = db.tasks.get(taskId);
        
        // 发射事件
        this.emit('stateChange', {
            taskId,
            fromStatus,
            toStatus,
            timestamp: now,
            version: newVersion,
            task: updatedTask
        });
        
        // WebSocket 推送
        if (progressPush) {
            try {
                this._pushStateChange(updatedTask, fromStatus, toStatus, actorId);
            } catch (err) {
                console.warn('[TaskStateManager] WebSocket push failed:', err.message);
            }
        }
        
        console.log(`[TaskStateManager] Task ${taskId}: ${fromStatus} -> ${toStatus} (v${newVersion})`);
        
        return updatedTask;
    }
    
    /**
     * 更新任务（带版本检查）
     * @param {string} taskId - 任务 ID
     * @param {Object} updates - 更新内容
     * @param {Object} options - 选项
     * @returns {Object} 更新后的任务
     */
    async updateTask(taskId, updates, options = {}) {
        const { version, actorId, actorRole = 'agent' } = options;
        
        // 使用 DAL 读取任务
        const task = db.tasks.get(taskId);
        
        if (!task) {
            const error = new Error(`Task not found: ${taskId}`);
            error.code = 'TASK_NOT_FOUND';
            throw error;
        }
        
        // 版本检查（乐观锁）
        if (version !== undefined && task._version !== undefined && task._version !== version) {
            const conflictError = new Error('VERSION_CONFLICT');
            conflictError.code = 'VERSION_CONFLICT';
            conflictError.currentVersion = task._version;
            conflictError.clientVersion = version;
            conflictError.task = task;
            throw conflictError;
        }
        
        // 更新任务 - 使用 DAL
        const now = new Date().toISOString();
        const newVersion = (task._version || 0) + 1;
        
        const finalUpdates = {
            ...updates,
            lastModified: now,
            _version: newVersion
        };
        
        db.tasks.update(taskId, finalUpdates);
        
        // 记录变更日志
        this._logChange({
            taskId,
            fromStatus: task.status,
            toStatus: updates.status || task.status,
            version: newVersion,
            actorId,
            actorRole,
            timestamp: now,
            changes: updates
        });
        
        // 返回更新后的任务
        return db.tasks.get(taskId);
    }
    
    /**
     * 获取任务
     * @param {string} taskId - 任务 ID
     * @returns {Object|null} 任务对象
     */
    getTask(taskId) {
        return db.tasks.get(taskId);
    }
    
    /**
     * 获取所有任务
     * @param {Object} filters - 过滤条件
     * @returns {Array} 任务列表
     */
    getTasks(filters = {}) {
        let tasks = db.tasks.list(filters);
        
        // 已完成过滤（默认隐藏）
        if (filters.showCompleted !== true) {
            tasks = tasks.filter(t => t.status !== 'completed');
        }
        
        return tasks;
    }
    
    /**
     * 获取指定时间后的变更
     * @param {string} since - ISO 时间戳
     * @returns {Array} 变更记录列表
     */
    getChangesSince(since) {
        let changeLog = [];
        try {
            if (fs.existsSync(CHANGE_LOG_FILE)) {
                changeLog = JSON.parse(fs.readFileSync(CHANGE_LOG_FILE, 'utf8'));
            }
        } catch {
            return [];
        }
        
        const sinceTime = new Date(since).getTime();
        if (isNaN(sinceTime)) {
            return [];
        }
        
        return changeLog.filter(record => {
            return new Date(record.timestamp).getTime() > sinceTime;
        });
    }
    
    /**
     * 检查状态转换权限
     * @param {Object} task - 任务对象
     * @param {string} toStatus - 目标状态
     * @param {string} actorId - 触发者 ID
     * @param {string} actorRole - 触发者角色
     * @returns {boolean} 是否有权限
     */
    _checkTransitionPermission(task, toStatus, actorId, actorRole) {
        const fromStatus = task.status;
        const transition = `${fromStatus}->${toStatus}`;
        
        // 管理员拥有所有权限
        if (actorRole === 'admin') {
            return true;
        }
        
        // 查找权限规则
        const rule = this.permissionRules[transition];
        if (!rule) {
            // 未定义的转换，默认不允许
            return false;
        }
        
        // 检查角色权限
        if (!rule.allowedRoles.includes(actorRole)) {
            return false;
        }
        
        // 检查所有权（如果有要求）
        if (rule.checkOwnership && !rule.checkOwnership(task, actorId)) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 验证状态转换是否有效
     * @param {string} from - 源状态
     * @param {string} to - 目标状态
     * @returns {boolean} 是否有效
     */
    _isValidTransition(from, to) {
        const allowed = this.stateMachine.states[from]?.transitions || [];
        return allowed.includes(to);
    }
    
    /**
     * 同步 Agent 队列
     * @param {string} agentId - Agent ID
     * @param {string} taskId - 任务 ID
     * @param {string} fromStatus - 源状态
     * @param {string} toStatus - 目标状态
     */
    async _syncAgentQueue(agentId, taskId, fromStatus, toStatus) {
        if (!agentId) return;
        
        const queues = this._readQueues();
        
        if (!queues[agentId]) {
            queues[agentId] = { currentTasks: [], completed: 0 };
        }
        
        const currentTasks = queues[agentId].currentTasks || [];
        
        // 任务进入执行状态，添加到队列
        if (fromStatus === 'pending' && toStatus === 'doing') {
            if (!currentTasks.includes(taskId)) {
                currentTasks.push(taskId);
            }
        }
        
        // 任务完成/取消，从队列移除
        if (['completed', 'cancelled'].includes(toStatus)) {
            const index = currentTasks.indexOf(taskId);
            if (index > -1) {
                currentTasks.splice(index, 1);
            }
            if (toStatus === 'completed') {
                queues[agentId].completed = (queues[agentId].completed || 0) + 1;
            }
        }
        
        queues[agentId].currentTasks = currentTasks;
        this._writeQueues(queues);
        
        console.log(`[TaskStateManager] Synced agent queue: ${agentId} has ${currentTasks.length} tasks`);
    }
    
    /**
     * 记录变更日志
     * @param {Object} changeRecord - 变更记录
     */
    _logChange(changeRecord) {
        let changeLog = [];
        try {
            if (fs.existsSync(CHANGE_LOG_FILE)) {
                changeLog = JSON.parse(fs.readFileSync(CHANGE_LOG_FILE, 'utf8'));
            }
        } catch {
            changeLog = [];
        }
        
        changeLog.push(changeRecord);
        
        // 只保留最近 10000 条记录
        if (changeLog.length > 10000) {
            changeLog = changeLog.slice(-10000);
        }
        
        fs.writeFileSync(CHANGE_LOG_FILE, JSON.stringify(changeLog, null, 2));
    }
    
    /**
     * WebSocket 推送状态变更
     */
    _pushStateChange(task, fromStatus, toStatus, actorId) {
        if (!progressPush) return;
        
        const eventType = {
            'doing': 'task_started',
            'completed': 'task_completed',
            'paused': 'task_paused',
            'cancelled': 'task_cancelled'
        }[toStatus] || 'task_status_changed';
        
        progressPush.broadcast(eventType, {
            taskId: task.id,
            fromStatus,
            toStatus,
            actorId,
            task: {
                id: task.id,
                title: task.title,
                status: task.status,
                _version: task._version,
                progress: task.progress
            }
        });
    }
    
    /**
     * 按时间范围过滤任务
     * @param {Array} tasks - 任务列表
     * @param {string} range - 时间范围
     * @returns {Array} 过滤后的任务列表
     */
    _filterByTimeRange(tasks, range) {
        const now = Date.now();
        const ranges = {
            'today': 1 * 24 * 60 * 60 * 1000,
            'week': 7 * 24 * 60 * 60 * 1000,
            'month': 30 * 24 * 60 * 60 * 1000,
            'quarter': 90 * 24 * 60 * 60 * 1000
        };
        
        const threshold = now - (ranges[range] || ranges['month']);
        
        return tasks.filter(task => {
            const taskTime = new Date(task.created_at || task.lastModified).getTime();
            return taskTime >= threshold;
        });
    }
    
    /**
     * 读取任务列表（使用 DAL）
     * @returns {Array} 任务列表
     */
    _readTasks() {
        try {
            return db.tasks.list();
        } catch (error) {
            console.error('[TaskStateManager] Error reading tasks:', error.message);
            return [];
        }
    }
    
    /**
     * 写入任务列表（已废弃 - 使用 DAL 单条更新）
     * @param {Array} tasks - 任务列表
     * @deprecated 不再需要整体写入，使用 db.tasks.update() 代替
     */
    _writeTasks(tasks) {
        // 已废弃：不再需要整体写入
        // 每个更新都通过 DAL 的 updateTask 方法直接写入数据库
        console.warn('[TaskStateManager] _writeTasks() is deprecated, use db.tasks.update() instead');
    }
    
    /**
     * 读取 Agent 队列
     * @returns {Object} 队列数据
     */
    _readQueues() {
        try {
            if (fs.existsSync(QUEUES_FILE)) {
                return JSON.parse(fs.readFileSync(QUEUES_FILE, 'utf8'));
            }
            return {};
        } catch {
            return {};
        }
    }
    
    /**
     * 写入 Agent 队列
     * @param {Object} queues - 队列数据
     */
    _writeQueues(queues) {
        fs.writeFileSync(QUEUES_FILE, JSON.stringify(queues, null, 2));
    }
    
    /**
     * 获取状态机定义
     * @returns {Object} 状态机定义
     */
    getStateMachine() {
        return this.stateMachine;
    }
    
    /**
     * 获取允许的状态转换
     * @param {string} status - 当前状态
     * @returns {Array} 允许转换的目标状态列表
     */
    getAllowedTransitions(status) {
        return this.stateMachine.states[status]?.transitions || [];
    }
}

// 单例导出
const taskStateManager = new TaskStateManager();

// 监听事件，可以扩展
taskStateManager.on('stateChange', (data) => {
    // 可以在这里添加额外的处理逻辑
    console.log(`[TaskStateManager] State change event: ${JSON.stringify(data.taskId)} - ${data.fromStatus} -> ${data.toStatus}`);
});

module.exports = taskStateManager;