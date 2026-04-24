/**
 * 侧边栏菜单权限控制增强模块
 * 基于角色过滤菜单项显示
 * 
 * 使用方式:
 * 1. 在 sidebar.js 之后引入此脚本
 * 2. SidebarPermission.enhance()
 */

const SidebarPermission = {
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

  // 菜单权限映射
  menuPermissions: {
    // 主导航
    'warroom': 'tasks:view',
    'dashboard': 'monitor:view',
    'tasks': 'tasks:view',
    'execution-queue': 'tasks:execute',
    'tasks-list': 'tasks:view',
    'quadrant': 'tasks:view',
    'calendar': 'tasks:view',
    'agents': 'agents:view',
    'projects': 'projects:view',
    
    // 资源
    'docs': 'knowledge:view',
    'skills': 'knowledge:view',
    'knowledge': 'knowledge:*',
    'devops-products': 'projects:view',
    'release-management': 'projects:manage',
    
    // 系统
    'monitor': 'monitor:view',
    'business-monitor': 'monitor:view',
    'organization': 'agents:view',
    'guide': 'system:view',
    'faq': 'system:view',
    'automation-guide': 'system:view',
    'api-catalog': 'system:view',
    'notifications': 'system:view',
    'settings': 'system:manage'
  },

  // 当前角色
  currentRole: 'main',

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
      
      if (resource === required.resource && 
          (action === required.action || action === '*')) {
        return true;
      }
    }
    
    return false;
  },

  /**
   * 根据角色过滤菜单项
   */
  filterMenuItems(menuConfig, roleId) {
    const filtered = { ...menuConfig };
    
    // 过滤主导航
    if (menuConfig.primary) {
      filtered.primary = menuConfig.primary.filter(item => {
        const permission = this.menuPermissions[item.id];
        if (!permission) return true; // 无权限要求，默认显示
        return this.hasPermission(roleId, permission);
      });
    }
    
    // 过滤资源菜单
    if (menuConfig.resources) {
      filtered.resources = menuConfig.resources.filter(item => {
        const permission = this.menuPermissions[item.id];
        if (!permission) return true;
        return this.hasPermission(roleId, permission);
      });
    }
    
    // 过滤系统菜单
    if (menuConfig.system) {
      filtered.system = menuConfig.system.filter(item => {
        const permission = this.menuPermissions[item.id];
        if (!permission) return true;
        return this.hasPermission(roleId, permission);
      });
    }
    
    return filtered;
  },

  /**
   * 增强现有侧边栏
   */
  enhance() {
    console.log('[SidebarPermission] 开始增强侧边栏权限控制');
    
    // 获取当前角色（从 localStorage 或默认）
    this.currentRole = localStorage.getItem('currentRole') || 'main';
    
    // 如果 Sidebar 已初始化
    if (window.Sidebar && window.Sidebar.menuConfig) {
      // 应用权限过滤
      const filteredMenu = this.filterMenuItems(window.Sidebar.menuConfig, this.currentRole);
      
      // 更新菜单配置
      window.Sidebar.menuConfig = filteredMenu;
      
      // 重新渲染
      const container = document.querySelector('#sidebar-container');
      if (container) {
        window.Sidebar.render();
      }
      
      console.log('[SidebarPermission] 菜单已根据角色过滤:', this.currentRole);
      console.log('[SidebarPermission] 可见菜单项:', {
        primary: filteredMenu.primary?.length || 0,
        resources: filteredMenu.resources?.length || 0,
        system: filteredMenu.system?.length || 0
      });
    }
    
    // 添加角色切换器（用于测试）
    this.renderRoleSwitcher();
  },

  /**
   * 渲染角色切换器
   */
  renderRoleSwitcher() {
    const container = document.getElementById('role-switcher');
    if (!container) {
      // 创建角色切换器
      const switcher = document.createElement('div');
      switcher.id = 'role-switcher';
      switcher.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;background:#1e293b;padding:12px;border-radius:8px;border:1px solid #334155;';
      
      const label = document.createElement('div');
      label.style.cssText = 'color:#94a3b8;font-size:12px;margin-bottom:8px;';
      label.textContent = '当前角色:';
      
      const select = document.createElement('select');
      select.id = 'current-role-select';
      select.style.cssText = 'background:#334155;color:#f1f5f9;padding:8px;border-radius:6px;border:1px solid #475569;width:100%;';
      
      Object.entries(this.roles).forEach(([roleId, role]) => {
        const option = document.createElement('option');
        option.value = roleId;
        option.textContent = `${role.name} (${roleId})`;
        if (roleId === this.currentRole) option.selected = true;
        select.appendChild(option);
      });
      
      select.addEventListener('change', (e) => {
        this.currentRole = e.target.value;
        localStorage.setItem('currentRole', this.currentRole);
        this.enhance();
      });
      
      switcher.appendChild(label);
      switcher.appendChild(select);
      document.body.appendChild(switcher);
    }
  },

  /**
   * 初始化
   */
  init(options = {}) {
    this.currentRole = options.currentRole || localStorage.getItem('currentRole') || 'main';
    console.log('[SidebarPermission] 初始化完成，当前角色:', this.currentRole);
  }
};

// 自动初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      SidebarPermission.enhance();
    }, 500);
  });
} else {
  setTimeout(() => {
    SidebarPermission.enhance();
  }, 500);
}
