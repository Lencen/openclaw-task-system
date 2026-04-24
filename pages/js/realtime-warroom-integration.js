/**
 * 实时工作面板功能融合到 War Room
 * 
 * 融合功能：
 * 1. 当前任务详情卡片
 * 2. 实时进度条
 * 3. Token 统计
 * 4. ETA 预估
 * 5. 下个任务预览
 * 6. 快速任务列表
 * 7. 实时日志流
 */

const RealtimeIntegration = {
  // 配置
  config: {
    refreshInterval: 3000, // 3 秒刷新
    maxLogs: 50, // 最大日志条数
    etaUpdateInterval: 1000 // ETA 更新间隔
  },

  // 状态
  state: {
    currentTask: null,
    nextTask: null,
    tokenStats: {
      today: 0,
      prompt: 0,
      completion: 0
    },
    eta: null,
    logs: []
  },

  // 初始化
  init() {
    console.log('[RealtimeIntegration] 初始化...');
    
    // 创建 UI 容器
    this.createContainers();
    
    // 开始数据刷新
    this.startRefresh();
    
    // 开始 ETA 更新
    this.startETAUpdate();
    
    console.log('[RealtimeIntegration] 初始化完成');
  },

  // 创建容器
  createContainers() {
    const container = document.getElementById('realtime-integration-container');
    if (!container) {
      const div = document.createElement('div');
      div.id = 'realtime-integration-container';
      div.innerHTML = this.renderContainers();
      document.querySelector('.main-content')?.prepend(div);
    }
  },

  // 渲染容器 HTML
  renderContainers() {
    return `
      <div class="realtime-dashboard">
        <!-- 当前任务卡片 -->
        <div class="realtime-card current-task-card">
          <div class="card-header">
            <span class="card-icon">🎯</span>
            <span class="card-title">当前任务</span>
          </div>
          <div class="card-content">
            <div class="task-name" id="rt-task-name">--</div>
            <div class="task-progress-bar">
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" id="rt-progress-fill" style="width: 0%"></div>
              </div>
              <span class="progress-percent" id="rt-progress-text">0%</span>
            </div>
            <div class="task-steps" id="rt-task-steps">步骤：0/0</div>
          </div>
        </div>

        <!-- Token 统计卡片 -->
        <div class="realtime-card token-stats-card">
          <div class="card-header">
            <span class="card-icon">💰</span>
            <span class="card-title">Token 统计</span>
          </div>
          <div class="card-content">
            <div class="token-grid">
              <div class="token-item">
                <div class="token-label">今日总计</div>
                <div class="token-value" id="rt-token-total">0</div>
              </div>
              <div class="token-item">
                <div class="token-label">Prompt</div>
                <div class="token-value" id="rt-token-prompt">0</div>
              </div>
              <div class="token-item">
                <div class="token-label">Completion</div>
                <div class="token-value" id="rt-token-completion">0</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ETA 预估卡片 -->
        <div class="realtime-card eta-card">
          <div class="card-header">
            <span class="card-icon">⏱️</span>
            <span class="card-title">预计完成时间</span>
          </div>
          <div class="card-content">
            <div class="eta-time" id="rt-eta-time">--:--:--</div>
            <div class="eta-remaining" id="rt-eta-remaining">剩余：--</div>
          </div>
        </div>

        <!-- 下个任务预览 -->
        <div class="realtime-card next-task-card">
          <div class="card-header">
            <span class="card-icon">🔮</span>
            <span class="card-title">下个任务</span>
          </div>
          <div class="card-content">
            <div class="next-task-name" id="rt-next-task">--</div>
            <div class="next-task-priority" id="rt-next-priority">--</div>
          </div>
        </div>
      </div>

      <!-- 快速任务列表 -->
      <div class="quick-tasks-panel">
        <div class="panel-header">
          <span>⚡ 快速任务</span>
        </div>
        <div class="quick-tasks-list" id="rt-quick-tasks">
          <div class="empty-tasks">暂无快速任务</div>
        </div>
      </div>

      <!-- 实时日志流 -->
      <div class="log-stream-panel">
        <div class="panel-header">
          <span>📜 实时日志</span>
          <button class="clear-logs" onclick="RealtimeIntegration.clearLogs()">清空</button>
        </div>
        <div class="log-stream" id="rt-log-stream">
          <div class="log-empty">等待日志...</div>
        </div>
      </div>
    `;
  },

  // 开始数据刷新
  startRefresh() {
    // 立即执行一次
    this.refreshData();
    
    // 定时刷新
    this.refreshTimer = setInterval(() => {
      this.refreshData();
    }, this.config.refreshInterval);
  },

  // 开始 ETA 更新
  startETAUpdate() {
    this.etaTimer = setInterval(() => {
      this.updateETA();
    }, this.config.etaUpdateInterval);
  },

  // 刷新数据
  async refreshData() {
    try {
      // 获取任务状态
      const stateRes = await fetch('/api/state');
      const stateData = await stateRes.json();
      
      if (stateData.success) {
        this.updateCurrentTask(stateData.data);
      }

      // 获取 Token 统计
      const tokenRes = await fetch('/api/tokens/today');
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        this.updateTokenStats(tokenData);
      }

      // 获取任务队列
      const queueRes = await fetch('/api/queues');
      if (queueRes.ok) {
        const queueData = await queueRes.json();
        this.updateNextTask(queueData);
      }
    } catch (error) {
      console.error('[RealtimeIntegration] 刷新数据失败:', error);
    }
  },

  // 更新当前任务
  updateCurrentTask(data) {
    const { currentTask, currentTaskId, currentStep, totalSteps } = data;
    
    // 更新任务名称
    document.getElementById('rt-task-name').textContent = currentTask || '无任务';
    
    // 更新进度
    const progress = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
    document.getElementById('rt-progress-fill').style.width = `${progress}%`;
    document.getElementById('rt-progress-text').textContent = `${progress}%`;
    document.getElementById('rt-task-steps').textContent = `步骤：${currentStep}/${totalSteps}`;
    
    // 保存状态
    this.state.currentTask = { ...data, progress };
  },

  // 更新 Token 统计
  updateTokenStats(data) {
    const { today, prompt, completion } = data;
    
    document.getElementById('rt-token-total').textContent = (today || 0).toLocaleString();
    document.getElementById('rt-token-prompt').textContent = (prompt || 0).toLocaleString();
    document.getElementById('rt-token-completion').textContent = (completion || 0).toLocaleString();
    
    this.state.tokenStats = { today, prompt, completion };
  },

  // 更新下个任务
  updateNextTask(data) {
    const nextTask = data.data?.globalPool?.tasks?.[0];
    
    if (nextTask) {
      document.getElementById('rt-next-task').textContent = nextTask.title || '--';
      document.getElementById('rt-next-priority').textContent = nextTask.priority || '';
    } else {
      document.getElementById('rt-next-task').textContent = '--';
      document.getElementById('rt-next-priority').textContent = '';
    }
  },

  // 更新 ETA
  updateETA() {
    if (!this.state.currentTask?.currentTask) {
      document.getElementById('rt-eta-time').textContent = '--:--:--';
      document.getElementById('rt-eta-remaining').textContent = '剩余：--';
      return;
    }
    
    // 简单估算（实际需要更复杂的逻辑）
    const now = new Date();
    const eta = new Date(now.getTime() + 30 * 60 * 1000); // 假设 30 分钟后完成
    
    document.getElementById('rt-eta-time').textContent = eta.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('rt-eta-remaining').textContent = '剩余：约 30 分钟';
  },

  // 添加日志
  addLog(message, type = 'info') {
    const log = {
      id: Date.now(),
      message,
      type,
      time: new Date().toLocaleTimeString('zh-CN')
    };
    
    this.state.logs.unshift(log);
    if (this.state.logs.length > this.config.maxLogs) {
      this.state.logs.pop();
    }
    
    this.renderLogs();
  },

  // 渲染日志
  renderLogs() {
    const container = document.getElementById('rt-log-stream');
    if (!container) return;
    
    container.innerHTML = this.state.logs.map(log => `
      <div class="log-item log-${log.type}">
        <span class="log-time">[${log.time}]</span>
        <span class="log-message">${log.message}</span>
      </div>
    `).join('');
  },

  // 清空日志
  clearLogs() {
    this.state.logs = [];
    this.renderLogs();
  },

  // 更新快速任务列表
  updateQuickTasks(tasks) {
    const container = document.getElementById('rt-quick-tasks');
    if (!container) return;
    
    if (tasks.length === 0) {
      container.innerHTML = '<div class="empty-tasks">暂无快速任务</div>';
      return;
    }
    
    container.innerHTML = tasks.map(task => `
      <div class="quick-task-item">
        <span class="qt-priority">${task.priority}</span>
        <span class="qt-title">${task.title}</span>
      </div>
    `).join('');
  }
};

// 自动初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => RealtimeIntegration.init());
} else {
  RealtimeIntegration.init();
}