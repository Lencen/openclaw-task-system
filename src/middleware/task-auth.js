/**
 * TaskExecutionAPI 认证中间件模块
 * 
 * 功能:
 * 1. 结合 TaskExecutionAPI 和 Agent 认证
 * 2. 验证请求的 Token 和 Agent 权限
 * 3. 提供统一的认证接口
 */

const auth = require('./auth');

/**
 * 认证中间件 - 验证 Agent 权限
 */
function authenticateTaskRequest(requiredPermission = 'execute') {
    return (req, res, next) => {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({
                code: 401,
                error: {
                    type: 'AuthenticationError',
                    message: '缺少 Authorization 头，需要 Bearer Token'
                }
            });
        }
        
        // 支持 Bearer token
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : authHeader;
        
        // 验证 Token
        const verifyResult = auth.verifyToken(token);
        
        if (!verifyResult.valid) {
            return res.status(401).json({
                code: 401,
                error: {
                    type: 'AuthenticationError',
                    message: verifyResult.error
                }
            });
        }
        
        // 验证 Agent 权限
        const permissionResult = auth.verifyPermission(
            verifyResult.agentId, 
            requiredPermission
        );
        
        if (!permissionResult.valid) {
            return res.status(403).json({
                code: 403,
                error: {
                    type: 'PermissionError',
                    message: permissionResult.error
                }
            });
        }
        
        // 将 Agent 信息添加到请求对象
        req.agent = {
            agentId: verifyResult.agentId,
            agentName: permissionResult.agentName,
            token: verifyResult.token,
            permissions: permissionResult.permissions
        };
        
        next();
    };
}

/**
 * 所有任务 CRUD 操作都需要写权限
 */
const requireWritePermission = authenticateTaskRequest('write');

/**
 * 所有任务执行操作需要执行权限
 */
const requireExecutePermission = authenticateTaskRequest('execute');

/**
 * 所有任务管理操作需要管理权限
 */
const requireManagePermission = authenticateTaskRequest('manage');

/**
 * 从请求中获取 Agent 信息
 */
function getAgentFromRequest(req) {
    return req.agent || null;
}

/**
 * 导出 API
 */
module.exports = {
    authenticateTaskRequest,
    requireWritePermission,
    requireExecutePermission,
    requireManagePermission,
    getAgentFromRequest
};
