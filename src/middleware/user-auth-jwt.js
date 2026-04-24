/**
 * 用户登录认证 - JWT 中间件
 * 
 * 功能:
 * 1. 用户登录认证 (email + password)
 * 2. JWT Token 生成和验证
 * 3. 密码加密 (BCrypt)
 * 4. Token 刷新机制
 * 5. 多设备登录支持
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const DATA_DIR = path.join(__dirname, '../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TOKENS_FILE = path.join(DATA_DIR, 'auth-tokens.json');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// 配置
const SALT_ROUNDS = 12; // BCrypt 加密强度
const ACCESS_TOKEN_EXPIRY = 15 * 60 * 1000; // 15分钟
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7天

/**
 * 读取用户数据
 */
function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            return { users: [], nextUserId: 1 };
        }
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (error) {
        console.error('读取用户数据失败:', error.message);
        return { users: [], nextUserId: 1 };
    }
}

/**
 * 保存用户数据
 */
function saveUsers(data) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('保存用户数据失败:', error.message);
        return false;
    }
}

/**
 * 读取Token表
 */
function readTokens() {
    try {
        if (!fs.existsSync(TOKENS_FILE)) {
            return [];
        }
        return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    } catch (error) {
        console.error('读取Token表失败:', error.message);
        return [];
    }
}

/**
 * 保存Token表
 */
function saveTokens(tokens) {
    try {
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
        return true;
    } catch (error) {
        console.error('保存Token表失败:', error.message);
        return false;
    }
}

/**
 * 生成 JWT Token
 */
function generateToken(userId, type = 'access', ipAddress = null) {
    const payload = {
        userId,
        type,
        iat: Date.now(),
        exp: type === 'access' 
            ? Date.now() + ACCESS_TOKEN_EXPIRY 
            : Date.now() + REFRESH_TOKEN_EXPIRY,
        ipAddress
    };
    
    // 使用简单加密 (生产环境应使用 RSA)
    const token = crypto
        .createHmac('sha256', process.env.JWT_SECRET || 'your-secret-key')
        .update(JSON.stringify(payload))
        .digest('hex');
    
    return {
        token,
        payload,
        expiresAt: new Date(payload.exp).toISOString()
    };
}

/**
 * 验证 JWT Token
 */
function verifyToken(token) {
    try {
        // 验证token格式
        if (!token || typeof token !== 'string') {
            return { valid: false, error: 'Token 无效' };
        }
        
        // token 解析 (简单版本)
        // 生产环境应使用 jwt.verify() 与 RSA 密钥
        const tokens = readTokens();
        const tokenEntry = tokens.find(t => t.token === token && t.isActive);
        
        if (!tokenEntry) {
            return { valid: false, error: 'Token 无效或已注销' };
        }
        
        // 检查过期
        const now = Date.now();
        if (new Date(tokenEntry.expiresAt).getTime() < now) {
            return { valid: false, error: 'Token 已过期' };
        }
        
        return {
            valid: true,
            userId: tokenEntry.userId,
            type: tokenEntry.type,
            token: tokenEntry.token
        };
    } catch (error) {
        console.error('Token验证失败:', error.message);
        return { valid: false, error: 'Token 验证异常' };
    }
}

/**
 * 注册新用户
 */
function registerUser({ email, password, name, role = 'user' }) {
    const data = readUsers();
    
    // 检查邮箱是否已存在
    if (data.users.find(u => u.email === email)) {
        return { success: false, error: '邮箱已存在' };
    }
    
    // 密码加密
    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
    
    const user = {
        id: data.nextUserId++,
        email,
        passwordHash,
        name: name || email.split('@')[0],
        role,
        status: 'active',
        lastLogin: null,
        createdAt: new Date().toISOString(),
        loginAttempts: 0,
        lockedUntil: null
    };
    
    data.users.push(user);
    saveUsers(data);
    
    return { success: true, user };
}

/**
 * 用户登录
 */
function loginUser({ email, password, ipAddress = null }) {
    const data = readUsers();
    const user = data.users.find(u => u.email === email);
    
    // 检查用户是否存在
    if (!user) {
        return { success: false, error: '用户名或密码错误' };
    }
    
    // 检查账户是否被锁定
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        return { success: false, error: '账户已被锁定，请稍后再试' };
    }
    
    // 验证密码
    const isValid = bcrypt.compareSync(password, user.passwordHash);
    if (!isValid) {
        user.loginAttempts = (user.loginAttempts || 0) + 1;
        
        // 连续5次失败则锁定账户
        if (user.loginAttempts >= 5) {
            user.lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 锁定5分钟
        }
        
        saveUsers(data);
        return { success: false, error: '用户名或密码错误' };
    }
    
    // 清除登录失败计数
    user.loginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date().toISOString();
    saveUsers(data);
    
    // 生成 Token
    const { token: accessToken, expiresAt: accessTokenExpiry } = generateToken(user.id, 'access', ipAddress);
    const { token: refreshToken, expiresAt: refreshTokenExpiry } = generateToken(user.id, 'refresh', ipAddress);
    
    // 保存 Token
    const tokens = readTokens();
    saveTokens([
        ...tokens.filter(t => t.userId !== user.id), // 清除旧token
        {
            userId: user.id,
            token: accessToken,
            type: 'access',
            ipAddress,
            createdAt: new Date().toISOString(),
            expiresAt: accessTokenExpiry,
            isActive: true
        },
        {
            userId: user.id,
            token: refreshToken,
            type: 'refresh',
            ipAddress,
            createdAt: new Date().toISOString(),
            expiresAt: refreshTokenExpiry,
            isActive: true
        }
    ]);
    
    return {
        success: true,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
        },
        accessToken,
        refreshToken,
        accessTokenExpiry,
        refreshTokenExpiry
    };
}

/**
 * 修改密码
 */
function changePassword(userId, currentPassword, newPassword) {
    const users = readUsers();
    const userIndex = users.users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return { success: false, error: '用户不存在' };
    }
    
    // 验证当前密码
    const bcrypt = require('bcrypt');
    const isValid = bcrypt.compareSync(currentPassword, users.users[userIndex].passwordHash);
    
    if (!isValid) {
        return { success: false, error: '当前密码错误' };
    }
    
    // 更新密码
    const newPasswordHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
    users.users[userIndex].passwordHash = newPasswordHash;
    saveUsers(users);
    
    return { success: true };
}

/**
 * 刷新 Token
 */
function refreshToken(refreshToken) {
    const verifyResult = verifyToken(refreshToken);
    
    if (!verifyResult.valid) {
        return { success: false, error: verifyResult.error };
    }
    
    if (verifyResult.type !== 'refresh') {
        return { success: false, error: '无效的 Token 类型' };
    }
    
    // 生成新的 token
    const { token: accessToken, expiresAt: accessTokenExpiry } = generateToken(verifyResult.userId, 'access');
    const { token: newRefreshToken, expiresAt: refreshTokenExpiry } = generateToken(verifyResult.userId, 'refresh');
    
    // 更新数据库
    const tokens = readTokens();
    const newTokens = tokens
        .filter(t => t.userId !== verifyResult.userId) // 清除旧token
        .concat([
            {
                userId: verifyResult.userId,
                token: accessToken,
                type: 'access',
                createdAt: new Date().toISOString(),
                expiresAt: accessTokenExpiry,
                isActive: true
            },
            {
                userId: verifyResult.userId,
                token: newRefreshToken,
                type: 'refresh',
                createdAt: new Date().toISOString(),
                expiresAt: refreshTokenExpiry,
                isActive: true
            }
        ]);
    
    saveTokens(newTokens);
    
    return {
        success: true,
        accessToken,
        refreshToken: newRefreshToken,
        accessTokenExpiry,
        refreshTokenExpiry
    };
}

/**
 * 注销用户
 */
function logoutUser(userId, token) {
    const tokens = readTokens();
    const newTokens = tokens.map(t => {
        if (t.userId === userId && t.token === token) {
            return { ...t, isActive: false };
        }
        return t;
    });
    
    saveTokens(newTokens);
    return { success: true };
}

/**
 * 用户注册中间件 (Express)
 */
function userRegister(req, res, next) {
    const { email, password, name } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必需字段: email, password'
            }
        });
    }
    
    const result = registerUser({ email, password, name });
    
    if (!result.success) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'RegistrationError',
                message: result.error
            }
        });
    }
    
    req.user = result.user;
    next();
}

/**
 * 用户登录中间件 (Express)
 */
function userLogin(req, res, next) {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    if (!email || !password) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'ValidationError',
                message: '缺少必需字段: email, password'
            }
        });
    }
    
    const result = loginUser({ email, password, ipAddress });
    
    if (!result.success) {
        return res.status(401).json({
            code: 401,
            error: {
                type: 'AuthenticationError',
                message: result.error
            }
        });
    }
    
    req.user = result.user;
    req.tokens = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
    };
    next();
}

/**
 * JWT 认证中间件 (Express)
 */
function jwtAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            code: 401,
            error: {
                type: 'AuthenticationError',
                message: '缺少 Authorization 头'
            }
        });
    }
    
    const token = authHeader.substring(7);
    const result = verifyToken(token);
    
    if (!result.valid) {
        return res.status(401).json({
            code: 401,
            error: {
                type: 'AuthenticationError',
                message: result.error
            }
        });
    }
    
    // 将用户信息添加到请求对象
    req.user = {
        userId: result.userId,
        token: result.token
    };
    
    next();
}

/**
 * 权限验证中间件 (Express)
 */
function permissionMiddleware(requiredRole = null) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                code: 401,
                error: {
                    type: 'AuthenticationError',
                    message: '未认证'
                }
            });
        }
        
        if (requiredRole && req.user.role !== requiredRole) {
            return res.status(403).json({
                code: 403,
                error: {
                    type: 'PermissionError',
                    message: '权限不足'
                }
            });
        }
        
        next();
    };
}

/**
 * 初始化默认管理员
 */
function initDefaultAdmin() {
    const data = readUsers();
    
    if (data.users.some(u => u.role === 'admin')) {
        console.log('管理员已存在，跳过初始化');
        return;
    }
    
    // 创建默认管理员
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@taskplatform.com';
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123@!';
    
    const result = registerUser({
        email: adminEmail,
        password: adminPassword,
        name: '系统管理员',
        role: 'admin'
    });
    
    if (result.success) {
        console.log('✅ 默认管理员创建成功:');
        console.log(`   Email: ${adminEmail}`);
        console.log(`   Password: ${adminPassword}`);
        console.log('⚠️  请尽快修改默认密码');
    }
}

/**
 * 导出 API
 */
module.exports = {
    // 用户管理
    registerUser,
    initDefaultAdmin,
    readUsers,
    changePassword,
    
    // 认证
    loginUser,
    refreshToken,
    logoutUser,
    verifyToken,
    
    // 中间件
    userRegister,
    userLogin,
    jwtAuthMiddleware,
    permissionMiddleware
};
