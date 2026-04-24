/**
 * QueueService 集成模块
 * 整合内存管理和查询索引优化
 * 
 * 特性：
 * - 使用 LRU Cache 替代普通 Map
 * - 内存上限配置和监控
 * - O(1) 复杂度的步骤查询
 * - 索引数据结构支持
 * 
 * @module QueueServiceOptimized
 */

const MemoryManager = require('./memory-manager');
const QueryIndex = require('./query-index');
const EventEmitter = require('events');

class QueueServiceOptimized extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // 配置
    this.options = {
      maxTasks: options.maxTasks || 10000,
      maxMemoryMB: options.maxMemoryMB || 512,
      warningThreshold: options.warningThreshold || 0.8,
      enableIndex: options.enableIndex !== false, // 默认启用
      ...options
    };
    
    // 初始化内存管理器
    this.memoryManager = new MemoryManager({
      maxTasks: this.options.maxTasks,
      maxMemoryMB: this.options.maxMemoryMB,
      warningThreshold: this.options.warningThreshold
    });
    
    // 初始化查询索引
    this.queryIndex = this.options.enableIndex ? new QueryIndex() : null;
    
    // Agent 队列
    this.agentQueues = new Map(); // agentId -> { maxQueue, currentTasks: [], completed }
    
    // 事件转发
    this._setupEventForwarding();
    
    // 初始化
    this.emit('initialized');
  }

  /**
   * 设置事件转发
   * @private
   */
  _setupEventForwarding() {
    // 内存预警
    this.memoryManager.on('memory:warning', (info) => {
      this.emit('memory:warning', info);
    });
    
    // 内存状态
    this.memoryManager.on('memory:status', (info) => {
      this.emit('memory:status', info);
    });
    
    // 缓存淘汰
    this.memoryManager.on('evict', ({ key, value, reason }) => {
      // 从索引中移除
      if (this.queryIndex) {
        this.queryIndex.removeTask(key, value);
      }
      this.emit('task:evicted', { taskId: key, reason });
    });
  }

  // ==================== 任务操作 ====================

  /**
   * 创建任务
   * @param {Object} taskData - 任务数据
   * @returns {Object} 创建的任务
   */
  createTask(taskData) {
    const task = {
      id: taskData.id || this._generateId(),
      title: taskData.title,
      description: taskData.description,
      priority: taskData.priority || 'P2',
      status: 'pending',
      assignedAgent: taskData.assignedAgent || null,
      breakdown: taskData.breakdown || [],
      createdAt: new Date().toISOString(),
      ...taskData
    };
    
    // 存储到内存管理器
    this.memoryManager.set(task.id, task);
    
    // 添加到索引
    if (this.queryIndex) {
      this.queryIndex.addTask(task);
    }
    
    this.emit('task:created', { task });
    return task;
  }

  /**
   * 获取任务
   * @param {string} taskId - 任务ID
   * @returns {Object|null}
   */
  getTask(taskId) {
    return this.memoryManager.get(taskId);
  }

  /**
   * 更新任务
   * @param {string} taskId - 任务ID
   * @param {Object} updates - 更新字段
   * @returns {Object|null}
   */
  updateTask(taskId, updates) {
    const task = this.memoryManager.get(taskId);
    if (!task) return null;
    
    const oldAgent = task.assignedAgent;
    
    // 更新字段
    Object.assign(task, updates);
    task.updatedAt = new Date().toISOString();
    
    // 重新存储（触发 LRU 更新）
    this.memoryManager.set(taskId, task);
    
    // 更新索引
    if (this.queryIndex) {
      if (updates.assignedAgent && oldAgent !== updates.assignedAgent) {
        this.queryIndex.updateTaskAssignment(taskId, oldAgent, updates.assignedAgent);
      }
      
      if (updates.breakdown) {
        updates.breakdown.forEach((step, stepIndex) => {
          this.queryIndex.updateStepIndex(taskId, stepIndex, step.status, task);
        });
      }
    }
    
    this.emit('task:updated', { taskId, updates });
    return task;
  }

  /**
   * 更新步骤状态
   * @param {string} taskId - 任务ID
   * @param {number} stepIndex - 步骤索引
   * @param {string} status - 新状态
   * @param {Object} result - 执行结果（可选）
   * @returns {boolean}
   */
  updateStepStatus(taskId, stepIndex, status, result = null) {
    const task = this.memoryManager.get(taskId);
    if (!task || !task.breakdown || !task.breakdown[stepIndex]) {
      return false;
    }
    
    const step = task.breakdown[stepIndex];
    step.status = status;
    
    if (status === 'doing') {
      step.startedAt = new Date().toISOString();
    } else if (status === 'completed' || status === 'failed') {
      step.completedAt = new Date().toISOString();
      if (result) step.result = result;
    }
    
    // 重新存储
    this.memoryManager.set(taskId, task);
    
    // 更新索引
    if (this.queryIndex) {
      this.queryIndex.updateStepIndex(taskId, stepIndex, status, task);
    }
    
    // 更新任务整体状态
    this._updateTaskStatus(task);
    
    this.emit('step:updated', { taskId, stepIndex, status });
    return true;
  }

  /**
   * 删除任务
   * @param {string} taskId - 任务ID
   * @returns {boolean}
   */
  deleteTask(taskId) {
    const task = this.memoryManager.get(taskId);
    if (!task) return false;
    
    // 从索引移除
    if (this.queryIndex) {
      this.queryIndex.removeTask(taskId, task);
    }
    
    // 从内存管理器移除
    this.memoryManager.delete(taskId);
    
    this.emit('task:deleted', { taskId });
    return true;
  }

  // ==================== 队列操作 ====================

  /**
   * 获取 Agent 队列
   * @param {string} agentId - AgentID
   * @returns {Object}
   */
  getQueue(agentId) {
    if (!this.agentQueues.has(agentId)) {
      this.agentQueues.set(agentId, {
        maxQueue: 5,
        currentTasks: [],
        completed: 0
      });
    }
    return this.agentQueues.get(agentId);
  }

  /**
   * 任务入队
   * @param {string} agentId - AgentID
   * @param {string} taskId - 任务ID
   * @returns {boolean}
   */
  enqueue(agentId, taskId) {
    const queue = this.getQueue(agentId);
    
    // 检查容量
    if (queue.currentTasks.length >= queue.maxQueue) {
      this.emit('queue:full', { agentId, taskId });
      return false;
    }
    
    // 检查是否已在队列中
    if (queue.currentTasks.includes(taskId)) {
      return false;
    }
    
    // 添加到队列
    queue.currentTasks.push(taskId);
    
    // 更新任务
    const task = this.memoryManager.get(taskId);
    if (task) {
      task.assignedAgent = agentId;
      task.queuedAt = new Date().toISOString();
      this.memoryManager.set(taskId, task);
      
      // 更新索引
      if (this.queryIndex) {
        this.queryIndex.updateTaskAssignment(taskId, null, agentId);
      }
    }
    
    this.emit('task:enqueued', { agentId, taskId });
    return true;
  }

  /**
   * 任务出队
   * @param {string} agentId - AgentID
   * @returns {Object|null}
   */
  dequeue(agentId) {
    const queue = this.getQueue(agentId);
    const taskId = queue.currentTasks.shift();
    
    if (taskId) {
      this.emit('task:dequeued', { agentId, taskId });
      return this.memoryManager.get(taskId);
    }
    
    return null;
  }

  /**
   * 查看队首任务
   * @param {string} agentId - AgentID
   * @returns {Object|null}
   */
  peek(agentId) {
    const queue = this.getQueue(agentId);
    const taskId = queue.currentTasks[0];
    return taskId ? this.memoryManager.get(taskId) : null;
  }

  // ==================== O(1) 查询方法 ====================

  /**
   * 获取下一个可执行步骤（O(1)）
   * @param {string} agentId - AgentID
   * @returns {Object|null}
   */
  getNextExecutableStep(agentId) {
    if (!this.queryIndex) {
      // 降级到线性搜索
      return this._getNextExecutableStepLinear(agentId);
    }
    
    return this.queryIndex.getNextExecutableStep(agentId, (taskId, stepIndex) => {
      return this._canExecuteStep(taskId, stepIndex);
    });
  }

  /**
   * 获取 Agent 的所有任务
   * @param {string} agentId - AgentID
   * @returns {Array}
   */
  getAgentTasks(agentId) {
    if (this.queryIndex) {
      const taskIds = this.queryIndex.getAgentTasks(agentId);
      return Array.from(taskIds).map(id => this.memoryManager.get(id)).filter(Boolean);
    }
    
    // 降级到线性搜索
    const tasks = [];
    for (const taskId of this.memoryManager.keys()) {
      const task = this.memoryManager.get(taskId);
      if (task && task.assignedAgent === agentId) {
        tasks.push(task);
      }
    }
    return tasks;
  }

  /**
   * 获取状态的步骤列表
   * @param {string} status - 状态
   * @returns {Array}
   */
  getStepsByStatus(status) {
    if (this.queryIndex) {
      const stepKeys = this.queryIndex.getStepsByStatus(status);
      return Array.from(stepKeys).map(key => {
        const [taskId, stepIndex] = key.split(':');
        return { taskId, stepIndex: parseInt(stepIndex) };
      });
    }
    
    // 降级到线性搜索
    const steps = [];
    for (const taskId of this.memoryManager.keys()) {
      const task = this.memoryManager.get(taskId);
      if (task && task.breakdown) {
        task.breakdown.forEach((step, stepIndex) => {
          if (step.status === status) {
            steps.push({ taskId, stepIndex });
          }
        });
      }
    }
    return steps;
  }

  // ==================== 状态查询 ====================

  /**
   * 获取服务状态
   * @returns {Object}
   */
  getStatus() {
    return {
      memory: this.memoryManager.getStatus(),
      index: this.queryIndex ? this.queryIndex.getStats() : null,
      queues: this._getQueueStats(),
      options: this.options
    };
  }

  /**
   * 获取队列统计
   * @private
   */
  _getQueueStats() {
    const stats = {};
    for (const [agentId, queue] of this.agentQueues) {
      stats[agentId] = {
        total: queue.currentTasks.length,
        max: queue.maxQueue,
        utilization: (queue.currentTasks.length / queue.maxQueue * 100).toFixed(2) + '%'
      };
    }
    return stats;
  }

  // ==================== 辅助方法 ====================

  /**
   * 更新任务整体状态
   * @private
   */
  _updateTaskStatus(task) {
    const steps = task.breakdown || [];
    const completed = steps.filter(s => s.status === 'completed').length;
    const failed = steps.filter(s => s.status === 'failed').length;
    
    task.completedSteps = completed;
    
    if (completed === steps.length) {
      task.status = 'completed';
    } else if (failed > 0) {
      task.status = 'failed';
    } else if (steps.some(s => s.status === 'doing')) {
      task.status = 'doing';
    }
  }

  /**
   * 检查步骤是否可以执行
   * @private
   */
  _canExecuteStep(taskId, stepIndex) {
    const task = this.memoryManager.get(taskId);
    if (!task || !task.breakdown) return false;
    
    const step = task.breakdown[stepIndex];
    if (!step || step.status !== 'pending') return false;
    
    // 检查依赖
    const deps = step.dependencies || [];
    return deps.every(depNum => {
      const dep = task.breakdown.find(s => s.step === depNum);
      return dep && dep.status === 'completed';
    });
  }

  /**
   * 线性搜索获取下一个可执行步骤（降级方案）
   * @private
   */
  _getNextExecutableStepLinear(agentId) {
    const queue = this.getQueue(agentId);
    
    for (const taskId of queue.currentTasks) {
      const task = this.memoryManager.get(taskId);
      if (!task || !task.breakdown) continue;
      
      for (let i = 0; i < task.breakdown.length; i++) {
        const step = task.breakdown[i];
        if (step.status === 'pending' && this._canExecuteStep(taskId, i)) {
          return { taskId, stepIndex: i, priority: 0 };
        }
      }
    }
    
    return null;
  }

  /**
   * 生成唯一ID
   * @private
   */
  _generateId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ==================== 批量操作 ====================

  /**
   * 批量创建任务
   * @param {Array} tasksData - 任务数据数组
   * @returns {Array}
   */
  createTasks(tasksData) {
    return tasksData.map(data => this.createTask(data));
  }

  /**
   * 批量入队
   * @param {Array} items - [{ agentId, taskId }]
   * @returns {Array}
   */
  enqueueBatch(items) {
    return items.map(({ agentId, taskId }) => ({
      agentId,
      taskId,
      success: this.enqueue(agentId, taskId)
    }));
  }

  /**
   * 重建索引
   */
  rebuildIndex() {
    if (!this.queryIndex) return;
    
    const tasks = new Map();
    for (const taskId of this.memoryManager.keys()) {
      const task = this.memoryManager.get(taskId);
      if (task) {
        tasks.set(taskId, task);
      }
    }
    
    this.queryIndex.rebuild(tasks);
    this.emit('index:rebuilt');
  }

  /**
   * 清空所有数据
   */
  clear() {
    this.memoryManager.clear();
    if (this.queryIndex) {
      this.queryIndex.clear();
    }
    this.agentQueues.clear();
    this.emit('cleared');
  }
}

module.exports = QueueServiceOptimized;
