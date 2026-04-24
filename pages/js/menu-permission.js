/**
 * 菜单权限控制 - 前端实现
 * 基于角色的菜单显示控制
 * 
 * 使用方式:
 * 1. 引入脚本：<script src="js/menu-permission.js"></script>
 * 2. 初始化：MenuPermission.init({ currentRole: 'main' })
 * 3. 自动根据角色渲染菜单
 */

const MenuPermission = {
  // 当前角色
  currentRole: 'guest',
  
  // 角色定义
  roles: {
    admin: { level: 100, name: '管理员', permissions: ['*'] },
    main: { level: 80, name: '主 Agent', permissions: ['tasks:*', 'agents:*', 'projects:*', 'monitor:*', 'system:*'] },
    coder: { level: 60, name: '开发 Agent', permissions: ['tasks:*', 'agents:view', 'projects:view', 'monitor:view'] },
    deep: { level: 60, name: '分析 Agent', permissions: ['tasks:view', 'agents:view', 'projects:view', 'monitor:view', 'knowledge:*'] },
    fast: { level: 40, name: '快速 Agent', permissions: ['tasks:execute', 'tasks:view'] },
    chat: { level: 50, name: '对话 Agent', permissions: ['tasks:*', 'agents:chat', 'knowledge:view'] },
    test: { level: 60, name: '测试 Agent', permissions: ['tasks:*', 'monitor:view', 'agents:view'] },
    office: { level: 30, name: '办公 Agent', permissions: ['tasks:view', 'tasks:execute', 'knowledge:view'] },
    guest: { level: 10, name: '访客', permissions: ['tasks:view'] }
  },
  
  // 菜单权限配置
  menuPermissions: {
    primary: {
      warroom: { permission: 'tasks:view', label: 'War Room', icon: '🎮' },
      dashboard: { permission: 'monitor:view', label: '仪表盘', icon: '📊' },
      tasks: { permission: 'tasks:view', label: '任务管理', icon: '📋' },
      'execution-queue': { permission: 'tasks:execute', label: '执行队列', icon: '⚡' },
      'tasks-list': { permission: 'tasks:view', label: '列表视图', icon: '📝' },
      quadrant: { permission: 'tasks:view', label: '四象限', icon: '🎯' },
      calendar: { permission: 'tasks:view', label: '日历视图', icon: '📅' },
      agents: { permission: 'agents:view', label: 'Agent', icon: '🤖' },
      projects: { permission: 'projects:view', label: '项目', icon: '📦' }
    },
    resources: {
      docs: { permission: 'knowledge:view', label: '文档', icon: '📚' },
      skills: { permission: 'knowledge:view', label: '技能', icon: '🛠️' },
      knowledge: { permission: 'knowledge:*', label: '知识库', icon: '🧠' },
      'devops-products': { permission: 'projects:view', label: '产品管理', icon: '📦' },
      'release-management': { permission: 'projects:manage', label: '发布管理', icon: '🚀' }
    },
    system: {
      monitor: { permission: 'monitor:view', label: '监控', icon: '📈' },
      'business-monitor': { permission: 'monitor:view', label: '业务监控', icon: '📊' },
      organization: { permission: 'agents:view', label: '组织架构', icon: '🏛️' },
      guide: { permission: 'system:view', label: '系统说明', icon: '📖' },
      faq: { permission: 'system:view', label: 'FAQ', icon: '❓' },
      'automation-guide': { permission: 'system:view', label: '自动化机制', icon: '⚙️' },
      'api-catalog': { permission: 'system:view', label: 'API 目录', icon: '🔌' },
      notifications: { permission: 'system:view', label: '通知中心', icon: '🔔' },
      settings: { permission: 'system:manage', label: '设置', icon: '🔧' }
    }
  },

  /**
   * 解析权限字符串
   */
  parsePermission(perm) {
    const [resource, action] = perm.split(':');
    return { resource, action: action || '*' };
  },

  /**
   * 检查角色是否有指定权限
   */
  hasPermission(roleId, requiredPerm) {
    const role = this.roles[roleId] || this.roles.guest;
    
    // 管理员权限
    if (role.permissions.includes('*')) {
      return true;
    }
    
    const required = this.parsePermission(requiredPerm);
    
    // 检查角色权限
    for (const perm of role.permissions) {
      const { resource, action } = this.parsePermission(perm);
      
      // 资源匹配且动作匹配（或动作为通配符）
      if (resource === required.resource && 
          (action === required.action || action === '*')) {
        return true;
      }
    }
    
    return false;
  },

  /**
   * 根据角色过滤菜单
   */
  filterMenu(roleId, menuGroup = 'all') {
    const result = {};
    
    const groups = menuGroup === 'all' 
      ? ['primary', 'resources', 'system']
      : [menuGroup];
    
    for (const group of groups) {
      const menuConfig = this.menuPermissions[group];
      if (!menuConfig) continue;
      
      result[group] = [];
      
      for (const [menuId, config] of Object.entries(menuConfig)) {
        if (this.hasPermission(roleId, config.permission)) {
          result[group].push({
            id: menuId,
            label: config.label,
            icon: config.icon,
            href: `${menuId}.html`,
            permission: config.permission
          });
        }
      }
    }
    
    return result;
  },

  /**
   * 渲染角色选择器（用于测试）
   */
  renderRoleSelector() {
    const container = document.getElementById('role-selector');
    if (!container) return;
    
    let html = '<select id="current-role" style="background: #334155; color: #f1f5f9; padding: 8px; border-radius: 6px; border: 1px solid #475569;">';
    for (const [roleId, role] of Object.entries(this.roles)) {
      html += `<option value="${roleId}" ${roleId === this.currentRole ? 'selected' : ''}>${role.name} (${roleId})</option>`;
    }
    html += '</select>';
    
    container.innerHTML = html;
    
    // 绑定事件
    document.getElementById('current-role').addEventListener('change', (e) => {
      this.currentRole = e.target.value;
      this.renderMenu();
      // 保存选择
      localStorage.setItem('currentRole', this.currentRole);
    });
  },

  /**
   * 渲染菜单
   */
  renderMenu() {
    const filteredMenu = this.filterMenu(this.currentRole);
    
    // 更新侧边栏菜单
    if (window.Sidebar && window.Sidebar.menuConfig) {
      // 更新现有菜单
      this.updateSidebar(filteredMenu);
    }
    
    // 显示权限信息
    this.showPermissionInfo(filteredMenu);
  },

  /**
   * 更新侧边栏
   */
  updateSidebar(filteredMenu) {
    // 这里可以根据需要更新现有侧边栏
    console.log('[MenuPermission] 菜单已根据角色过滤:', this.currentRole, filteredMenu);
  },

  /**
   * 显示权限信息
   */
  showPermissionInfo(filteredMenu) {
    const infoEl = document.getElementById('permission-info');
    if (infoEl) {
      let total = 0;
      Object.values(filteredMenu).forEach(items => {
        total += items.length;
      });
      infoEl.textContent = `角色：${this.currentRole} | 可见菜单：${total} 个`;
    }
  },

  /**
   * 保存角色到 localStorage
   */
  saveRole(role) {
    this.currentRole = role;
    localStorage.setItem('currentRole', role);
    console.log('[MenuPermission] 角色已保存:', role);
  },

  /**
   * 初始化
   */
  init(options = {}) {
    this.currentRole = options.currentRole || localStorage.getItem('currentRole') || 'main';
    
    console.log('[MenuPermission] 初始化完成，当前角色:', this.currentRole);
    
    // 渲染角色选择器（如果存在容器）
    this.renderRoleSelector();
    
    // 渲染菜单
    this.renderMenu();
    
    // 监听菜单初始化
    setTimeout(() => {
      if (window.Sidebar) {
        this.renderMenu();
      }
    }, 500);
  }
};

// 自动初始化（如果配置了）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    MenuPermission.init();
  });
} else {
  MenuPermission.init();
}
