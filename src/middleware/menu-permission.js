/**
 * 菜单权限控制中间件
 * 基于角色的菜单访问控制
 * 
 * 使用方式:
 * app.use(require('./middleware/menu-permission'));
 */

// 角色定义
const ROLES = {
  admin: {
    level: 100,
    name: '管理员',
    permissions: ['*']
  },
  main: {
    level: 80,
    name: '主 Agent',
    permissions: ['tasks:*', 'agents:*', 'projects:*', 'monitor:*', 'system:*']
  },
  coder: {
    level: 60,
    name: '开发 Agent',
    permissions: ['tasks:*', 'agents:view', 'projects:view', 'monitor:view']
  },
  deep: {
    level: 60,
    name: '分析 Agent',
    permissions: ['tasks:view', 'agents:view', 'projects:view', 'monitor:view', 'knowledge:*']
  },
  fast: {
    level: 40,
    name: '快速 Agent',
    permissions: ['tasks:execute', 'tasks:view']
  },
  chat: {
    level: 50,
    name: '对话 Agent',
    permissions: ['tasks:*', 'agents:chat', 'knowledge:view']
  },
  test: {
    level: 60,
    name: '测试 Agent',
    permissions: ['tasks:*', 'monitor:view', 'agents:view']
  },
  office: {
    level: 30,
    name: '办公 Agent',
    permissions: ['tasks:view', 'tasks:execute', 'knowledge:view']
  },
  guest: {
    level: 10,
    name: '访客',
    permissions: ['tasks:view']
  }
};

// 菜单权限映射
const MENU_PERMISSIONS = {
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
};

/**
 * 解析权限字符串
 */
function parsePermission(perm) {
  const [resource, action] = perm.split(':');
  return { resource, action: action || '*' };
}

/**
 * 检查角色是否有指定权限
 */
function hasPermission(roleId, requiredPerm) {
  const role = ROLES[roleId] || ROLES.guest;
  
  // 管理员权限
  if (role.permissions.includes('*')) {
    return true;
  }
  
  const required = parsePermission(requiredPerm);
  
  // 检查角色权限
  for (const perm of role.permissions) {
    const { resource, action } = parsePermission(perm);
    
    if (resource === required.resource && 
        (action === required.action || action === '*')) {
      return true;
    }
  }
  
  return false;
}

/**
 * 根据角色过滤菜单配置
 */
function filterMenuByRole(menuConfig, roleId) {
  const filtered = { ...menuConfig };
  
  // 过滤主导航
  if (menuConfig.primary) {
    filtered.primary = menuConfig.primary.filter(item => {
      const permission = MENU_PERMISSIONS[item.id];
      if (!permission) return true;
      return hasPermission(roleId, permission);
    });
  }
  
  // 过滤资源菜单
  if (menuConfig.resources) {
    filtered.resources = menuConfig.resources.filter(item => {
      const permission = MENU_PERMISSIONS[item.id];
      if (!permission) return true;
      return hasPermission(roleId, permission);
    });
  }
  
  // 过滤系统菜单
  if (menuConfig.system) {
    filtered.system = menuConfig.system.filter(item => {
      const permission = MENU_PERMISSIONS[item.id];
      if (!permission) return true;
      return hasPermission(roleId, permission);
    });
  }
  
  return filtered;
}

/**
 * Express 中间件
 */
function menuPermissionMiddleware() {
  return (req, res, next) => {
    // 添加方法到 request
    req.menuPermissions = {
      hasPermission: (perm) => hasPermission(req.userRole || 'guest', perm),
      filterMenu: (menuConfig) => filterMenuByRole(menuConfig, req.userRole || 'guest'),
      getRole: (roleId) => ROLES[roleId] || ROLES.guest,
      getAllRoles: () => ({ ...ROLES })
    };
    
    next();
  };
}

/**
 * 获取所有角色定义
 */
function getRoles() {
  return { ...ROLES };
}

/**
 * 获取菜单权限配置
 */
function getMenuPermissions() {
  return { ...MENU_PERMISSIONS };
}

module.exports = {
  ROLES,
  MENU_PERMISSIONS,
  hasPermission,
  filterMenuByRole,
  menuPermissionMiddleware,
  getRoles,
  getMenuPermissions,
  parsePermission
};
