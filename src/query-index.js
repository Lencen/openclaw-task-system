/**
 * 查询索引模块
 * 提供 O(1) 复杂度的任务和步骤查询
 * 
 * 索引结构：
 * - agentTaskIndex: agentId -> Set<taskId>
 * - pendingStepsIndex: agentId -> PriorityQueue
 * - statusIndex: status -> Set<taskId:stepIndex>
 * - priorityIndex: priority -> Set<taskId>
 * 
 * @module QueryIndex
 */

const PriorityQueue = require('./priority-queue');

class QueryIndex {
  constructor() {
    // Agent -> 任务列表索引
    this.agentTaskIndex = new Map();
    
    // Agent -> 待执行步骤优先队列
    this.pendingStepsIndex = new Map();
    
    // 状态 -> 步骤索引
    this.statusIndex = new Map();
    
    // 优先级 -> 任务索引
    this.priorityIndex = new Map();
    
    // 依赖关系索引
    this.dependencyIndex = new Map(); // taskId -> Set<dependentTaskId>
    
    // 统计信息
    this.stats = {
      indexHits: 0,
      indexMisses: 0,
      updates: 0
    };
  }

  // ==================== 索引更新 ====================

  /**
   * 添加任务到索引
   * @param {Object} task - 任务对象
   */
  addTask(task) {
    if (!task || !task.id) return;
    
    // 添加到 Agent 索引
    if (task.assignedAgent) {
      this._addToAgentIndex(task.assignedAgent, task.id);
    }
    
    // 添加到优先级索引
    if (task.priority) {
      this._addToPriorityIndex(task.priority, task.id);
    }
    
    // 索引步骤
    if (task.breakdown && Array.isArray(task.breakdown)) {
      task.breakdown.forEach((step, stepIndex) => {
        this.updateStepIndex(task.id, stepIndex, step.status, task);
      });
    }
    
    this.stats.updates++;
  }

  /**
   * 从索引中移除任务
   * @param {string} taskId - 任务ID
   * @param {Object} task - 任务对象（可选）
   */
  removeTask(taskId, task = null) {
    // 从 Agent 索引移除
    if (task && task.assignedAgent) {
      this._removeFromAgentIndex(task.assignedAgent, taskId);
    } else {
      // 遍历查找并移除
      for (const [agentId, taskSet] of this.agentTaskIndex) {
        if (taskSet.has(taskId)) {
          taskSet.delete(taskId);
          break;
        }
      }
    }
    
    // 从优先级索引移除
    if (task && task.priority) {
      this._removeFromPriorityIndex(task.priority, taskId);
    }
    
    // 从状态索引移除所有相关步骤
    for (const [status, stepSet] of this.statusIndex) {
      for (const stepKey of stepSet) {
        if (stepKey.startsWith(`${taskId}:`)) {
          stepSet.delete(stepKey);
        }
      }
    }
    
    // 从待执行步骤索引移除
    for (const [agentId, queue] of this.pendingStepsIndex) {
      queue.remove(item => item.taskId === taskId);
    }
    
    this.stats.updates++;
  }

  /**
   * 更新步骤索引
   * @param {string} taskId - 任务ID
   * @param {number} stepIndex - 步骤索引
   * @param {string} newStatus - 新状态
   * @param {Object} task - 任务对象
   */
  updateStepIndex(taskId, stepIndex, newStatus, task) {
    const stepKey = `${taskId}:${stepIndex}`;
    
    // 从旧状态索引移除
    for (const [status, stepSet] of this.statusIndex) {
      if (stepSet.has(stepKey)) {
        stepSet.delete(stepKey);
        break;
      }
    }
    
    // 添加到新状态索引
    if (!this.statusIndex.has(newStatus)) {
      this.statusIndex.set(newStatus, new Set());
    }
    this.statusIndex.get(newStatus).add(stepKey);
    
    // 更新待执行步骤索引
    if (newStatus === 'pending' && task && task.assignedAgent) {
      this._addToPendingSteps(task.assignedAgent, taskId, stepIndex, task);
    }
    
    this.stats.updates++;
  }

  /**
   * 更新任务分配
   * @param {string} taskId - 任务ID
   * @param {string} oldAgentId - 原AgentID
   * @param {string} newAgentId - 新AgentID
   */
  updateTaskAssignment(taskId, oldAgentId, newAgentId) {
    if (oldAgentId) {
      this._removeFromAgentIndex(oldAgentId, taskId);
    }
    if (newAgentId) {
      this._addToAgentIndex(newAgentId, taskId);
    }
    this.stats.updates++;
  }

  // ==================== O(1) 查询方法 ====================

  /**
   * 获取 Agent 的所有任务ID（O(1)）
   * @param {string} agentId - AgentID
   * @returns {Set<string>}
   */
  getAgentTasks(agentId) {
    const tasks = this.agentTaskIndex.get(agentId);
    if (tasks) {
      this.stats.indexHits++;
      return new Set(tasks);
    }
    this.stats.indexMisses++;
    return new Set();
  }

  /**
   * 获取状态的步骤列表（O(1)）
   * @param {string} status - 状态
   * @returns {Set<string>} 步骤键集合 taskId:stepIndex
   */
  getStepsByStatus(status) {
    const steps = this.statusIndex.get(status);
    if (steps) {
      this.stats.indexHits++;
      return new Set(steps);
    }
    this.stats.indexMisses++;
    return new Set();
  }

  /**
   * 获取优先级的任务列表（O(1)）
   * @param {string} priority - 优先级
   * @returns {Set<string>}
   */
  getTasksByPriority(priority) {
    const tasks = this.priorityIndex.get(priority);
    if (tasks) {
      this.stats.indexHits++;
      return new Set(tasks);
    }
    this.stats.indexMisses++;
    return new Set();
  }

  /**
   * 获取下一个可执行步骤（O(1) 平均）
   * @param {string} agentId - AgentID
   * @param {Function} canExecuteFn - 检查步骤是否可以执行的函数
   * @returns {Object|null} { taskId, stepIndex, priority }
   */
  getNextExecutableStep(agentId, canExecuteFn) {
    const queue = this.pendingStepsIndex.get(agentId);
    if (!queue || queue.isEmpty()) {
      return null;
    }
    
    // 检查队首
    let item = queue.peek();
    let attempts = 0;
    const maxAttempts = queue.size; // 防止无限循环
    
    while (item && attempts < maxAttempts) {
      if (canExecuteFn(item.taskId, item.stepIndex)) {
        this.stats.indexHits++;
        return item;
      }
      
      // 依赖未满足，移除并检查下一个
      queue.pop();
      item = queue.peek();
      attempts++;
    }
    
    this.stats.indexMisses++;
    return null;
  }

  /**
   * 获取 Agent 的待执行步骤数量（O(1)）
   * @param {string} agentId - AgentID
   * @returns {number}
   */
  getPendingStepsCount(agentId) {
    const queue = this.pendingStepsIndex.get(agentId);
    return queue ? queue.size : 0;
  }

  /**
   * 检查任务是否存在（O(1)）
   * @param {string} taskId - 任务ID
   * @returns {boolean}
   */
  hasTask(taskId) {
    for (const taskSet of this.agentTaskIndex.values()) {
      if (taskSet.has(taskId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查步骤状态（O(1)）
   * @param {string} taskId - 任务ID
   * @param {number} stepIndex - 步骤索引
   * @returns {string|null} 状态
   */
  getStepStatus(taskId, stepIndex) {
    const stepKey = `${taskId}:${stepIndex}`;
    for (const [status, stepSet] of this.statusIndex) {
      if (stepSet.has(stepKey)) {
        return status;
      }
    }
    return null;
  }

  // ==================== 批量查询 ====================

  /**
   * 获取所有 Agent 的任务统计
   * @returns {Map<string, number>}
   */
  getAllAgentStats() {
    const stats = new Map();
    for (const [agentId, taskSet] of this.agentTaskIndex) {
      const pendingCount = this.getPendingStepsCount(agentId);
      stats.set(agentId, {
        totalTasks: taskSet.size,
        pendingSteps: pendingCount
      });
    }
    return stats;
  }

  /**
   * 获取所有状态统计
   * @returns {Map<string, number>}
   */
  getStatusStats() {
    const stats = new Map();
    for (const [status, stepSet] of this.statusIndex) {
      stats.set(status, stepSet.size);
    }
    return stats;
  }

  // ==================== 辅助方法 ====================

  /**
   * 添加到 Agent 索引
   * @private
   */
  _addToAgentIndex(agentId, taskId) {
    if (!this.agentTaskIndex.has(agentId)) {
      this.agentTaskIndex.set(agentId, new Set());
    }
    this.agentTaskIndex.get(agentId).add(taskId);
  }

  /**
   * 从 Agent 索引移除
   * @private
   */
  _removeFromAgentIndex(agentId, taskId) {
    const taskSet = this.agentTaskIndex.get(agentId);
    if (taskSet) {
      taskSet.delete(taskId);
      if (taskSet.size === 0) {
        this.agentTaskIndex.delete(agentId);
      }
    }
  }

  /**
   * 添加到优先级索引
   * @private
   */
  _addToPriorityIndex(priority, taskId) {
    if (!this.priorityIndex.has(priority)) {
      this.priorityIndex.set(priority, new Set());
    }
    this.priorityIndex.get(priority).add(taskId);
  }

  /**
   * 从优先级索引移除
   * @private
   */
  _removeFromPriorityIndex(priority, taskId) {
    const taskSet = this.priorityIndex.get(priority);
    if (taskSet) {
      taskSet.delete(taskId);
      if (taskSet.size === 0) {
        this.priorityIndex.delete(priority);
      }
    }
  }

  /**
   * 添加到待执行步骤索引
   * @private
   */
  _addToPendingSteps(agentId, taskId, stepIndex, task) {
    if (!this.pendingStepsIndex.has(agentId)) {
      this.pendingStepsIndex.set(agentId, new PriorityQueue());
    }
    
    const queue = this.pendingStepsIndex.get(agentId);
    const priority = this._calculatePriority(task);
    
    queue.push({
      taskId,
      stepIndex,
      priority,
      addedAt: Date.now()
    });
  }

  /**
   * 计算任务优先级数值
   * @private
   */
  _calculatePriority(task) {
    const priorityMap = {
      'P0': 0,
      'P1': 1,
      'P2': 2,
      'P3': 3
    };
    return priorityMap[task.priority] || 999;
  }

  // ==================== 索引维护 ====================

  /**
   * 清空所有索引
   */
  clear() {
    this.agentTaskIndex.clear();
    this.pendingStepsIndex.clear();
    this.statusIndex.clear();
    this.priorityIndex.clear();
    this.dependencyIndex.clear();
    this.stats = {
      indexHits: 0,
      indexMisses: 0,
      updates: 0
    };
  }

  /**
   * 重建索引
   * @param {Map<string, Object>} tasks - 任务 Map
   */
  rebuild(tasks) {
    this.clear();
    
    for (const [taskId, task] of tasks) {
      this.addTask(task);
    }
  }

  /**
   * 获取索引统计信息
   * @returns {Object}
   */
  getStats() {
    const total = this.stats.indexHits + this.stats.indexMisses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.indexHits / total * 100).toFixed(2) + '%' : '0%',
      agentCount: this.agentTaskIndex.size,
      statusCount: this.statusIndex.size,
      pendingQueuesCount: this.pendingStepsIndex.size
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      indexHits: 0,
      indexMisses: 0,
      updates: 0
    };
  }
}

module.exports = QueryIndex;
