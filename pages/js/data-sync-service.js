/**
 * DataSyncService - 前端数据同步服务
 * 
 * 功能:
 * 1. WebSocket 连接管理
 * 2. 断线重连与增量同步
 * 3. 乐观更新与冲突检测
 * 4. 本地缓存管理
 * 
 * @version v1.1
 * @date 2026-03-17
 */

class DataSyncService extends EventTarget {
    constructor(options = {}) {
        super();
        
        this.options = {
            wsUrl: options.wsUrl || `ws://${window.location.host}`,
            reconnectInterval: options.reconnectInterval || 3000,
            maxReconnectAttempts: options.maxReconnectAttempts || 10,
            syncInterval: options.syncInterval || 30000,
            apiBase: options.apiBase || '/api',
            channels: options.channels || ['all']
        };
        
        // WebSocket 连接
        this.ws = null;
        this.wsConnected = false;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        
        // 本地数据缓存
        this.cache = new Map();
        this.pendingUpdates = new Map();
        this.localVersions = new Map();
        
        // 同步状态
        this.lastSyncTime = null;
        this.syncInProgress = false;
        this.syncTimer = null;
        
        // 初始化
        this.init();
    }
    
    /**
     * 初始化服务
     */
    init() {
        // 从 localStorage 恢复缓存
        this._restoreCache();
        
        // 建立 WebSocket 连接
        this.connect();
        
        // 启动定期同步
        this.startPeriodicSync();
        
        console.log('[DataSyncService] 初始化完成');
    }
    
    /**
     * 建立 WebSocket 连接
     */
    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }
        
        const token = this._getToken();
        const agentId = this._getAgentId();
        const channels = this.options.channels.join(',');
        
        const wsUrl = `${this.options.wsUrl}?agentId=${agentId}&token=${token}&channels=${channels}`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('[DataSyncService] WebSocket 已连接');
                this.wsConnected = true;
                this.reconnectAttempts = 0;
                
                // 触发连接成功事件
                this.dispatchEvent(new CustomEvent('connected'));
                
                // 连接成功后进行增量同步
                this.incrementalSync();
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this._handleMessage(message);
                } catch (error) {
                    console.error('[DataSyncService] 消息解析错误:', error);
                }
            };
            
            this.ws.onclose = (event) => {
                console.log('[DataSyncService] WebSocket 已断开:', event.code, event.reason);
                this.wsConnected = false;
                
                // 触发断开事件
                this.dispatchEvent(new CustomEvent('disconnected', { 
                    detail: { code: event.code, reason: event.reason }
                }));
                
                // 尝试重连
                this._scheduleReconnect();
            };
            
            this.ws.onerror = (error) => {
                console.error('[DataSyncService] WebSocket 错误:', error);
                this.dispatchEvent(new CustomEvent('error', { detail: error }));
            };
            
        } catch (error) {
            console.error('[DataSyncService] 连接失败:', error);
            this._scheduleReconnect();
        }
    }
    
    /**
     * 断开连接
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.wsConnected = false;
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    
    /**
     * 订阅频道
     * @param {string|string[]} channels - 频道名称
     */
    subscribe(channels) {
        const channelList = Array.isArray(channels) ? channels : [channels];
        
        if (this.wsConnected) {
            this.ws.send(JSON.stringify({
                type: 'subscribe',
                data: { channels: channelList }
            }));
        }
        
        // 更新本地频道列表
        channelList.forEach(ch => {
            if (!this.options.channels.includes(ch)) {
                this.options.channels.push(ch);
            }
        });
    }
    
    /**
     * 取消订阅频道
     * @param {string|string[]} channels - 频道名称
     */
    unsubscribe(channels) {
        const channelList = Array.isArray(channels) ? channels : [channels];
        
        if (this.wsConnected) {
            this.ws.send(JSON.stringify({
                type: 'unsubscribe',
                data: { channels: channelList }
            }));
        }
        
        // 更新本地频道列表
        this.options.channels = this.options.channels.filter(ch => !channelList.includes(ch));
    }
    
    /**
     * 增量同步
     */
    async incrementalSync() {
        if (this.syncInProgress) return;
        
        this.syncInProgress = true;
        
        try {
            const since = this.lastSyncTime || new Date(Date.now() - 3600000).toISOString();
            
            const response = await fetch(`${this.options.apiBase}/tasks/changes?since=${encodeURIComponent(since)}`);
            
            if (!response.ok) {
                throw new Error(`同步请求失败: ${response.status}`);
            }
            
            const data = await response.json();
            
            // 应用变更
            if (data.changes && data.changes.length > 0) {
                this._applyChanges(data.changes);
            }
            
            this.lastSyncTime = new Date().toISOString();
            this._saveLastSyncTime();
            
            console.log(`[DataSyncService] 增量同步完成，获取 ${data.changes?.length || 0} 条变更`);
            
            // 触发同步完成事件
            this.dispatchEvent(new CustomEvent('sync', { 
                detail: { changes: data.changes, count: data.changes?.length || 0 }
            }));
            
        } catch (error) {
            console.error('[DataSyncService] 增量同步失败:', error);
            this.dispatchEvent(new CustomEvent('syncError', { detail: error }));
        } finally {
            this.syncInProgress = false;
        }
    }
    
    /**
     * 启动定期同步
     */
    startPeriodicSync() {
        if (this.syncTimer) return;
        
        this.syncTimer = setInterval(() => {
            if (this.wsConnected) {
                this.incrementalSync();
            }
        }, this.options.syncInterval);
    }
    
    /**
     * 停止定期同步
     */
    stopPeriodicSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }
    
    /**
     * 更新任务（乐观更新）
     * @param {string} taskId - 任务 ID
     * @param {Object} updates - 更新内容
     * @returns {Promise<Object>} 更新后的任务
     */
    async updateTask(taskId, updates) {
        // 获取当前任务
        const task = this.cache.get(taskId);
        const currentVersion = task?._version || 0;
        
        // 乐观更新：立即更新本地缓存
        const optimisticTask = {
            ...task,
            ...updates,
            _version: currentVersion + 1,
            _pending: true
        };
        
        this.cache.set(taskId, optimisticTask);
        this.pendingUpdates.set(taskId, { updates, version: currentVersion });
        
        // 触发本地更新事件
        this.dispatchEvent(new CustomEvent('taskUpdate', { 
            detail: { taskId, task: optimisticTask, optimistic: true }
        }));
        
        // 发送更新请求
        try {
            const response = await fetch(`${this.options.apiBase}/tasks/${taskId}/versioned`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...updates,
                    _version: currentVersion
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                
                if (error.error === 'VERSION_CONFLICT') {
                    // 版本冲突：使用服务器版本
                    console.warn(`[DataSyncService] 版本冲突，使用服务器版本`);
                    
                    // 触发冲突事件
                    this.dispatchEvent(new CustomEvent('conflict', {
                        detail: {
                            taskId,
                            localTask: optimisticTask,
                            serverTask: error.task
                        }
                    }));
                    
                    // 使用服务器版本
                    this.cache.set(taskId, error.task);
                    this.dispatchEvent(new CustomEvent('taskUpdate', {
                        detail: { taskId, task: error.task, source: 'server' }
                    }));
                    
                    return error.task;
                }
                
                throw new Error(error.message || '更新失败');
            }
            
            const data = await response.json();
            const updatedTask = data.task;
            
            // 更新缓存
            this.cache.set(taskId, updatedTask);
            this.pendingUpdates.delete(taskId);
            this._saveCache();
            
            // 触发更新确认事件
            this.dispatchEvent(new CustomEvent('taskUpdate', {
                detail: { taskId, task: updatedTask, source: 'server', confirmed: true }
            }));
            
            return updatedTask;
            
        } catch (error) {
            console.error('[DataSyncService] 更新任务失败:', error);
            
            // 回滚乐观更新
            if (task) {
                this.cache.set(taskId, task);
            }
            this.pendingUpdates.delete(taskId);
            
            // 触发错误事件
            this.dispatchEvent(new CustomEvent('updateError', {
                detail: { taskId, error, originalTask: task }
            }));
            
            throw error;
        }
    }
    
    /**
     * 状态转换
     * @param {string} taskId - 任务 ID
     * @param {string} toStatus - 目标状态
     * @returns {Promise<Object>} 更新后的任务
     */
    async transitionTask(taskId, toStatus) {
        const task = this.cache.get(taskId);
        const currentVersion = task?._version || 0;
        
        // 乐观更新
        const optimisticTask = {
            ...task,
            status: toStatus,
            _version: currentVersion + 1,
            _pending: true
        };
        
        this.cache.set(taskId, optimisticTask);
        
        this.dispatchEvent(new CustomEvent('taskTransition', {
            detail: { taskId, fromStatus: task?.status, toStatus, optimistic: true }
        }));
        
        try {
            const response = await fetch(`${this.options.apiBase}/tasks/${taskId}/transition`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    toStatus,
                    version: currentVersion
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                
                if (error.error === 'VERSION_CONFLICT') {
                    this.dispatchEvent(new CustomEvent('conflict', {
                        detail: { taskId, localTask: optimisticTask, serverTask: error.task }
                    }));
                    
                    this.cache.set(taskId, error.task);
                    return error.task;
                }
                
                throw new Error(error.message || '状态转换失败');
            }
            
            const data = await response.json();
            const updatedTask = data.task;
            
            this.cache.set(taskId, updatedTask);
            this._saveCache();
            
            this.dispatchEvent(new CustomEvent('taskTransition', {
                detail: { taskId, task: updatedTask, confirmed: true }
            }));
            
            return updatedTask;
            
        } catch (error) {
            // 回滚
            if (task) {
                this.cache.set(taskId, task);
            }
            
            this.dispatchEvent(new CustomEvent('transitionError', {
                detail: { taskId, error, toStatus }
            }));
            
            throw error;
        }
    }
    
    /**
     * 获取任务
     * @param {string} taskId - 任务 ID
     * @returns {Object|null} 任务对象
     */
    getTask(taskId) {
        return this.cache.get(taskId) || null;
    }
    
    /**
     * 获取所有任务
     * @param {Object} filters - 过滤条件
     * @returns {Array} 任务列表
     */
    getTasks(filters = {}) {
        let tasks = Array.from(this.cache.values());
        
        if (filters.status) {
            const statusList = Array.isArray(filters.status) ? filters.status : [filters.status];
            tasks = tasks.filter(t => statusList.includes(t.status));
        }
        
        if (filters.agentId) {
            tasks = tasks.filter(t => t.assignedAgent === filters.agentId);
        }
        
        return tasks;
    }
    
    /**
     * 刷新所有任务
     */
    async refreshAll() {
        try {
            const response = await fetch(`${this.options.apiBase}/tasks?showCompleted=true`);
            
            if (!response.ok) {
                throw new Error('获取任务列表失败');
            }
            
            const data = await response.json();
            const tasks = data.tasks || [];
            
            // 更新缓存
            this.cache.clear();
            tasks.forEach(task => {
                this.cache.set(task.id, task);
            });
            
            this._saveCache();
            this.lastSyncTime = new Date().toISOString();
            this._saveLastSyncTime();
            
            this.dispatchEvent(new CustomEvent('refresh', { 
                detail: { count: tasks.length }
            }));
            
            console.log(`[DataSyncService] 刷新完成，共 ${tasks.length} 个任务`);
            
            return tasks;
            
        } catch (error) {
            console.error('[DataSyncService] 刷新失败:', error);
            throw error;
        }
    }
    
    /**
     * 处理 WebSocket 消息
     */
    _handleMessage(message) {
        const { type, data, timestamp } = message;
        
        switch (type) {
            case 'connected':
                console.log('[DataSyncService] 收到连接确认:', data);
                break;
                
            case 'task_started':
            case 'task_completed':
            case 'task_paused':
            case 'task_cancelled':
            case 'task_status_changed':
                this._handleTaskStatusChange(data);
                break;
                
            case 'task_version_conflict':
                this._handleVersionConflict(data);
                break;
                
            case 'task_step_progress':
            case 'task_step_completed':
                this._handleStepUpdate(data);
                break;
                
            case 'heartbeat':
            case 'pong':
                // 心跳响应，无需处理
                break;
                
            default:
                console.log('[DataSyncService] 未知消息类型:', type, data);
        }
        
        // 触发通用消息事件
        this.dispatchEvent(new CustomEvent('message', { detail: message }));
    }
    
    /**
     * 处理任务状态变更
     */
    _handleTaskStatusChange(data) {
        const { taskId, task, toStatus, fromStatus } = data;
        
        // 更新缓存
        if (task) {
            this.cache.set(taskId, task);
            this._saveCache();
        }
        
        // 触发状态变更事件
        this.dispatchEvent(new CustomEvent('taskStatusChange', {
            detail: { taskId, task, toStatus, fromStatus }
        }));
        
        console.log(`[DataSyncService] 任务状态变更: ${taskId} ${fromStatus} -> ${toStatus}`);
    }
    
    /**
     * 处理版本冲突
     */
    _handleVersionConflict(data) {
        const { taskId, serverVersion, serverTask } = data;
        
        // 使用服务器版本
        this.cache.set(taskId, serverTask);
        this._saveCache();
        
        // 触发冲突事件
        this.dispatchEvent(new CustomEvent('conflict', {
            detail: { taskId, serverVersion, serverTask }
        }));
        
        console.warn(`[DataSyncService] 收到版本冲突通知: ${taskId}`);
    }
    
    /**
     * 处理步骤更新
     */
    _handleStepUpdate(data) {
        const { taskId, stepIndex, progress, description } = data;
        
        const task = this.cache.get(taskId);
        if (task) {
            const updatedTask = {
                ...task,
                current_step: stepIndex,
                progress: progress || task.progress
            };
            
            if (task.breakdown && task.breakdown[stepIndex]) {
                updatedTask.breakdown = [...task.breakdown];
                updatedTask.breakdown[stepIndex] = {
                    ...task.breakdown[stepIndex],
                    status: 'running'
                };
            }
            
            this.cache.set(taskId, updatedTask);
            
            this.dispatchEvent(new CustomEvent('stepUpdate', {
                detail: { taskId, stepIndex, progress, description }
            }));
        }
    }
    
    /**
     * 应用变更
     */
    _applyChanges(changes) {
        changes.forEach(change => {
            const { taskId, changes: updates, toStatus } = change;
            
            const task = this.cache.get(taskId);
            if (task) {
                const updatedTask = { ...task, ...updates };
                this.cache.set(taskId, updatedTask);
            }
        });
        
        this._saveCache();
        
        this.dispatchEvent(new CustomEvent('changesApplied', {
            detail: { count: changes.length }
        }));
    }
    
    /**
     * 计划重连
     */
    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            console.error('[DataSyncService] 达到最大重连次数');
            this.dispatchEvent(new CustomEvent('reconnectFailed'));
            return;
        }
        
        if (this.reconnectTimer) return;
        
        this.reconnectAttempts++;
        const delay = this.options.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);
        
        console.log(`[DataSyncService] ${delay}ms 后进行第 ${this.reconnectAttempts} 次重连`);
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }
    
    /**
     * 保存缓存到 localStorage
     */
    _saveCache() {
        try {
            const cacheData = {};
            this.cache.forEach((value, key) => {
                cacheData[key] = value;
            });
            localStorage.setItem('taskSyncCache', JSON.stringify(cacheData));
        } catch (error) {
            console.warn('[DataSyncService] 保存缓存失败:', error);
        }
    }
    
    /**
     * 从 localStorage 恢复缓存
     */
    _restoreCache() {
        try {
            const cacheData = localStorage.getItem('taskSyncCache');
            if (cacheData) {
                const parsed = JSON.parse(cacheData);
                Object.entries(parsed).forEach(([key, value]) => {
                    this.cache.set(key, value);
                });
                console.log(`[DataSyncService] 恢复了 ${this.cache.size} 个缓存条目`);
            }
        } catch (error) {
            console.warn('[DataSyncService] 恢复缓存失败:', error);
        }
    }
    
    /**
     * 保存最后同步时间
     */
    _saveLastSyncTime() {
        try {
            localStorage.setItem('taskLastSyncTime', this.lastSyncTime);
        } catch (error) {
            console.warn('[DataSyncService] 保存同步时间失败:', error);
        }
    }
    
    /**
     * 获取 Token
     */
    _getToken() {
        return localStorage.getItem('taskSyncToken') || 'tui-default';
    }
    
    /**
     * 获取 Agent ID
     */
    _getAgentId() {
        return localStorage.getItem('taskSyncAgentId') || 'ui-client';
    }
    
    /**
     * 设置认证信息
     */
    setAuth(token, agentId) {
        localStorage.setItem('taskSyncToken', token);
        localStorage.setItem('taskSyncAgentId', agentId);
    }
    
    /**
     * 销毁服务
     */
    destroy() {
        this.disconnect();
        this.stopPeriodicSync();
        this.cache.clear();
        this.pendingUpdates.clear();
    }
}

// 导出单例
const dataSyncService = new DataSyncService();

// 同时导出类和单例
window.DataSyncService = DataSyncService;
window.dataSyncService = dataSyncService;

export { DataSyncService, dataSyncService };
export default dataSyncService;