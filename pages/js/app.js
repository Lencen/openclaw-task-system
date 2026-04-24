/**
 * 任务管理平台 V3 - 前端脚本
 * 
 * @version 3.0.0
 * @created 2026-03-19
 */

const API_BASE = window.location.port === '8083' ? 'http://localhost:8083' : '';

// 状态常量
const STATUS = {
  pending: { label: '待处理', class: 'status-pending' },
  in_progress: { label: '进行中', class: 'status-in_progress' },
  completed: { label: '已完成', class: 'status-completed' },
  cancelled: { label: '已取消', class: 'status-cancelled' },
  paused: { label: '已暂停', class: 'status-paused' }
};

const PRIORITY = {
  P0: { label: 'P0 紧急', class: 'priority-P0' },
  P1: { label: 'P1 高', class: 'priority-P1' },
  P2: { label: 'P2 中', class: 'priority-P2' },
  P3: { label: 'P3 低', class: 'priority-P3' }
};

// API 工具函数
const API = {
  async request(endpoint, options = {}) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      const data = await response.json();
      // 兼容多种响应格式
      if (data.success === false) throw new Error(data.error || '请求失败');
      // 返回 data.data 或 data.tasks 或 data.projects 或 data 本身
      return data.data || data.tasks || data.projects || data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },
  
  // 产品
  getProducts() { return this.request('/api/products'); },
  
  // 任务
  getTasks(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/tasks${query ? '?' + query : ''}`);
  },
  getTask(id) { return this.request(`/api/tasks/${id}`); },
  createTask(data) { return this.request('/api/tasks', { method: 'POST', body: JSON.stringify(data) }); },
  updateTask(id, data) { return this.request(`/api/tasks/' + id, { method: 'PUT', body: JSON.stringify(data) }); },
  updateTaskStatus(id, status) { return this.request(`/api/tasks/' + id + '/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); },
  deleteTask(id) { return this.request('/api/tasks/' + id, { method: 'DELETE' }); },
  
  // 项目
  getProjects(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/work/projects${query ? '?' + query : ''}`);
  },
  createProject(data) { return this.request('/api/work/projects', { method: 'POST', body: JSON.stringify(data) }); },
  
  // 统计
  getTaskStats(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/tasks/stats${query ? '?' + query : ''}`);
  }
};


// 任务列表管理器
class TaskListManager {
  constructor() {
    this.tasks = [];
    this.stats = {};
    this.filters = {
      status: '',
      priority: '',
      project_id: '',
      limit: 50,
      offset: 0
    };
  }

  async load(params = {}) {
    const loadParams = { ...this.filters, ...params };

    try {
      this.tasks = await API.getTasks(loadParams);
      this.stats = await API.getTaskStats(loadParams);
      this.render();
    } catch (error) {
      console.error('加载任务失败:', error);
      showToast('加载任务失败', 'error');
    }
  }

  render() {
    const container = document.getElementById('task-list');
    if (!container) return;

    // 渲染统计
    this.renderStats();

    if (this.tasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-text">暂无任务</div>
        </div>
      `;
      return;
    }

    container.innerHTML = this.tasks.map(task => `
      <div class="task-item" onclick="app.showTaskDetail('${task.id}')">
        <span class="task-priority ${PRIORITY[task.priority]?.class || 'priority-P2'}">
          ${PRIORITY[task.priority]?.label || 'P2'}
        </span>
        <span class="task-status ${STATUS[task.status]?.class || 'status-pending'}">
          ${STATUS[task.status]?.label || '待处理'}
        </span>
        <div class="task-info">
          <div class="task-title">${task.title}</div>
          <div class="task-meta">
            <span>创建时间: ${task.created_at}</span>
            ${task.deadline ? '<span>截止: ' + task.deadline + '</span>' : ''}
          </div>
        </div>
        <div class="task-actions">
          <button class="btn btn-secondary" onclick="event.stopPropagation(); app.editTask('${task.id}')">编辑</button>
        </div>
      </div>
    `).join('');

    // 渲染分页
    this.renderPagination();
  }

  renderStats() {
    const container = document.getElementById('stats-grid');
    if (!container) return;

    const byStatus = this.stats.byStatus || {};
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${total}</div>
        <div class="stat-label">总任务数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${byStatus.pending || 0}</div>
        <div class="stat-label">待处理</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${byStatus.in_progress || 0}</div>
        <div class="stat-label">进行中</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${byStatus.completed || 0}</div>
        <div class="stat-label">已完成</div>
      </div>
    `;
  }

  renderPagination() {
    const container = document.getElementById('pagination');
    if (!container) return;
    // 简化分页逻辑
  }

  async createTask(data) {
    try {
      await API.createTask(data);
      showToast('任务创建成功', 'success');
      this.load();
      closeModal('task-modal');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async updateTask(id, data) {
    try {
      await API.updateTask(id, data);
      showToast('任务更新成功', 'success');
      this.load();
      closeModal('task-modal');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

// 应用主类
class App {
  constructor() {
    this.taskListManager = new TaskListManager();
    this.projects = [];
  }

  async init() {
    try {
      
      // 加载项目
      this.projects = await API.getProjects();

      // 加载任务
      await this.taskListManager.load();
      
      // 绑定事件
      this.bindEvents();
    } catch (error) {
      console.error('初始化失败:', error);
    }
  }

  bindEvents() {
      await this.taskListManager.load();
    });
  }


  async showTaskDetail(taskId) {
    try {
      const task = await API.getTask(taskId);
      // 显示详情模态框
      console.log('Task detail:', task);
    } catch (error) {
      showToast('获取任务详情失败', 'error');
    }
  }

  editTask(taskId) {
    // 显示编辑模态框
    console.log('Edit task:', taskId);
  }
}

// 全局函数
let app;

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'flex';
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  app = new App();
  app.init();
});

// 导出
window.app = app;
window.API = API;
window.showToast = showToast;
window.showModal = showModal;
window.closeModal = closeModal;