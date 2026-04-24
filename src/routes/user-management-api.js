/**
 * 用户管理 API 路由
 * 
 * 端点:
 * - GET    /api/users              - 获取用户列表
 * - POST   /api/users              - 创建用户
 * - PUT    /api/users/:id          - 更新用户
 * - DELETE /api/users/:id          - 删除用户
 * - POST   /api/users/:id/reset-password - 重置密码
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// 读取用户数据
function readUsers() {
    const fs = require('fs');
    const path = require('path');
    
    const DATA_DIR = path.join(__dirname, '../data');
    const USERS_FILE = path.join(DATA_DIR, 'users.json');
    
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

// 保存用户数据
function saveUsers(data) {
    const fs = require('fs');
    const path = require('path');
    
    const DATA_DIR = path.join(__dirname, '../data');
    const USERS_FILE = path.join(DATA_DIR, 'users.json');
    
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('保存用户数据失败:', error.message);
        return false;
    }
}

// 生成随机密码
function generateRandomPassword(length = 12) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// SHA256 哈希密码
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// ============================================================
// GET /api/users - 获取用户列表
// ============================================================
router.get('/', (req, res) => {
    try {
        const data = readUsers();
        const users = data.users || [];
        
        // 过滤掉敏感信息
        const safeUsers = users.map(user => {
            const { passwordHash, ...safeUser } = user;
            return safeUser;
        });
        
        res.json({
            success: true,
            users: safeUsers
        });
    } catch (error) {
        console.error('获取用户列表失败:', error.message);
        res.status(500).json({
            success: false,
            message: '获取用户列表失败'
        });
    }
});

// ============================================================
// POST /api/users - 创建用户
// ============================================================
router.post('/', (req, res) => {
    try {
        const { name, email, password, role = 'user', status = 'active' } = req.body;
        
        // 验证必填字段
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: '姓名和邮箱为必填项'
            });
        }
        
        // 验证邮箱格式
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: '邮箱格式不正确'
            });
        }
        
        const data = readUsers();
        
        // 检查邮箱是否已存在
        const existingUser = data.users.find(u => u.email === email);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: '邮箱已存在'
            });
        }
        
        // 生成用户 ID
        const userId = `user-${Date.now()}`;
        
        // 验证密码
        if (!password) {
            return res.status(400).json({
                success: false,
                message: '密码为必填项'
            });
        }
        
        // 生成密码哈希（SHA256）
        const passwordHash = hashPassword(password);
        
        // 创建新用户
        const newUser = {
            id: userId,
            name,
            email,
            passwordHash,
            role,
            status,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            loginAttempts: 0
        };
        
        data.users.push(newUser);
        data.nextUserId = (data.nextUserId || 1) + 1;
        
        // 保存用户数据
        if (!saveUsers(data)) {
            return res.status(500).json({
                success: false,
                message: '创建用户失败'
            });
        }
        
        res.status(201).json({
            success: true,
            message: '用户创建成功',
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                status: newUser.status,
                createdAt: newUser.createdAt
            }
        });
    } catch (error) {
        console.error('创建用户失败:', error.message);
        res.status(500).json({
            success: false,
            message: '创建用户失败'
        });
    }
});

// ============================================================
// PUT /api/users/:id - 更新用户
// ============================================================
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role, status, password } = req.body;
        
        const data = readUsers();
        const userIndex = data.users.findIndex(u => u.id === id);
        
        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }
        
        const user = data.users[userIndex];
        
        // 更新基本字段
        if (name !== undefined) user.name = name;
        if (email !== undefined) {
            // 检查新邮箱是否已存在
            const existingUser = data.users.find(u => u.email === email && u.id !== id);
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: '邮箱已存在'
                });
            }
            user.email = email;
        }
        if (role !== undefined) user.role = role;
        if (status !== undefined) user.status = status;
        
        // 更新密码（如果提供）
        if (password) {
            user.passwordHash = hashPassword(password);
        }
        
        user.updatedAt = new Date().toISOString();
        
        // 保存用户数据
        if (!saveUsers(data)) {
            return res.status(500).json({
                success: false,
                message: '更新用户失败'
            });
        }
        
        res.json({
            success: true,
            message: '用户更新成功',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                updatedAt: user.updatedAt
            }
        });
    } catch (error) {
        console.error('更新用户失败:', error.message);
        res.status(500).json({
            success: false,
            message: '更新用户失败'
        });
    }
});

// ============================================================
// DELETE /api/users/:id - 删除用户
// ============================================================
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        
        const data = readUsers();
        const userIndex = data.users.findIndex(u => u.id === id);
        
        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }
        
        // 删除用户
        data.users.splice(userIndex, 1);
        
        // 保存用户数据
        if (!saveUsers(data)) {
            return res.status(500).json({
                success: false,
                message: '删除用户失败'
            });
        }
        
        res.json({
            success: true,
            message: '用户删除成功'
        });
    } catch (error) {
        console.error('删除用户失败:', error.message);
        res.status(500).json({
            success: false,
            message: '删除用户失败'
        });
    }
});

// ============================================================
// POST /api/users/:id/reset-password - 重置密码
// ============================================================
router.post('/:id/reset-password', (req, res) => {
    try {
        const { id } = req.params;
        
        const data = readUsers();
        const userIndex = data.users.findIndex(u => u.id === id);
        
        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }
        
        // 生成随机密码
        const newPassword = generateRandomPassword(12);
        const newPasswordHash = hashPassword(newPassword);
        
        // 更新密码
        data.users[userIndex].passwordHash = newPasswordHash;
        data.users[userIndex].updatedAt = new Date().toISOString();
        
        // 保存用户数据
        if (!saveUsers(data)) {
            return res.status(500).json({
                success: false,
                message: '重置密码失败'
            });
        }
        
        res.json({
            success: true,
            message: '密码重置成功',
            newPassword
        });
    } catch (error) {
        console.error('重置密码失败:', error.message);
        res.status(500).json({
            success: false,
            message: '重置密码失败'
        });
    }
});

// ============================================================
// 导出路由
// ============================================================
module.exports = router;
