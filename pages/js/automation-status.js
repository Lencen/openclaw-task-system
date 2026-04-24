/**
 * 自动化状态组件
 * 显示在任务仪表盘页面
 */

class AutomationStatus {
  constructor() {
    this.containerId = 'automation-status';
    this.refreshInterval = 30000; // 30秒
  }

  async fetchStatus() {
    try {
      const response = await fetch('/api/automation/status');
      return await response.json();
    } catch (error) {
      console.error('获取自动化状态失败:', error);
      return null;
    }
  }

  render(data) {
    if (!data) {
      return '<div class="automation-error">无法获取状态</div>';
    }

    const components = data.components || [];
    const stats = data.stats || {};

    let html = `
      <div class="automation-panel">
        <h3>⚙️ 自动化状态</h3>
        <div class="automation-grid">
          ${components.map(c => `
            <div class="automation-item ${c.status}">
              <span class="status-icon">${c.status === 'online' ? '🟢' : '🔴'}</span>
              <span class="component-name">${c.name}</span>
              <span class="component-uptime">${c.uptime}</span>
            </div>
          `).join('')}
        </div>
        <div class="automation-stats">
          <div class="stat">
            <span class="stat-label">任务</span>
            <span class="stat-value">${stats.tasks || 0}</span>
          </div>
          <div class="stat">
            <span class="stat-label">问题</span>
            <span class="stat-value">${stats.issues || 0}</span>
          </div>
          <div class="stat">
            <span class="stat-label">队列</span>
            <span class="stat-value">${stats.queue || 0}</span>
          </div>
        </div>
      </div>
    `;

    return html;
  }

  async init() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const data = await this.fetchStatus();
    container.innerHTML = this.render(data);

    // 定时刷新
    setInterval(async () => {
      const data = await this.fetchStatus();
      container.innerHTML = this.render(data);
    }, this.refreshInterval);
  }
}

// 导出
window.AutomationStatus = AutomationStatus;
