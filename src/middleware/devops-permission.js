/**
 * DevOps 研发管理系统权限中间件
 */

const fs = require('fs');
const path = require('path');

const PERMISSIONS_FILE = path.join(__dirname, '../data/devops-db/permissions.json');

// 加载权限配置
function loadPermissions() {
  try {
    if (fs.existsSync(PERMISSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('加载权限配置失败:', err.message);
  }
  return null;
}

/**
 * 检查用户权限
 * @param {string} userId - 用户ID
 * @param {string} action - 操作名称
 * @returns {boolean} 是否有权限
 */
function checkPermission(userId, action) {
  const perms = loadPermissions();
  if (!perms) return true; // 无配置时允许所有
  
  // 查找用户角色
  const userRole = perms.user_roles?.find(ur => ur.user_id === userId);
  if (!userRole) return false;
  
  // 查找角色权限
  const rolePerm = perms.permissions?.find(
    p => p.role_id === userRole.role_id && 
         (p.action === action || p.action === '*')
  );
  
  return rolePerm?.allowed === 1;
}

/**
 * 获取用户所有权限
 * @param {string} userId - 用户ID
 * @returns {Array} 权限列表
 */
function getUserPermissions(userId) {
  const perms = loadPermissions();
  if (!perms) return ['*'];
  
  const userRole = perms.user_roles?.find(ur => ur.user_id === userId);
  if (!userRole) return [];
  
  const rolePerms = perms.permissions?.filter(p => p.role_id === userRole.role_id);
  return rolePerms?.filter(p => p.allowed === 1).map(p => p.action) || [];
}

/**
 * 获取用户角色
 * @param {string} userId - 用户ID
 * @returns {string} 角色名称
 */
function getUserRole(userId) {
  const perms = loadPermissions();
  if (!perms) return 'admin';
  
  const userRole = perms.user_roles?.find(ur => ur.user_id === userId);
  if (!userRole) return null;
  
  const role = perms.roles?.find(r => r.id === userRole.role_id);
  return role?.name || null;
}

/**
 * Express 中间件：权限验证
 * @param {string} action - 需要的操作权限
 */
function requirePermission(action) {
  return (req, res, next) => {
    const userId = req.headers['x-user-id'] || req.query.userId || 'system';
    
    // system 用户拥有所有权限
    if (userId === 'system' || userId === 'admin') {
      return next();
    }
    
    if (!checkPermission(userId, action)) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
        required: action,
        user: userId
      });
    }
    
    next();
  };
}

/**
 * Express 中间件：获取用户信息
 */
function attachUserInfo(req, res, next) {
  const userId = req.headers['x-user-id'] || req.query.userId || 'system';
  
  req.user = {
    id: userId,
    role: getUserRole(userId),
    permissions: getUserPermissions(userId)
  };
  
  next();
}

module.exports = {
  checkPermission,
  getUserPermissions,
  getUserRole,
  requirePermission,
  attachUserInfo
};