/**
 * RBAC (基于角色的访问控制) 权限中间件
 * 
 * @version 1.0
 * @date 2026-03-19
 * 
 * 权限模型:
 * - read: 读取资源
 * - write: 创建/更新资源
 * - execute: 执行操作
 * - manage: 管理权限/Agent
 * 
 * 角色权限分配:
 * | Agent        | read | write | execute | manage |
 * |--------------|------|-------|---------|--------|
 * | main         |  ✓   |   ✓   |    ✓    |   ✓    |
 * | deep         |  ✓   |   ✓   |    ✓    |   ✓    |
 * | test         |  ✓   |   ✓   |    ✓    |   ✓    |
 * | coder        |  ✓   |   ✓   |    ✓    |   -    |
 * | coder-1      |  ✓   |   ✓   |    ✓    |   -    |
 * | coder-2      |  ✓   |   ✓   |    ✓    |   -    |
 * | fast         |  ✓   |   ✓   |    ✓    |   -    |
 * | chat         |  ✓   |   ✓   |    ✓    |   -    |
 * | office       |  ✓   |   ✓   |    ✓    |   -    |
 * | office-1     |  ✓   |   ✓   |    ✓    |   -    |
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const REGISTRY_FILE = path.join(DATA_DIR, 'registered-agents.json');

// 默认权限配置
const DEFAULT_PERMISSIONS = {
    'agent-main': ['read', 'write', 'execute', 'manage'],
    'agent-deep': ['read', 'write', 'execute', 'manage'],
    'agent-test': ['read', 'write', 'execute', 'manage'],
    'agent-coder': ['read', 'write', 'execute'],
    'agent-coder-1': ['read', 'write', 'execute'],
    'agent-coder-2': ['read', 'write', 'execute'],
    'agent-fast': ['read', 'write', 'execute'],
    'agent-chat': ['read', 'write', 'execute'],
    'agent-office': ['read', 'write', 'execute'],
    'agent-office-1': ['read', 'write', 'execute']
};

// 资源权限映射
const RESOURCE_PERMISSIONS = {
    // 任务相关
    'tasks:create': ['write'],
    'tasks:read': ['read'],
    'tasks:update': ['write'],
    'tasks:delete': ['manage'],
    'tasks:execute': ['execute'],
    
    // 项目相关
    'projects:create': ['write'],
    'projects:read': ['read'],
    'projects:update': ['write'],
    'projects:delete': ['manage'],
    
    // Agent相关
    'agents:create': ['manage'],
    'agents:read': ['read'],
    'agents:update': ['manage'],
    'agents:delete': ['manage'],
    'agents:execute': ['execute'],
    
    // 文档相关
    'docs:create': ['write'],
    'docs:read': ['read'],
    'docs:update': ['write'],
    'docs:delete': ['manage'],
    
    // 技能相关
    'skills:create': ['write'],
    'skills:read': ['read'],
    'skills:update': ['write'],
    'skills:delete': ['manage'],
    
    // 系统相关
    'system:read': ['read'],
    'system:manage': ['manage'],
    'system:config': ['manage']
};

/**
 * 加载 Agent 注册表
 */
function loadRegistry() {
    try {
        if (fs.existsSync(REGISTRY_FILE)) {
            const content = fs.readFileSync(REGISTRY_FILE, 'utf8');
            return JSON.parse(content);
        }
    } catch (e) {
        console.error('[RBAC] 加载注册表失败:', e.message);
    }
    return { version: 1, agents: {} };
}

/**
 * 获取 Agent 权限
 * @param {string} agentId - Agent ID
 * @returns {string[]} 权限数组
 */
function getAgentPermissions(agentId) {
    // 优先从注册表获取
    const registry = loadRegistry();
    if (registry.agents && registry.agents[agentId]) {
        return registry.agents[agentId].permissions || [];
    }
    
    // 使用默认权限
    return DEFAULT_PERMISSIONS[agentId] || [];
}

/**
 * 检查 Agent 是否有指定权限
 * @param {string} agentId - Agent ID
 * @param {string} permission - 权限名称
 * @returns {boolean}
 */
function hasPermission(agentId, permission) {
    const perms = getAgentPermissions(agentId);
    return perms.includes(permission);
}

/**
 * 检查 Agent 是否有访问资源的权限
 * @param {string} agentId - Agent ID
 * @param {string} resource - 资源标识 (如 tasks:read)
 * @returns {boolean}
 */
function canAccess(agentId, resource) {
    const requiredPerms = RESOURCE_PERMISSIONS[resource];
    if (!requiredPerms) {
        // 未定义的资源，默认需要 manage 权限
        return hasPermission(agentId, 'manage');
    }
    
    return requiredPerms.some(perm => hasPermission(agentId, perm));
}

/**
 * 创建权限验证中间件
 * @param {string} permission - 所需权限
 * @returns {Function} Express 中间件
 */
function requirePermission(permission) {
    return (req, res, next) => {
        const agentId = req.headers['x-agent-id'] || 
                       req.headers['x-agent-id'] ||
                       req.agent?.agentId ||
                       'agent-main';
        
        if (!hasPermission(agentId, permission)) {
            return res.status(403).json({
                success: false,
                error: 'Permission denied',
                required: permission,
                agentId: agentId,
                message: `Agent ${agentId} 缺少 ${permission} 权限`
            });
        }
        
        next();
    };
}

/**
 * 创建资源访问验证中间件
 * @param {string} resource - 资源标识
 * @returns {Function} Express 中间件
 */
function requireResource(resource) {
    return (req, res, next) => {
        const agentId = req.headers['x-agent-id'] || 
                       req.agent?.agentId ||
                       'agent-main';
        
        if (!canAccess(agentId, resource)) {
            return res.status(403).json({
                success: false,
                error: 'Resource access denied',
                resource: resource,
                agentId: agentId,
                message: `Agent ${agentId} 无权访问 ${resource}`
            });
        }
        
        next();
    };
}

/**
 * 验证 Agent Token 并加载权限
 */
function authenticateAgent(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: '缺少 Authorization 头'
        });
    }
    
    // 从注册表查找 Agent
    const registry = loadRegistry();
    let agentId = null;
    let agentData = null;
    
    // 遍历查找匹配的 token
    if (registry.agents) {
        for (const [id, agent] of Object.entries(registry.agents)) {
            if (agent.token === token) {
                agentId = id;
                agentData = agent;
                break;
            }
        }
    }
    
    if (!agentId) {
        return res.status(401).json({
            success: false,
            error: 'Invalid token',
            message: 'Token 无效或已过期'
        });
    }
    
    // 检查 token 过期
    if (agentData.tokenExpiresAt) {
        if (new Date(agentData.tokenExpiresAt) < new Date()) {
            return res.status(401).json({
                success: false,
                error: 'Token expired',
                message: 'Token 已过期'
            });
        }
    }
    
    // 注入 Agent 信息到请求
    req.agent = {
        agentId: agentId,
        name: agentData.name,
        permissions: agentData.permissions || getAgentPermissions(agentId),
        token: token
    };
    
    next();
}

/**
 * 预定义权限中间件
 */
const requireRead = requirePermission('read');
const requireWrite = requirePermission('write');
const requireExecute = requirePermission('execute');
const requireManage = requirePermission('manage');

/**
 * 任务权限中间件
 */
const requireTaskRead = requireResource('tasks:read');
const requireTaskWrite = requireResource('tasks:write');
const requireTaskExecute = requireResource('tasks:execute');
const requireTaskDelete = requireResource('tasks:delete');

/**
 * Agent 权限中间件
 */
const requireAgentRead = requireResource('agents:read');
const requireAgentManage = requireResource('agents:manage');

/**
 * 文档权限中间件
 */
const requireDocRead = requireResource('docs:read');
const requireDocWrite = requireResource('docs:write');

/**
 * 系统权限中间件
 */
const requireSystemRead = requireResource('system:read');
const requireSystemManage = requireResource('system:manage');

/**
 * 导出模块
 */
module.exports = {
    // 核心函数
    getAgentPermissions,
    hasPermission,
    canAccess,
    authenticateAgent,
    
    // 权限验证中间件
    requirePermission,
    requireResource,
    
    // 预定义中间件
    requireRead,
    requireWrite,
    requireExecute,
    requireManage,
    
    // 任务权限
    requireTaskRead,
    requireTaskWrite,
    requireTaskExecute,
    requireTaskDelete,
    
    // Agent权限
    requireAgentRead,
    requireAgentManage,
    
    // 文档权限
    requireDocRead,
    requireDocWrite,
    
    // 系统权限
    requireSystemRead,
    requireSystemManage,
    
    // 常量
    DEFAULT_PERMISSIONS,
    RESOURCE_PERMISSIONS
};