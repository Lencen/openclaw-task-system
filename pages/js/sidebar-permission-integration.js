/**
 * 侧边栏权限集成
 * 
 * 将 MenuPermission 集成到 Sidebar 组件
 * 自动根据用户角色过滤菜单项
 */

(function() {
  'use strict';

  // 等待 Sidebar 和 MenuPermission 加载完成
  function waitForDependencies() {
    return new Promise((resolve) => {
      const check = () => {
        if (typeof Sidebar !== 'undefined' && typeof MenuPermission !== 'undefined') {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  // 初始化权限集成
  async function init() {
    await waitForDependencies();
    
    console.log('[SidebarPermission] 初始化权限集成');
    
    // 保存原始 render 方法
    const originalRender = Sidebar.render.bind(Sidebar);
    
    // 重写 render 方法，添加权限过滤
    Sidebar.render = function() {
      // 获取当前用户角色
      const currentRole = MenuPermission.currentRole || 'guest';
      
      // 过滤菜单项
      const filteredConfig = this.filterMenuByPermission(this.menuConfig, currentRole);
      
      // 使用过滤后的配置渲染
      return this.renderWithConfig(filteredConfig);
    };
    
    // 添加过滤方法
    Sidebar.filterMenuByPermission = function(config, role) {
      const filtered = {
        primary: [],
        resources: [],
        system: []
      };
      
      // 过滤 primary 菜单
      if (config.primary) {
        filtered.primary = config.primary.filter(item => {
          const permission = this.getMenuPermission(item.id);
          return permission ? MenuPermission.hasPermission(role, permission) : true;
        });
      }
      
      // 过滤 resources 菜单
      if (config.resources) {
        filtered.resources = config.resources.filter(item => {
          const permission = this.getMenuPermission(item.id);
          return permission ? MenuPermission.hasPermission(role, permission) : true;
        });
      }
      
      // 过滤 system 菜单
      if (config.system) {
        filtered.system = config.system.filter(item => {
          const permission = this.getMenuPermission(item.id);
          return permission ? MenuPermission.hasPermission(role, permission) : true;
        });
      }
      
      return filtered;
    };
    
    // 获取菜单项权限
    Sidebar.getMenuPermission = function(menuId) {
      const menuPermissions = {
        // Primary 菜单
        'warroom': 'tasks:view',
        'dashboard': 'monitor:view',
        'tasks': 'tasks:view',
        'execution-queue': 'tasks:execute',
        'tasks-list': 'tasks:view',
        'quadrant': 'tasks:view',
        'calendar': 'tasks:view',
        'agents': 'agents:view',
        'projects': 'projects:view',
        
        // Resources 菜单
        'docs': 'knowledge:view',
        'skills': 'knowledge:view',
        'knowledge': 'knowledge:view',
        'devops-products': 'projects:view',
        'release-management': 'projects:manage',
        
        // System 菜单
        'monitor': 'monitor:view',
        'business-monitor': 'monitor:view',
        'organization': 'system:manage',
        'guide': 'tasks:view',
        'faq': 'tasks:view',
        'automation-guide': 'tasks:view',
        'api-catalog': 'knowledge:view',
        'notifications': 'tasks:view',
        'settings': 'system:manage'
      };
      
      return menuPermissions[menuId];
    };
    
    // 添加使用自定义配置渲染的方法
    Sidebar.renderWithConfig = function(config) {
      const primaryItems = config.primary || [];
      const resourceItems = config.resources || [];
      const systemItems = config.system || [];
      
      return `
        <aside class="sidebar">
          <div class="sidebar-header">
            <span class="sidebar-logo">${this.systemIcon}</span>
            <span>${this.systemName}</span>
          </div>
          

          
          <nav class="sidebar-nav">
            ${primaryItems.length > 0 ? `
              <div class="nav-section">
                ${this.renderNavItems(primaryItems)}
              </div>
            ` : ''}
            
            ${resourceItems.length > 0 ? `
              <div class="nav-section">
                <div class="nav-section-title">资源</div>
                ${this.renderNavItems(resourceItems)}
              </div>
            ` : ''}
            
            ${systemItems.length > 0 ? `
              <div class="nav-section">
                <div class="nav-section-title">系统</div>
                ${this.renderNavItems(systemItems)}
              </div>
            ` : ''}
          </nav>
          
          <div class="sidebar-footer">
            <div class="role-badge">
              <span>当前角色: ${this.getRoleDisplayName(MenuPermission.currentRole)}</span>
            </div>
            <button class="collapse-btn" onclick="Sidebar.toggleCollapse()">
              <i class="ri-arrow-left-line"></i>
            </button>
          </div>
        </aside>
      `;
    };
    
    // 渲染导航项
    Sidebar.renderNavItems = function(items) {
      return items.map(item => {
        const isActive = this.activePage === item.id;
        const activeClass = isActive ? 'active' : '';
        const badgeHtml = item.badge ? `<span class="nav-badge">${item.badge}</span>` : '';
        
        return `
          <a href="${item.href}" class="nav-item ${activeClass}" data-page="${item.id}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-text">${item.text}</span>
            ${badgeHtml}
          </a>
        `;
      }).join('');
    };
    
    // 获取角色显示名称
    Sidebar.getRoleDisplayName = function(role) {
      const roleNames = {
        'admin': '管理员',
        'main': '主 Agent',
        'coder': '开发 Agent',
        'deep': '分析 Agent',
        'fast': '快速 Agent',
        'chat': '对话 Agent',
        'test': '测试 Agent',
        'office': '办公 Agent',
        'guest': '访客'
      };
      return roleNames[role] || role;
    };
    
    // 添加角色切换方法（用于测试）
    Sidebar.switchRole = function(role) {
      if (MenuPermission.roles[role]) {
        MenuPermission.currentRole = role;
        MenuPermission.saveRole(role);
        
        // 重新渲染侧边栏
        const container = document.querySelector('#sidebar-container');
        if (container) {
          container.innerHTML = this.render();
          this.bindEvents();
        }
        
        console.log('[SidebarPermission] 切换到角色:', role);
        return true;
      }
      return false;
    };
    
    console.log('[SidebarPermission] 权限集成完成');
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();