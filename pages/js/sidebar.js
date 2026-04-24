/**
 * 统一侧边栏组件
 * 文档编号：2026-03-13-unified-sidebar-v1.0
 * 
 * 使用方法：
 * 1. 在 HTML 中添加 <div id="sidebar-container"></div>
 * 2. 在 </body> 前引入 <script src="js/sidebar.js"></script>
 * 3. 调用 Sidebar.init({ activePage: 'dashboard' });
 */

// ============================================================
// 认证守卫 - 在页面渲染前检查登录状态
// ============================================================
(function() {
  'use strict';
  
  // 开源版默认免认证（设置默认管理员身份）
  // 如需启用认证：将下面的 false 改为 true
  const REQUIRE_AUTH = false;
  
  if (!REQUIRE_AUTH) {
    window.currentUser = {
      id: 'admin',
      email: 'admin@taskplatform.com',
      name: 'Admin',
      role: 'admin'
    };
    window.dispatchEvent(new CustomEvent('auth:ready', { detail: { user: window.currentUser } }));
    console.log('[auth-guard] 开源版免认证模式');
    return;
  }
  
  // 公开页面（不需要认证）
  const publicPages = [
    '/login.html',
    '/index.html'
  ];
  
  // Agent 免登录 Token 白名单
  const AGENT_TOKENS = [
    'agent-main-token-2026',
    'agent-coder-token-2026',
    'agent-deep-token-2026',
    'agent-fast-token-2026',
    'agent-chat-token-2026',
    'agent-test-token-2026',
    'agent-office-token-2026'
  ];
  
  // 检查当前页面是否为公开页面
  const currentPath = window.location.pathname;
  const isPublic = publicPages.some(page => currentPath.endsWith(page));
  
  if (!isPublic) {
    // 获取 Token
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
    
    // 检查是否为 Agent Token（免登录）
    const isAgentToken = AGENT_TOKENS.includes(token);
    
    if (isAgentToken) {
      // Agent Token，设置默认用户并跳过验证
      window.currentUser = {
        id: 'agent-user',
        email: 'agent@taskplatform.com',
        name: 'Agent User',
        role: 'admin'
      };
      window.dispatchEvent(new CustomEvent('auth:ready', { detail: { user: window.currentUser } }));
      console.log('[auth-guard] Agent Token detected, skipping login');
      return;
    }
    
    if (!token) {
      // 未登录，跳转到登录页
      const loginUrl = '/login.html?redirect=' + encodeURIComponent(window.location.href);
      window.location.href = loginUrl;
      throw new Error('未登录，跳转到登录页');
    }
    
    // 验证 Token（异步，不阻塞）
    fetch(window.location.origin + '/api/auth/verify', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(result => {
      if (!result.valid) {
        // Token 无效
        localStorage.removeItem('auth_token');
        sessionStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        sessionStorage.removeItem('auth_user');
        window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.href);
      } else {
        // 认证成功，存储用户信息
        window.currentUser = result.user;
        window.dispatchEvent(new CustomEvent('auth:ready', { detail: { user: result.user } }));
      }
    })
    .catch(err => {
      console.error('[auth-guard] Token 验证失败:', err);
    });
  }
})();

// ============================================================
// 侧边栏组件
// ============================================================

const Sidebar = {
  // 当前激活页面
  activePage: null,
  
  // 菜单配置
  menuConfig: {
    primary: [
      { 
        id: 'dashboard', 
        icon: '📊', 
        text: 'Dashboard', 
        href: null,
        children: [
          { id: 'warroom', icon: '🎮', text: 'War Room', href: 'war-room.html' },
          { id: 'unified-monitor', icon: '📈', text: '统一监控中心', href: 'unified-monitor.html' },
          { id: 'business-monitor-flow', icon: '📊', text: '业务监控流程', href: 'business-monitor-flow.html' }
        ]
      },
      { 
        id: 'tasks', 
        icon: '📋', 
        text: '任务管理', 
        href: null,
        children: [
          { id: 'tasks-kanban', icon: '📊', text: '任务看板', href: 'tasks-kanban.html' },
          { id: 'tasks-list', icon: '📝', text: '任务列表', href: 'tasks-v2.html' },
          { id: 'issues', icon: '🔴', text: '问题管理', href: 'issues.html' },
          { id: 'calendar', icon: '📅', text: '日历视图', href: 'calendar-new.html' },
          { id: 'quadrant', icon: '🎯', text: '四象限', href: 'quadrant-new.html' },
          { id: 'execution-queue', icon: '⚡', text: '执行队列', href: 'execution-queue.html' }
        ]
      },
      { 
        id: 'resources', 
        icon: '📦', 
        text: '资源', 
        href: null,
        children: [
          { id: 'agents', icon: '🤖', text: 'Agent', href: 'agents-new.html' },
          { id: 'projects', icon: '📁', text: '项目', href: 'projects-new.html' },
          { id: 'products', icon: '📦', text: '产品', href: 'devops-products.html' },
          { id: 'releases', icon: '🚀', text: '版本发布', href: 'devops-releases.html' }
        ]
      },
      { 
        id: 'tools', 
        icon: '🛠️', 
        text: '工具', 
        href: null,
        children: [
          { id: 'tools-list', icon: '🔧', text: '工具', href: 'tools-list.html' },
          { id: 'plugins', icon: '🔌', text: '插件', href: 'plugins.html' },
          { id: 'mcp', icon: '🔗', text: 'MCP', href: 'mcp-servers.html' },
          { id: 'channels', icon: '📡', text: '通信渠道', href: 'channels.html' }
        ]
      },
      {
        id: 'capability',
        icon: '🧠',
        text: '能力积累',
        href: null,
        children: [
          { id: 'memory-dashboard', icon: '💾', text: '记忆', href: 'memory-dashboard.html' },
          { id: 'knowledge', icon: '💡', text: '知识', href: 'knowledge-dashboard.html' },
          { id: 'skills', icon: '🛠️', text: '技能', href: 'skills-new.html' },
          { id: 'docs', icon: '📚', text: '文档', href: 'docs-new.html' },
          { id: 'learning-path', icon: '🎯', text: '学习', href: 'learning-mechanism.html' },
          { id: 'reflection-improvement', icon: '🔮', text: '反思与改进', href: 'reflection-improvement.html' },
          { id: 'faq', icon: '❓', text: 'FAQ', href: 'faq-troubleshoot.html' }
        ]
      },
      { 
        id: 'automation', 
        icon: '⚙️', 
        text: '自动化', 
        href: null,
        children: [
          { id: 'automation-flow-monitor', icon: '📊', text: '流程监控', href: 'automation-flow-monitor.html' },
          { id: 'automation-guide', icon: '📖', text: '自动化机制', href: 'automation-guide.html' },
          { id: 'cron-jobs', icon: '⏰', text: '定时任务', href: 'cron-jobs.html' }
        ]
      },
      { 
        id: 'monitor', 
        icon: '📈', 
        text: '监控', 
        href: null,
        children: [
          { id: 'unified-monitor', icon: '📊', text: '统一监控', href: 'unified-monitor.html' },
          { id: 'system-monitor-v3', icon: '🖥️', text: '系统监控', href: 'system-monitor-v3.html' },
          { id: 'service-monitor', icon: '🔧', text: '服务监控', href: 'service-monitor.html' },
          { id: 'checklist', icon: '✅', text: '检查清单', href: 'checklist.html' },
          { id: 'audit-log', icon: '🛡️', text: '审计日志', href: 'audit-log.html' }
        ]
      },
      { 
        id: 'organization', 
        icon: '🏛️', 
        text: '组织', 
        href: null,
        children: [
          { id: 'org-structure', icon: '👥', text: '组织架构', href: 'organization.html' },
          { id: 'chat-groups', icon: '💬', text: '沟通小组', href: 'chat-groups.html' }
        ]
      },
      { 
        id: 'system', 
        icon: '🔧', 
        text: '系统', 
        href: null,
        children: [
          { id: 'system-guide', icon: '📖', text: '系统说明', href: 'system-guide.html' },
          { id: 'system-environment', icon: '⚙️', text: '系统环境', href: 'system-environment.html' },
          { id: 'page-structure', icon: '🗺️', text: '页面结构', href: 'page-structure.html' },
          { id: 'api-catalog', icon: '🔌', text: 'API 目录', href: 'api-catalog.html' },
          { id: 'notifications', icon: '🔔', text: '通知中心', href: 'notifications.html' },
          { id: 'settings', icon: '⚙️', text: '系统设置', href: 'settings-new.html' },
          { id: 'settings-users', icon: '👥', text: '用户管理', href: 'settings-users.html' },
          { id: 'deploy', icon: '🚀', text: '远程部署', href: 'deploy.html' }
        ]
      },
      { 
        id: 'demo', 
        icon: '🎮', 
        text: 'Demo', 
        href: null,
        children: [
          { id: 'pretext-demo', icon: '📝', text: 'PreText 文本布局', href: 'pretext-demo.html' },
          { id: 'ui-ux-demo', icon: '🎨', text: 'UI/UX 主题演示', href: 'ui-ux-upgrade/demo.html' }
        ]
      }
    ]
  },
  
  // 系统名称和图标
  systemName: 'Task System',
  systemIcon: '🚀',
  
  /**
   * 初始化侧边栏
   * @param {Object} options - 配置选项
   * @param {string} options.activePage - 当前激活页面 ID
   * @param {string} options.container - 容器选择器（默认 #sidebar-container）
   */
  init(options = {}) {
    this.activePage = options.activePage || this.detectActivePage();
    const container = document.querySelector(options.container || '#sidebar-container');
    
    if (!container) {
      console.warn('[Sidebar] 未找到容器元素');
      return;
    }
    
    // 渲染侧边栏
    container.innerHTML = this.render();
    
    // 添加移动端菜单按钮和遮罩
    this.addMobileMenuButton();
    
    // 绑定事件
    this.bindEvents();
    
    // 加载折叠状态
    this.loadCollapseState();
    
    // 滚动到当前激活菜单项
    this.scrollToActiveItem();
    
    console.log('[Sidebar] 初始化完成, activePage:', this.activePage);
  },
  
  /**
   * 添加移动端菜单按钮和遮罩
   */
  addMobileMenuButton() {
    // 检查是否已存在
    if (document.getElementById('mobile-menu-btn')) return;
    
    // 创建菜单按钮
    const menuBtn = document.createElement('button');
    menuBtn.id = 'mobile-menu-btn';
    menuBtn.className = 'mobile-menu-btn';
    menuBtn.innerHTML = '<i class="ri-menu-line"></i>';
    menuBtn.onclick = () => this.toggleMobileSidebar();
    document.body.appendChild(menuBtn);
    
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    overlay.className = 'sidebar-overlay';
    overlay.onclick = () => this.closeMobileSidebar();
    document.body.appendChild(overlay);
  },
  
  /**
   * 切换移动端侧边栏
   */
  toggleMobileSidebar() {
    const sidebar = document.getElementById('unified-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && overlay) {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    }
  },
  
  /**
   * 关闭移动端侧边栏
   */
  closeMobileSidebar() {
    const sidebar = document.getElementById('unified-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && overlay) {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    }
  },
  
  /**
   * 滚动到当前激活菜单项
   */
  scrollToActiveItem() {
    setTimeout(() => {
      const activeItem = document.querySelector('.nav-item.active');
      if (activeItem) {
        const sidebar = document.getElementById('unified-sidebar');
        if (sidebar) {
          const itemRect = activeItem.getBoundingClientRect();
          const sidebarRect = sidebar.getBoundingClientRect();
          // 如果菜单项不在可视区域，滚动到它
          if (itemRect.top < sidebarRect.top || itemRect.bottom > sidebarRect.bottom) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
    }, 100);
  },
  
  
  
  /**
   * 自动检测当前页面
   */
  detectActivePage() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'index.html';
    
    // 映射文件名到页面 ID
    const pageMap = {
      'war-room-v3.html': 'warroom',
      'agent-war-room-final.html': 'warroom',
      'unified-monitor.html': 'unified-monitor',
      'dashboard-new.html': 'dashboard',
      'index.html': 'dashboard',
      'index-new.html': 'dashboard',
      'tasks-kanban.html': 'tasks-kanban',
      'tasks-v2.html': 'tasks-list',
      'execution-queue.html': 'execution-queue',
      'calendar-new.html': 'calendar',
      'calendar.html': 'calendar',
      'quadrant-new.html': 'quadrant',
      'quadrant-v2.html': 'quadrant',
      'quadrant-dashboard.html': 'quadrant',
      'agents-new.html': 'agents',
      'projects-new.html': 'projects',
      'project-detail.html': 'projects',
      'docs-new.html': 'docs',
      'doc-detail.html': 'docs',
      'skills-new.html': 'skills',
      'knowledge-dashboard.html': 'knowledge',
      'learning-mechanism.html': 'learning-path',
      'devops-products.html': 'products',
      'product-detail.html': 'products',
      'devops-releases.html': 'releases',
      'monitor-new.html': 'system-monitor',
      'audit-log.html': 'audit-log',
      'business-monitor.html': 'business-monitor',
      'alert-history.html': 'alert-history',
      'cron-jobs.html': 'cron-jobs',
      'evolution-log.html': 'evolution-log',
      'automation-guide.html': 'automation-guide',
      'organization.html': 'org-structure',
      'chat-groups.html': 'chat-groups',
      'system-guide.html': 'system-guide',
      'faq-troubleshoot.html': 'faq',
      'api-catalog.html': 'api-catalog',
      'notifications.html': 'notifications',
      'settings-new.html': 'settings',
      'settings-users.html': 'settings-users',
      'deploy.html': 'deploy'
    };
    
    return pageMap[filename] || 'dashboard';
  },
  
  /**
   * 渲染侧边栏 HTML
   */
  render() {
    return `
<aside class="sidebar" id="unified-sidebar">
  <div class="sidebar-header">
    <span class="sidebar-logo">${this.systemIcon}</span>
    <span class="nav-text">${this.systemName}</span>
  </div>
  
  <nav class="sidebar-nav">
    ${this.renderSection('', this.menuConfig.primary)}
  </nav>
</aside>
<style>
  /* 嵌套菜单样式 - 全部展开 */
  .nav-group { 
    margin-bottom: 16px; 
  }
  .nav-group-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 12px;
    margin-bottom: 4px;
    opacity: 0.8;
  }
  .nav-group-items {
    display: block;
  }
  .nav-group-items .nav-item {
    padding-left: 24px;
  }
  
  /* 带 tabs 的菜单项 */
  .nav-item-with-tabs { margin-bottom: 4px; }
  .nav-item-with-tabs .nav-item { margin-bottom: 4px; }
  .nav-item-with-tabs.active .nav-item { 
    background: var(--primary); color: white;
  }
  .nav-tabs {
    display: none; gap: 4px; padding: 0 8px 8px 24px;
  }
  .nav-item-with-tabs.active .nav-tabs { display: flex; }
  .nav-tabs .sub-tab {
    flex: 1; padding: 6px 8px; text-align: center;
    border-radius: 6px; font-size: 12px;
    background: var(--bg-tertiary); color: var(--text-secondary);
    text-decoration: none; transition: all 0.15s;
  }
  .nav-tabs .sub-tab:hover { background: var(--primary); color: white; }
  .nav-tabs .sub-tab.tab-active { 
    background: var(--primary); color: white;
  }
</style>
    `;
  },
  
  /**
   * 渲染菜单分区
   */
  renderSection(title, items) {
    const menuItems = items.map(item => this.renderItem(item)).join('');
    return `
    <div class="nav-section">
      <div class="nav-section-title">${title}</div>
      ${menuItems}
    </div>
    `;
  },
  
  /**
   * 渲染菜单项
   */
  renderItem(item) {
    // 如果有子菜单，渲染为分组
    if (item.children) {
      const childItems = item.children.map(child => this.renderItem(child)).join('');
      
      return `
      <div class="nav-group">
        <div class="nav-group-title">${item.icon} ${item.text}</div>
        <div class="nav-group-items">
          ${childItems}
        </div>
      </div>
      `;
    }
    
    // 如果有 tabs
    if (item.tabs) {
      const isActive = item.id === this.activePage || item.tabs.some(t => t.id === this.activePage);
      const activeClass = isActive ? 'active' : '';
      
      const tabsHtml = item.tabs.map(tab => {
        const tabActive = tab.id === this.activePage ? 'tab-active' : '';
        return `<a href="${tab.href}" class="sub-tab ${tabActive}" data-tab="${tab.id}">${tab.text}</a>`;
      }).join('');
      
      return `
      <div class="nav-item-with-tabs ${activeClass}">
        <a href="${item.href}" class="nav-item" data-page="${item.id}">
          <span class="nav-icon">${item.icon}</span>
          <span class="nav-text">${item.text}</span>
        </a>
        <div class="nav-tabs">
          ${tabsHtml}
        </div>
      </div>
      `;
    }
    
    // 普通菜单项
    const isActive = item.id === this.activePage ? 'active' : '';
    const badge = item.badge ? `<span class="nav-badge">${item.badge}</span>` : '';
    // 保留完整链接，不改为 #，确保侧边栏链接可点击跳转
    const href = item.href || '#';
    
    return `
    <a href="${href}" class="nav-item ${isActive}" data-page="${item.id}">
      <span class="nav-icon">${item.icon}</span>
      <span class="nav-text">${item.text}</span>
      ${badge}
    </a>
    `;
  },
  
  /**
   * 绑定事件
   */
  bindEvents() {
    // 移除阻止跳转的逻辑，让当前页面菜单项也能点击刷新
    // 菜单项点击时保持正常跳转行为
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // 允许正常跳转，包括当前页面的刷新
        // 如果需要阻止跳转，应该通过其他方式处理（如子菜单展开）
      });
    });
    
    // 键盘快捷键（可选）
    document.addEventListener('keydown', (e) => {
      // Ctrl+B 切换侧边栏折叠
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        this.toggleCollapse();
      }
    });
  },
  
  /**
   * 切换折叠状态
   */
  toggleCollapse() {
    const sidebar = document.getElementById('unified-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
      this.saveCollapseState(sidebar.classList.contains('collapsed'));
    }
  },
  
  /**
   * 保存折叠状态
   */
  saveCollapseState(collapsed) {
    try {
      localStorage.setItem('sidebar-collapsed', JSON.stringify(collapsed));
    } catch (e) {
      console.warn('[Sidebar] 保存状态失败');
    }
  },
  
  /**
   * 加载折叠状态
   */
  loadCollapseState() {
    try {
      const collapsed = JSON.parse(localStorage.getItem('sidebar-collapsed'));
      const sidebar = document.getElementById('unified-sidebar');
      if (sidebar && collapsed) {
        sidebar.classList.add('collapsed');
      }
    } catch (e) {
      // 忽略错误
    }
  },
  
  /**
   * 设置激活页面
   */
  setActivePage(pageId) {
    // 移除旧的激活状态
    document.querySelectorAll('.nav-item.active').forEach(item => {
      item.classList.remove('active');
      item.href = item.dataset.href || item.href;
    });
    
    // 添加新的激活状态
    const newItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (newItem) {
      newItem.classList.add('active');
      newItem.href = '#';
      this.activePage = pageId;
    }
  },
  
  /**
   * 更新徽章
   */
  updateBadge(pageId, count) {
    const item = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (item) {
      let badge = item.querySelector('.nav-badge');
      if (count && count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'nav-badge';
          item.appendChild(badge);
        }
        badge.textContent = count;
      } else if (badge) {
        badge.remove();
      }
    }
  },
  
  /**
   * 更新系统名称
   */
  setSystemName(name, icon) {
    if (name) this.systemName = name;
    if (icon) this.systemIcon = icon;
    
    const header = document.querySelector('.sidebar-header');
    if (header) {
      header.innerHTML = `
        <span class="sidebar-logo">${this.systemIcon}</span>
        <span class="nav-text">${this.systemName}</span>
      `;
    }
  }
};

// ============================================================
// 显示当前用户信息
// ============================================================
function showCurrentUser() {
  // 获取用户信息
  const userStr = localStorage.getItem('auth_user') || sessionStorage.getItem('auth_user');
  if (!userStr) return;
  
  try {
    const user = JSON.parse(userStr);
    
    // 查找 header-right 区域（优先使用 header.frame 的 header-right）
    const headerRight = document.querySelector('.header .header-right') || document.querySelector('.header-right');
    
    if (headerRight) {
      // 如果已存在用户信息，先移除
      const existing = headerRight.querySelector('.user-info');
      if (existing) {
        existing.remove();
      }
      
      // 创建用户信息元素
      const userInfo = document.createElement('div');
      userInfo.className = 'user-info';
      
      // 用户头像
      const avatar = user.name ? user.name.charAt(0).toUpperCase() : '👤';
      const roleText = user.role === 'admin' ? '(admin)' : (user.role ? `(${user.role})` : '');
      const roleBadge = roleText ? `<span class="user-role">${roleText}</span>` : '';
      
      userInfo.innerHTML = `
        <div class="user-avatar">${avatar}</div>
        <div class="user-info-content">
          <span class="user-name">${user.name || user.email}</span>
          ${roleBadge}
        </div>
        <button onclick="logout()">退出</button>
      `;
      
      // 添加到 header-right 区域
      headerRight.appendChild(userInfo);
    }
  } catch (e) {
    console.error('[auth] 解析用户信息失败:', e);
  }
}

// 监听认证完成事件
window.addEventListener('auth:ready', showCurrentUser);

// 页面加载时也尝试显示
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(showCurrentUser, 100);
});

// 自动初始化（如果容器存在）
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('sidebar-container');
  if (container && !container.innerHTML.trim()) {
    Sidebar.init();
  }
});

// 暴露到全局
window.Sidebar = Sidebar;