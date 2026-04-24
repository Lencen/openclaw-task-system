/**
 * War Room v3 - 任务快速操作面板
 * 
 * 提供任务的一键启动、暂停、重试功能
 */

// 任务操作 API 封装
const taskOperations = {
    /**
     * 启动任务
     */
    async startTask(taskId) {
        try {
            const response = await fetch(`/api/tasks/${taskId}/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    taskId,
                    agentId: 'auto', // 自动分配
                    action: 'start'
                })
            });
            
            const data = await response.json();
            
            if (data.code === 200 || data.success) {
                addLog('success', `任务 ${taskId} 启动成功`);
                return { success: true, data };
            } else {
                addLog('error', `任务 ${taskId} 启动失败: ${data.error?.message || '未知错误'}`);
                return { success: false, error: data.error };
            }
        } catch (error) {
            addLog('error', `启动任务 ${taskId} 时发生错误: ${error.message}`);
            return { success: false, error: error.message };
        }
    },

    /**
     * 暂停任务
     */
    async pauseTask(taskId) {
        try {
            const response = await fetch(`/api/tasks/${taskId}/pause`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    taskId,
                    action: 'pause'
                })
            });
            
            const data = await response.json();
            
            if (data.code === 200 || data.success) {
                addLog('info', `任务 ${taskId} 暂停成功`);
                return { success: true, data };
            } else {
                addLog('error', `任务 ${taskId} 暂停失败: ${data.error?.message || '未知错误'}`);
                return { success: false, error: data.error };
            }
        } catch (error) {
            addLog('error', `暂停任务 ${taskId} 时发生错误: ${error.message}`);
            return { success: false, error: error.message };
        }
    },

    /**
     * 重试任务
     */
    async retryTask(taskId) {
        try {
            const response = await fetch(`/api/tasks/${taskId}/retry`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.code === 200 || data.success) {
                addLog('success', `任务 ${taskId} 重试成功`);
                return { success: true, data };
            } else {
                addLog('error', `任务 ${taskId} 重试失败: ${data.error?.message || '未知错误'}`);
                return { success: false, error: data.error };
            }
        } catch (error) {
            addLog('error', `重试任务 ${taskId} 时发生错误: ${error.message}`);
            return { success: false, error: error.message };
        }
    },

    /**
     * 取消任务
     */
    async cancelTask(taskId) {
        try {
            const response = await fetch(`/api/tasks/${taskId}/cancel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.code === 200 || data.success) {
                addLog('info', `任务 ${taskId} 取消成功`);
                return { success: true, data };
            } else {
                addLog('error', `任务 ${taskId} 取消失败: ${data.error?.message || '未知错误'}`);
                return { success: false, error: data.error };
            }
        } catch (error) {
            addLog('error', `取消任务 ${taskId} 时发生错误: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
};

// 任务快速操作面板组件
class TaskQuickPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.taskList = [];
        this.init();
    }

    init() {
        this.render();
        this.bindEvents();
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <span class="card-title">
                        <span>⚡</span>
                        任务快速操作
                    </span>
                </div>
                <div class="card-body">
                    <div class="quick-actions-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                        <button class="quick-btn" id="quickStartAll" title="启动所有待处理任务">
                            <span class="quick-btn-icon">▶️</span>
                            <span>全部启动</span>
                        </button>
                        <button class="quick-btn" id="quickPauseAll" title="暂停所有进行中任务">
                            <span class="quick-btn-icon">⏸️</span>
                            <span>全部暂停</span>
                        </button>
                        <button class="quick-btn" id="quickRetryAll" title="重试所有失败任务">
                            <span class="quick-btn-icon">🔄</span>
                            <span>全部重试</span>
                        </button>
                        <button class="quick-btn" id="quickCancelAll" title="取消所有待处理任务">
                            <span class="quick-btn-icon">❌</span>
                            <span>全部取消</span>
                        </button>
                    </div>
                    
                    <div style="margin-top: 16px; border-top: 1px solid var(--border); padding-top: 16px;">
                        <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">单任务操作</div>
                        <div class="single-task-controls" style="display: flex; gap: 8px;">
                            <input type="text" id="taskIdInput" placeholder="输入任务ID..." style="flex: 1; padding: 8px 12px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary);">
                            <button class="header-btn" id="startTaskBtn" style="background: var(--success); color: white;">启动</button>
                            <button class="header-btn" id="pauseTaskBtn" style="background: var(--warning); color: white;">暂停</button>
                            <button class="header-btn" id="retryTaskBtn" style="background: var(--primary); color: white;">重试</button>
                            <button class="header-btn" id="cancelTaskBtn" style="background: var(--danger); color: white;">取消</button>
                        </div>
                    </div>
                    
                    <div style="margin-top: 16px;">
                        <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">任务状态统计</div>
                        <div class="task-stats" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                            <div class="stat-card" style="padding: 8px 12px;">
                                <div class="stat-label">待处理</div>
                                <div class="stat-value" id="pendingCount">0</div>
                            </div>
                            <div class="stat-card" style="padding: 8px 12px;">
                                <div class="stat-label">进行中</div>
                                <div class="stat-value" id="runningCount">0</div>
                            </div>
                            <div class="stat-card" style="padding: 8px 12px;">
                                <div class="stat-label">已完成</div>
                                <div class="stat-value" id="completedCount">0</div>
                            </div>
                            <div class="stat-card" style="padding: 8px 12px;">
                                <div class="stat-label">失败</div>
                                <div class="stat-value" id="failedCount">0</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    bindEvents() {
        // 批量操作按钮
        document.getElementById('quickStartAll')?.addEventListener('click', () => this.startAllTasks());
        document.getElementById('quickPauseAll')?.addEventListener('click', () => this.pauseAllTasks());
        document.getElementById('quickRetryAll')?.addEventListener('click', () => this.retryAllTasks());
        document.getElementById('quickCancelAll')?.addEventListener('click', () => this.cancelAllTasks());

        // 单任务操作按钮
        document.getElementById('startTaskBtn')?.addEventListener('click', () => this.handleSingleTaskAction('start'));
        document.getElementById('pauseTaskBtn')?.addEventListener('click', () => this.handleSingleTaskAction('pause'));
        document.getElementById('retryTaskBtn')?.addEventListener('click', () => this.handleSingleTaskAction('retry'));
        document.getElementById('cancelTaskBtn')?.addEventListener('click', () => this.handleSingleTaskAction('cancel'));

        // 回车键支持
        document.getElementById('taskIdInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSingleTaskAction('start'); // 默认启动
            }
        });
    }

    async handleSingleTaskAction(action) {
        const taskId = document.getElementById('taskIdInput')?.value.trim();
        if (!taskId) {
            addLog('warn', '请输入任务ID');
            return;
        }

        let result;
        switch (action) {
            case 'start':
                result = await taskOperations.startTask(taskId);
                break;
            case 'pause':
                result = await taskOperations.pauseTask(taskId);
                break;
            case 'retry':
                result = await taskOperations.retryTask(taskId);
                break;
            case 'cancel':
                result = await taskOperations.cancelTask(taskId);
                break;
        }

        if (result.success) {
            // 清空输入框
            document.getElementById('taskIdInput').value = '';
            // 刷新数据
            setTimeout(() => loadData(), 1000);
        }
    }

    async startAllTasks() {
        // 获取所有待处理的任务
        try {
            const response = await fetch('/api/tasks?showCompleted=false');
            const data = await response.json();
            
            if (data.success || data.tasks) {
                const tasks = data.tasks || data.data?.tasks || [];
                const pendingTasks = tasks.filter(t => t.status === 'pending');
                
                if (pendingTasks.length === 0) {
                    addLog('info', '没有待处理的任务');
                    return;
                }

                addLog('info', `准备启动 ${pendingTasks.length} 个待处理任务`);

                // 逐个启动任务
                for (const task of pendingTasks) {
                    await taskOperations.startTask(task.id);
                    // 添加短暂延迟避免同时请求
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

                addLog('success', `已启动 ${pendingTasks.length} 个任务`);
                setTimeout(() => loadData(), 2000);
            }
        } catch (error) {
            addLog('error', `批量启动任务失败: ${error.message}`);
        }
    }

    async pauseAllTasks() {
        try {
            const response = await fetch('/api/tasks?showCompleted=false');
            const data = await response.json();
            
            if (data.success || data.tasks) {
                const tasks = data.tasks || data.data?.tasks || [];
                const runningTasks = tasks.filter(t => t.status === 'doing' || t.status === 'running');
                
                if (runningTasks.length === 0) {
                    addLog('info', '没有进行中的任务');
                    return;
                }

                addLog('info', `准备暂停 ${runningTasks.length} 个进行中任务`);

                // 逐个暂停任务
                for (const task of runningTasks) {
                    await taskOperations.pauseTask(task.id);
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

                addLog('info', `已暂停 ${runningTasks.length} 个任务`);
                setTimeout(() => loadData(), 2000);
            }
        } catch (error) {
            addLog('error', `批量暂停任务失败: ${error.message}`);
        }
    }

    async retryAllTasks() {
        try {
            const response = await fetch('/api/tasks?showCompleted=false');
            const data = await response.json();
            
            if (data.success || data.tasks) {
                const tasks = data.tasks || data.data?.tasks || [];
                const failedTasks = tasks.filter(t => t.status === 'failed' || t.status === 'error');
                
                if (failedTasks.length === 0) {
                    addLog('info', '没有失败的任务');
                    return;
                }

                addLog('info', `准备重试 ${failedTasks.length} 个失败任务`);

                // 逐个重试任务
                for (const task of failedTasks) {
                    await taskOperations.retryTask(task.id);
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

                addLog('success', `已重试 ${failedTasks.length} 个任务`);
                setTimeout(() => loadData(), 2000);
            }
        } catch (error) {
            addLog('error', `批量重试任务失败: ${error.message}`);
        }
    }

    async cancelAllTasks() {
        try {
            const response = await fetch('/api/tasks?showCompleted=false');
            const data = await response.json();
            
            if (data.success || data.tasks) {
                const tasks = data.tasks || data.data?.tasks || [];
                const pendingTasks = tasks.filter(t => t.status === 'pending');
                
                if (pendingTasks.length === 0) {
                    addLog('info', '没有待处理的任务');
                    return;
                }

                addLog('info', `准备取消 ${pendingTasks.length} 个待处理任务`);

                // 逐个取消任务
                for (const task of pendingTasks) {
                    await taskOperations.cancelTask(task.id);
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

                addLog('info', `已取消 ${pendingTasks.length} 个任务`);
                setTimeout(() => loadData(), 2000);
            }
        } catch (error) {
            addLog('error', `批量取消任务失败: ${error.message}`);
        }
    }

    updateTaskStats() {
        // 更新任务状态统计
        try {
            fetch('/api/tasks?showCompleted=true')
                .then(response => response.json())
                .then(data => {
                    const tasks = data.tasks || data.data?.tasks || [];
                    
                    const stats = {
                        pending: 0,
                        running: 0,
                        completed: 0,
                        failed: 0
                    };

                    tasks.forEach(task => {
                        switch (task.status) {
                            case 'pending':
                                stats.pending++;
                                break;
                            case 'doing':
                            case 'running':
                                stats.running++;
                                break;
                            case 'completed':
                                stats.completed++;
                                break;
                            case 'failed':
                            case 'error':
                                stats.failed++;
                                break;
                        }
                    });

                    document.getElementById('pendingCount').textContent = stats.pending;
                    document.getElementById('runningCount').textContent = stats.running;
                    document.getElementById('completedCount').textContent = stats.completed;
                    document.getElementById('failedCount').textContent = stats.failed;
                })
                .catch(error => {
                    console.error('更新任务统计失败:', error);
                });
        } catch (error) {
            console.error('更新任务统计失败:', error);
        }
    }

    // 定期更新统计
    startStatsUpdater() {
        setInterval(() => {
            this.updateTaskStats();
        }, 5000);
    }
}

// 初始化任务快速操作面板
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (document.getElementById('taskQuickPanel')) {
            const panel = new TaskQuickPanel('taskQuickPanel');
            panel.startStatsUpdater();
            panel.updateTaskStats();
        }
    }, 1000);
});

// 导出供其他模块使用
if (typeof window !== 'undefined') {
    window.taskOperations = taskOperations;
    window.TaskQuickPanel = TaskQuickPanel;
}