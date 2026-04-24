/**
 * 认证 API 路由
 * 
 * 提供用户登录、登出、Token 验证等功能
 * 
 * @created 2026-03-20
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 数据目录
const DATA_DIR = path.join(__dirname, '../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TOKENS_FILE = path.join(DATA_DIR, 'auth-tokens.json');

// 会话开始钩子
let sessionStartHook;
try {
  const hookModule = require('../middleware/session-start-hook');
  sessionStartHook = hookModule.sessionStartHook;
  console.log('[auth-api] 会话开始钩子加载成功');
} catch (e) {
  console.log('[auth-api] 会话开始钩子加载失败，使用空实现');
  sessionStartHook = async () => ({ hasNotifications: false, notificationCount: 0 });
}

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 加载认证模块（如果存在）
let authV3;
try {
  authV3 = require('../middleware/auth-v3');
} catch (e) {
  console.log('[auth-api] auth-v3 模块加载失败，使用简化实现');
  authV3 = null;
}

/**
 * 用户存储管理（简化版）
 */
const UserStore = {
  getAll() {
    try {
      if (!fs.existsSync(USERS_FILE)) return [];
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      // 支持两种格式: { users: [...] } 或 [...]
      return Array.isArray(data) ? data : (data.users || []);
    } catch {
      return [];
    }
  },
  
  getRawData() {
    try {
      if (!fs.existsSync(USERS_FILE)) return { users: [], nextUserId: 1 };
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch {
      return { users: [], nextUserId: 1 };
    }
  },
  
  save(user) {
    const rawData = this.getRawData();
    const users = Array.isArray(rawData) ? rawData : (rawData.users || []);
    const existing = users.findIndex(u => u.id === user.id);
    
    if (existing >= 0) {
      users[existing] = { ...users[existing], ...user, updatedAt: new Date().toISOString() };
    } else {
      users.push({ ...user, createdAt: new Date().toISOString() });
    }

    // 保存为 { users: [...] } 格式
    const saveData = Array.isArray(rawData) ? users : { ...rawData, users };
    fs.writeFileSync(USERS_FILE, JSON.stringify(saveData, null, 2));
    return user;
  },
  
  findByEmail(email) {
    const users = this.getAll();
    if (!Array.isArray(users)) {
      console.error('[UserStore] findByEmail: users is not array', typeof users);
      return null;
    }
    return users.find(u => u.email === email);
  },
  
  findById(id) {
    const users = this.getAll();
    if (!Array.isArray(users)) {
      console.error('[UserStore] findById: users is not array', typeof users);
      return null;
    }
    return users.find(u => u.id === id);
  }
};

/**
 * Token 存储管理（简化版）
 */
const TokenStore = {
  getAll() {
    try {
      if (!fs.existsSync(TOKENS_FILE)) return [];
      return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
    } catch {
      return [];
    }
  },
  
  save(token, data) {
    const tokens = this.getAll();
    const existing = tokens.findIndex(t => t.token === token);
    
    const tokenData = {
      token,
      ...data,
      createdAt: data.createdAt || new Date().toISOString()
    };

    if (existing >= 0) {
      tokens[existing] = tokenData;
    } else {
      tokens.push(tokenData);
    }

    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
    return tokenData;
  },
  
  find(token) {
    const tokens = this.getAll();
    return tokens.find(t => t.token === token);
  },
  
  delete(token) {
    const tokens = this.getAll();
    const filtered = tokens.filter(t => t.token !== token);
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(filtered, null, 2));
  }
};

/**
 * 密码哈希（简化版 - 生产环境应使用 bcrypt）
 */
function hashPassword(password, salt = '') {
  const combined = salt ? `${password}:${salt}` : password;
  let hash = crypto.createHash('sha256');
  for (let i = 0; i < 1000; i++) {
    hash = crypto.createHash('sha256');
    hash.update(combined + i);
  }
  return hash.digest('hex');
}

function verifyPassword(password, hashedPassword, salt = '') {
  return hashPassword(password, salt) === hashedPassword;
}

/**
 * JWT 实现（简化版）
 */
const JWT = {
  secret: process.env.JWT_SECRET || 'task-platform-secret-key',
  expiresIn: 30 * 24 * 60 * 60 * 1000, // 30 天
  
  sign(payload) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Date.now();
    
    const data = {
      ...payload,
      iat: now,
      exp: now + this.expiresIn
    };
    
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(data)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    
    return `${headerB64}.${payloadB64}.${signature}`;
  },
  
  verify(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return { valid: false, error: 'Invalid token format' };

      const [headerB64, payloadB64, signature] = parts;
      
      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');
      
      if (signature !== expectedSignature) {
        return { valid: false, error: 'Invalid signature' };
      }

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      
      if (payload.exp && Date.now() > payload.exp) {
        return { valid: false, error: 'Token expired' };
      }

      return { valid: true, payload };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
};

// ============================================================
// API 路由
// ============================================================

/**
 * POST /api/auth/login
 * 用户登录
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, passwordHash, rememberMe } = req.body;
    
    // 支持两种格式：明文密码或预计算哈希
    let finalPasswordHash = passwordHash;
    
    // 如果提供了明文密码，计算 SHA256 哈希
    if (password && !passwordHash) {
      finalPasswordHash = crypto.createHash('sha256').update(password).digest('hex');
    }
    
    // 验证必填字段
    if (!email || !finalPasswordHash) {
      return res.status(400).json({
        success: false,
        error: { message: '请提供邮箱和密码' }
      });
    }
    
    // 查找用户
    let user = UserStore.findByEmail(email);
    
    // 如果用户不存在，创建一个演示账户
    if (!user) {
      // 演示用户：使用已知密码哈希
      const demoPasswordHash = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'; // password
      if (finalPasswordHash === demoPasswordHash) {
        user = UserStore.save({
          id: `user-${Date.now()}`,
          email: email,
          name: email.split('@')[0],
          passwordHash: hashPassword('password'),
          role: 'admin'
        });
        console.log(`[auth-api] 创建演示用户: ${email}`);
      }
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { message: '邮箱或密码错误' }
      });
    }
    
    // 验证密码哈希
    // 演示密码: password (SHA256: 5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8)
    const demoPasswordHash = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8';
    if (user.passwordHash && finalPasswordHash !== demoPasswordHash) {
      // 如果不是演示密码，验证实际哈希
      if (user.passwordHash !== finalPasswordHash) {
        return res.status(401).json({
          success: false,
          error: { message: '邮箱或密码错误' }
        });
      }
    }
    
    // 生成 Token
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user'
    };
    
    const token = JWT.sign(tokenPayload);
    
    // 存储 Token
    TokenStore.save(token, {
      type: 'user',
      userId: user.id,
      email: user.email
    });
    
    // 返回结果（不返回密码哈希）
    const { passwordHash: _, ...safeUser } = user;
    
    console.log(`[auth-api] 用户登录成功: ${email}`);
    
    // 触发会话开始钩子，检查通知
    const session = {
      id: `session-${Date.now()}`,
      userId: user.id,
      agentId: 'main',
      email: user.email,
      createdAt: new Date().toISOString()
    };
    const hookResult = await sessionStartHook(session);
    
    // 构建响应数据
    const responseData = {
      token: token,
      expiresIn: JWT.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    };
    
    // 如果有通知，添加到响应中
    if (hookResult.hasNotifications) {
      responseData.notifications = {
        count: hookResult.notificationCount,
        hasUrgent: hookResult.stats.hasUrgent,
        byType: hookResult.stats.byType,
        message: hookResult.message
      };
    }
    
    res.json({
      success: true,
      data: responseData
    });
    
  } catch (error) {
    console.error('[auth-api] 登录错误:', error);
    res.status(500).json({
      success: false,
      error: { message: '服务器错误，请稍后重试' }
    });
  }
});

/**
 * POST /api/auth/logout
 * 用户登出
 */
router.post('/logout', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      TokenStore.delete(token);
      console.log('[auth-api] 用户登出');
    }
    
    res.json({
      success: true,
      message: '已成功登出'
    });
    
  } catch (error) {
    console.error('[auth-api] 登出错误:', error);
    res.status(500).json({
      success: false,
      error: { message: '服务器错误' }
    });
  }
});

/**
 * GET /api/auth/verify
 * 验证 Token 有效性
 */
router.get('/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        valid: false,
        error: 'No token provided'
      });
    }
    
    const token = authHeader.substring(7);
    
    // JWT 验证
    const jwtResult = JWT.verify(token);
    if (!jwtResult.valid) {
      return res.status(401).json({
        valid: false,
        error: jwtResult.error
      });
    }
    
    // 检查 Token 存储
    const stored = TokenStore.find(token);
    if (!stored) {
      return res.status(401).json({
        valid: false,
        error: 'Token revoked'
      });
    }
    
    // 获取用户信息
    const user = UserStore.findById(jwtResult.payload.userId);
    if (!user) {
      return res.status(401).json({
        valid: false,
        error: 'User not found'
      });
    }
    
    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('[auth-api] Token 验证错误:', error);
    res.status(500).json({
      valid: false,
      error: 'Server error'
    });
  }
});

/**
 * GET /api/auth/feishu
 * 飞书 OAuth 跳转
 */
router.get('/feishu', (req, res) => {
  // 获取飞书配置（从环境变量或配置文件）
  const appId = process.env.FEISHU_APP_ID;
  const redirectUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/api/auth/feishu/callback`);
  
  if (!appId) {
    return res.status(500).json({
      success: false,
      error: { message: '飞书应用未配置' }
    });
  }
  
  // 跳转到飞书授权页面
  const authUrl = `https://open.feishu.cn/open-apis/authen/v1/index?redirect_uri=${redirectUri}&app_id=${appId}`;
  res.redirect(authUrl);
});

/**
 * GET /api/auth/feishu/callback
 * 飞书 OAuth 回调
 */
router.get('/feishu/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.redirect('/login.html?error=no_code');
    }
    
    // 调用飞书 API 获取用户信息
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    
    if (!appId || !appSecret) {
      return res.redirect('/login.html?error=feishu_not_configured');
    }
    
    // 获取 tenant_access_token
    const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret })
    });
    const tokenData = await tokenRes.json();
    
    if (tokenData.code !== 0) {
      console.error('[auth-api] 获取飞书 token 失败:', tokenData.msg);
      return res.redirect('/login.html?error=feishu_token_failed');
    }
    
    const accessToken = tokenData.tenant_access_token;
    
    // 获取用户信息
    const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/access_token/get', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    });
    const userData = await userRes.json();
    
    if (userData.code !== 0) {
      console.error('[auth-api] 获取飞书用户信息失败:', userData.msg);
      return res.redirect('/login.html?error=feishu_user_failed');
    }
    
    const feishuUser = userData.data;
    
    // 查找或创建用户
    let user = UserStore.findByEmail(feishuUser.email);
    if (!user) {
      user = UserStore.save({
        id: `feishu-${feishuUser.open_id}`,
        email: feishuUser.email,
        name: feishuUser.name,
        avatar_url: feishuUser.avatar_url,
        source: 'feishu'
      });
    }
    
    // 生成 Token
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user'
    };
    
    const token = JWT.sign(tokenPayload);
    
    // 存储 Token
    TokenStore.save(token, {
      type: 'user',
      userId: user.id,
      source: 'feishu'
    });
    
    // 重定向到首页（携带 Token）
    res.redirect(`/dashboard-new.html?token=${token}`);
    
  } catch (error) {
    console.error('[auth-api] 飞书 OAuth 回调错误:', error);
    res.redirect('/login.html?error=server_error');
  }
});

/**
 * POST /api/auth/register
 * 用户注册
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // 验证必填字段
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: { message: '请提供完整的注册信息' }
      });
    }
    
    // 检查用户是否已存在
    const existingUser = UserStore.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: { message: '该邮箱已被注册' }
      });
    }
    
    // 创建用户（密码使用 SHA256 哈希）
    const passwordHash = hashPassword(password);
    
    const user = UserStore.save({
      id: `user-${Date.now()}`,
      email: email,
      name: name,
      passwordHash: passwordHash,
      role: 'user'
    });
    
    console.log(`[auth-api] 新用户注册: ${email}`);
    
    // 返回成功（不返回密码哈希）
    const { passwordHash: _, ...safeUser } = user;
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      }
    });
    
  } catch (error) {
    console.error('[auth-api] 注册错误:', error);
    res.status(500).json({
      success: false,
      error: { message: '服务器错误，请稍后重试' }
    });
  }
});

module.exports = router;