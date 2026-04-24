/**
 * 用户登录认证 API 路由
 * 
 * 端点:
 * - POST /api/auth/register   - 用户注册
 * - POST /api/auth/login      - 用户登录
 * - POST /api/auth/logout     - 用户登出
 * - POST /api/auth/refresh    - 刷新 Token
 * - GET  /api/auth/profile    - 获取用户信息
 * - POST /api/auth/change-password - 修改密码
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/user-auth-jwt');

/**
 * POST /api/auth/register - 用户注册
 */
router.post('/register', auth.userRegister, (req, res) => {
    res.status(201).json({
        code: 201,
        data: {
            message: '注册成功',
            user: {
                id: req.user.id,
                email: req.user.email,
                name: req.user.name,
                role: req.user.role
            }
        }
    });
});

/**
 * POST /api/auth/login - 用户登录
 */
router.post('/login', (req, res) => {
    const result = auth.loginUser({
        email: req.body.email,
        password: req.body.password,
        ipAddress: req.ip
    });
    
    if (!result.success) {
        return res.status(401).json({
            code: 401,
            error: {
                type: 'AuthenticationError',
                message: result.error
            }
        });
    }
    
    res.json({
        code: 200,
        data: {
            message: '登录成功',
            user: result.user,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            accessTokenExpiry: result.accessTokenExpiry,
            refreshTokenExpiry: result.refreshTokenExpiry
        }
    });
});

/**
 * POST /api/auth/logout - 用户登出
 */
router.post('/logout', auth.jwtAuthMiddleware, (req, res) => {
    const { token } = req.tokens || req;
    
    auth.logoutUser(req.user.userId, token);
    
    res.json({
        code: 200,
        data: {
            message: '登出成功'
        }
    });
});

/**
 * POST /api/auth/refresh - 刷新 Token
 */
router.post('/refresh', (req, res) => {
    const result = auth.refreshToken(req.body.refreshToken);
    
    if (!result.success) {
        return res.status(401).json({
            code: 401,
            error: {
                type: 'AuthenticationError',
                message: result.error
            }
        });
    }
    
    res.json({
        code: 200,
        data: {
            message: 'Token 刷新成功',
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            accessTokenExpiry: result.accessTokenExpiry,
            refreshTokenExpiry: result.refreshTokenExpiry
        }
    });
});

/**
 * GET /api/auth/profile - 获取用户信息
 */
router.get('/profile', auth.jwtAuthMiddleware, (req, res) => {
    const users = auth.readUsers();
    const user = users.users.find(u => u.id === req.user.userId);
    
    if (!user) {
        return res.status(404).json({
            code: 404,
            error: {
                type: 'NotFoundError',
                message: '用户不存在'
            }
        });
    }
    
    res.json({
        code: 200,
        data: {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                status: user.status,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt
            }
        }
    });
});

/**
 * POST /api/auth/change-password - 修改密码
 */
router.post('/change-password', auth.jwtAuthMiddleware, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必需字段: currentPassword, newPassword'
            }
        });
    }
    
    const users = auth.readUsers();
    const userIndex = users.users.findIndex(u => u.id === req.user.userId);
    
    if (userIndex === -1) {
        return res.status(404).json({
            code: 404,
            error: {
                type: 'NotFoundError',
                message: '用户不存在'
            }
        });
    }
    
    // 验证当前密码
    const bcrypt = require('bcrypt');
    const isValid = bcrypt.compareSync(currentPassword, users.users[userIndex].passwordHash);
    
    if (!isValid) {
        return res.status(401).json({
            code: 401,
            error: {
                type: 'AuthenticationError',
                message: '当前密码错误'
            }
        });
    }
    
    // 更新密码
    const newPasswordHash = bcrypt.hashSync(newPassword, 12);
    users.users[userIndex].passwordHash = newPasswordHash;
    
    // 保存
    auth.saveUsers(users);
    
    // 注销所有旧 token
    auth.logoutUser(req.user.userId, req.tokens?.token);
    
    res.json({
        code: 200,
        data: {
            message: '密码修改成功，请重新登录'
        }
    });
});

/**
 * GET /api/auth/check - 检查 Token 是否有效
 */
router.get('/check', auth.jwtAuthMiddleware, (req, res) => {
    res.json({
        code: 200,
        data: {
            valid: true,
            user: {
                id: req.user.userId
            }
        }
    });
});

/**
 * 导出路由
 */
module.exports = router;
