/**
 * 认证守卫脚本
 * 
 * 开源版默认免认证（设置默认管理员身份）
 * 如需启用认证：将 REQUIRE_AUTH 改为 true
 * 
 * @created 2026-03-27
 */

(function() {
  'use strict';
  
  // 开源版默认免认证
  const REQUIRE_AUTH = false;
  
  if (!REQUIRE_AUTH) {
    window.currentUser = {
      id: 'admin',
      email: 'admin@taskplatform.com',
      name: 'Admin',
      role: 'admin'
    };
    console.log('[auth-guard] 开源版免认证模式');
    return;
  }
  
  // 配置
  const CONFIG = {
    // 登录页面路径
    loginPage: '/login.html',
    // 不需要认证的页面
    publicPages: [
      '/login.html',
      '/index.html',
      '/favicon.ico'
    ],
    // 不需要认证的路径前缀
    publicPrefixes: [
      '/api/',
      '/css/',
      '/js/',
      '/assets/',
      '/fonts/'
    ],
    // Token 存储 key
    tokenKey: 'auth_token',
    userKey: 'auth_user',
    // API 端点
    verifyEndpoint: '/api/auth/verify'
  };
  
  // API 基础路径
  const API_BASE = window.location.origin;
  
  /**
   * 检查当前页面是否为公开页面
   */
  function isPublicPage() {
    const currentPath = window.location.pathname;
    
    // 检查是否在公开页面列表
    if (CONFIG.publicPages.some(page => currentPath.endsWith(page))) {
      return true;
    }
    
    // 检查是否为公开路径前缀
    if (CONFIG.publicPrefixes.some(prefix => currentPath.startsWith(prefix))) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 获取存储的 Token
   */
  function getToken() {
    // 优先从 localStorage 获取（记住登录）
    let token = localStorage.getItem(CONFIG.tokenKey);
    if (token) return token;
    
    // 其次从 sessionStorage 获取
    token = sessionStorage.getItem(CONFIG.tokenKey);
    return token;
  }
  
  /**
   * 清除登录状态
   */
  function clearAuth() {
    localStorage.removeItem(CONFIG.tokenKey);
    localStorage.removeItem(CONFIG.userKey);
    sessionStorage.removeItem(CONFIG.tokenKey);
    sessionStorage.removeItem(CONFIG.userKey);
  }
  
  /**
   * 跳转到登录页
   */
  function redirectToLogin() {
    const currentUrl = window.location.href;
    const loginUrl = CONFIG.loginPage + '?redirect=' + encodeURIComponent(currentUrl);
    window.location.href = loginUrl;
  }
  
  /**
   * 验证 Token 有效性
   */
  async function verifyToken(token) {
    try {
      const response = await fetch(API_BASE + CONFIG.verifyEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token
        }
      });
      
      if (!response.ok) {
        return { valid: false };
      }
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('[auth-guard] Token 验证失败:', error);
      return { valid: false };
    }
  }
  
  /**
   * 主检查函数
   */
  async function checkAuth() {
    // 如果是公开页面，跳过检查
    if (isPublicPage()) {
      console.log('[auth-guard] 公开页面，跳过认证检查');
      return;
    }
    
    console.log('[auth-guard] 检查认证状态...');
    
    // 获取 Token
    const token = getToken();
    
    if (!token) {
      console.log('[auth-guard] 未找到 Token，跳转登录页');
      clearAuth();
      redirectToLogin();
      return;
    }
    
    // 验证 Token
    const verifyResult = await verifyToken(token);
    
    if (!verifyResult.valid) {
      console.log('[auth-guard] Token 无效，跳转登录页');
      clearAuth();
      redirectToLogin();
      return;
    }
    
    console.log('[auth-guard] 认证通过，用户:', verifyResult.user?.name || verifyResult.user?.email);
    
    // 存储用户信息到全局
    window.currentUser = verifyResult.user;
    
    // 触发认证成功事件
    window.dispatchEvent(new CustomEvent('auth:ready', { 
      detail: { user: verifyResult.user } 
    }));
  }
  
  /**
   * 登出函数（全局可用）
   */
  window.logout = async function() {
    const token = getToken();
    
    if (token) {
      try {
        // 调用登出 API
        await fetch(API_BASE + '/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token
          }
        });
      } catch (error) {
        console.error('[auth-guard] 登出 API 调用失败:', error);
      }
    }
    
    // 清除本地存储
    clearAuth();
    
    // 跳转到登录页
    window.location.href = CONFIG.loginPage;
  };
  
  /**
   * 获取当前用户信息（全局可用）
   */
  window.getCurrentUser = function() {
    return window.currentUser || null;
  };
  
  /**
   * 检查是否已登录（全局可用）
   */
  window.isLoggedIn = function() {
    return !!getToken() && !!window.currentUser;
  };
  
  // 页面加载时执行检查
  // 使用 DOMContentLoaded 确保 DOM 准备好
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAuth);
  } else {
    // DOM 已加载，立即检查
    checkAuth();
  }
  
})();