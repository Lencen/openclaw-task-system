/**
 * OpenClaw 远程部署服务 API
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

// AES-256 加密辅助函数
const AES_SECRET = process.env.DEPLOY_AES_SECRET || (() => { throw new Error('DEPLOY_AES_SECRET environment variable is required') })();

/**
 * AES-256 加密
 */
function encryptAES(text) {
    // 确保密钥长度为32字节（256位）
    const key = crypto.createHash('sha256').update(AES_SECRET).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

/**
 * AES-256 解密
 */
function decryptAES(encryptedText) {
    // 确保密钥长度为32字节（256位）
    const key = crypto.createHash('sha256').update(AES_SECRET).digest();
    const parts = encryptedText.split(':');
    if (parts.length !== 2) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// 数据文件路径
const DATA_DIR = path.join(__dirname, '..', 'data', 'deploy');
const TASKS_FILE = path.join(DATA_DIR, 'deploy-tasks.jsonl');
const QUOTA_FILE = path.join(DATA_DIR, 'daily-quota.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TASKS_FILE)) fs.writeFileSync(TASKS_FILE, '');
if (!fs.existsSync(QUOTA_FILE)) fs.writeFileSync(QUOTA_FILE, JSON.stringify({}, null, 2));

/**
 * 获取客户端 IP
 */
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
        || req.socket.remoteAddress 
        || '127.0.0.1';
}

/**
 * 今日已用名额计数
 */
function countTodayRequests() {
    const now = moment().format('YYYY-MM-DD');
    try {
        const quotaData = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'));
        return quotaData[now] || 0;
    } catch {
        return 0;
    }
}

/**
 * 增加今日请求数
 */
function incrementTodayRequests() {
    const now = moment().format('YYYY-MM-DD');
    try {
        let quotaData = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'));
        quotaData[now] = (quotaData[now] || 0) + 1;
        fs.writeFileSync(QUOTA_FILE, JSON.stringify(quotaData, null, 2));
        return quotaData[now];
    } catch (error) {
        console.error('[Quota] 增加请求数失败:', error.message);
        return null;
    }
}

/**
 * 创建部署任务
 */
function createDeployTask(taskData) {
    const id = `deploy-${uuidv4().slice(0, 8)}`;
    const task = {
        id,
        ...taskData,
        status: 'pending',
        progress: '已提交，等待处理',
        createdAt: new Date().toISOString(),
        completedAt: null,
        error: null
    };
    
    // 追加写入 JSONL
    fs.appendFileSync(TASKS_FILE, JSON.stringify(task) + '\n');
    return task;
}

/**
 * 更新部署任务状态
 */
function updateDeployTask(id, updates) {
    try {
        const content = fs.readFileSync(TASKS_FILE, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        let updated = false;
        
        const newLines = lines.map(line => {
            try {
                const task = JSON.parse(line);
                if (task.id === id) {
                    updated = true;
                    return JSON.stringify({ ...task, ...updates, id }); // 保持 id 不变
                }
                return line;
            } catch {
                return line;
            }
        });
        
        if (updated) {
            fs.writeFileSync(TASKS_FILE, newLines.join('\n') + '\n');
            return true;
        }
        return false;
    } catch (error) {
        console.error('[Deploy] 更新任务失败:', error.message);
        return false;
    }
}

/**
 * 获取部署任务
 */
function getDeployTask(id) {
    try {
        const content = fs.readFileSync(TASKS_FILE, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const task = JSON.parse(line);
                if (task.id === id) {
                    return task;
                }
            } catch {}
        }
        return null;
    } catch (error) {
        console.error('[Deploy] 获取任务失败:', error.message);
        return null;
    }
}

/**
 * 获取用户历史记录
 */
function getUserHistory(userId) {
    try {
        const content = fs.readFileSync(TASKS_FILE, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        
        return lines
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(task => task && task.userId === userId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
        console.error('[Deploy] 获取历史失败:', error.message);
        return [];
    }
}

/**
 * 获取所有历史记录
 */
function getAllHistory() {
    try {
        const content = fs.readFileSync(TASKS_FILE, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        
        return lines
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
        console.error('[Deploy] 获取全部历史失败:', error.message);
        return [];
    }
}

/**
 * 路由: GET /
 * 首页
 */
router.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>OpenClaw Remote Deploy</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: #667eea; color: white; padding: 20px; border-radius: 10px; }
        .form-group { margin: 15px 0; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        button { background: #667eea; color: white; padding: 12px 20px; border: none; border-radius: 5px; cursor: pointer; }
        button:disabled { background: #ccc; }
        .quota { background: #f0f4ff; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .history { margin-top: 30px; }
        .history-item { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .status { padding: 3px 8px; border-radius: 3px; font-size: 0.8em; }
        .status-pending { background: #fff7ed; color: #ea580c; }
        .status-running { background: #eff6ff; color: #2563eb; }
        .status-completed { background: #f0fdf4; color: #16a34a; }
        .status-failed { background: #fef2f2; color: #dc2626; }
    </style>
</head>
<body>
    <div class="header">
        <h1>OpenClaw Remote Deploy</h1>
        <p>Quickly install and configure OpenClaw on remote servers</p>
    </div>
    
    <div class="quota">
        <h3>Today's Quota</h3>
        <p>Used: <span id="quota-used">0</span> / 5</p>
        <p id="quota-remaining"></p>
    </div>
    
    <div style="background: #fff7ed; padding: 15px; border-left: 4px solid #ea580c; margin: 20px 0;">
        <strong>Security Tips:</strong>
        <ul>
            <li>Ensure target server is accessible from internal network</li>
            <li>SSH passwords are encrypted with AES-256</li>
            <li>Change server password after deployment</li>
            <li>Daily limit: 5 deployments (first come, first served)</li>
        </ul>
    </div>
    
    <form id="deploy-form">
        <div class="form-group">
            <label for="targetIp">Target Server IP *</label>
            <input type="text" id="targetIp" name="targetIp" placeholder="e.g., 192.168.1.100" required>
        </div>
        
        <div class="form-group">
            <label for="sshUser">SSH Username *</label>
            <input type="text" id="sshUser" name="sshUser" value="root" placeholder="e.g., root" required>
        </div>
        
        <div class="form-group">
            <label for="sshPort">SSH Port</label>
            <select id="sshPort" name="sshPort">
                <option value="22" selected>22</option>
                <option value="2222">2222</option>
            </select>
        </div>
        
        <div class="form-group">
            <label for="sshPassword">SSH Password *</label>
            <input type="password" id="sshPassword" name="sshPassword" placeholder="Enter SSH password" required>
        </div>
        
        <button type="submit" id="submit-btn">Start Deployment</button>
    </form>
    
    <div class="history">
        <h3>Deployment History</h3>
        <div id="history-list">
            <p>No deployment history yet</p>
        </div>
    </div>
    
    <script>
        // 获取今日名额
        fetch('/api/deploy/quota')
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('quota-used').textContent = data.used;
                    document.getElementById('quota-remaining').textContent = data.remaining >= 0 
                        ? 'Remaining: ' + data.remaining + ' deployments'
                        : 'Daily quota exceeded';
                    if (data.remaining <= 0) {
                        document.getElementById('submit-btn').disabled = true;
                        document.getElementById('submit-btn').textContent = 'Daily Quota Exceeded';
                    }
                }
            });
        
        // 获取部署历史
        fetch('/api/deploy/history')
            .then(r => r.json())
            .then(data => {
                const historyList = document.getElementById('history-list');
                if (!data.success || !data.history || data.history.length === 0) {
                    historyList.innerHTML = '<p>No deployment history yet</p>';
                    return;
                }
                historyList.innerHTML = data.history.map(task => 
                    '<div class="history-item">' +
                    '<h4>' + task.id + ' - ' + task.targetIp + '</h4>' +
                    '<div>' + task.sshUser + ' | ' + new Date(task.createdAt).toLocaleString() + ' | ' +
                    '<span class="status status-' + task.status + '">' +
                    (task.status === 'pending' ? 'Pending' : 
                     task.status === 'running' ? 'Running' : 
                     task.status === 'completed' ? 'Completed' : 'Failed') +
                    '</span></div>' +
                    '<div style="font-size: 0.9em; color: #666; margin-top: 5px;">' + task.progress + '</div>' +
                    '</div>'
                ).join('');
            });
        
        // 表单提交
        document.getElementById('deploy-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('submit-btn');
            btn.disabled = true;
            btn.textContent = 'Submitting...';
            
            const formData = {
                targetIp: document.getElementById('targetIp').value,
                sshUser: document.getElementById('sshUser').value,
                sshPort: parseInt(document.getElementById('sshPort').value),
                sshPassword: document.getElementById('sshPassword').value
            };
            
            try {
                const response = await fetch('/api/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    alert('SUCCESS: Deployment request submitted!\\nTask ID: ' + data.task.id);
                    // 重新加载历史
                    location.reload();
                } else {
                    alert('ERROR: ' + (data.error?.message || 'Unknown error'));
                    btn.disabled = false;
                    btn.textContent = 'Start Deployment';
                }
            } catch (error) {
                alert('ERROR: ' + error.message);
                btn.disabled = false;
                btn.textContent = 'Start Deployment';
            }
        });
    </script>
</body>
</html>
    `);
});

/**
 * 路由: GET /api/deploy/quota
 * 查询今日名额
 */
router.get('/api/deploy/quota', (req, res) => {
    const used = countTodayRequests();
    const quota = 5;
    const remaining = quota - used;
    
    res.json({
        success: true,
        used,
        quota,
        remaining: Math.max(0, remaining)
    });
});

/**
 * 路由: POST /api/deploy
 * 提交部署申请
 */
router.post('/api/deploy', async (req, res) => {
    try {
        const { targetIp, sshUser, sshPort = 22, sshPassword } = req.body;
        
        // 验证参数
        if (!targetIp || !sshUser || !sshPassword) {
            return res.status(400).json({
                success: false,
                error: {
                    type: 'ValidationError',
                    message: 'Missing required parameters: targetIp, sshUser, sshPassword'
                }
            });
        }
        
        // 检查今日名额
        const used = countTodayRequests();
        const quota = 5;
        if (used >= quota) {
            return res.status(429).json({
                success: false,
                error: {
                    type: 'QuotaExceededError',
                    message: `Daily quota exceeded (${quota} deployments)`
                }
            });
        }
        
        // 增加今日请求数
        const newUsed = incrementTodayRequests();
        if (newUsed === null) {
            return res.status(500).json({
                success: false,
                error: {
                    type: 'DatabaseError',
                    message: 'Failed to write to quota file'
                }
            });
        }
        
        // 队列 ID: userId-targetIp-timestamp
        const userId = `ip-${getClientIP(req).replace(/\./g, '-')}`;
        const queueId = `${userId}-${targetIp}-${Date.now()}`;
        
        // 加密密码
        const encryptedPassword = encryptAES(sshPassword);
        
        // 创建部署任务
        const task = createDeployTask({
            queueId,
            userId,
            targetIp,
            sshUser,
            sshPort,
            password: encryptedPassword
        });
        
        res.status(202).json({
            success: true,
            message: 'Deployment request submitted',
            task
        });
        
        // 后台执行部署（不阻塞响应）
        setTimeout(() => {
            try {
                const deployExecutor = require('./deploy-executor');
                deployExecutor.execute(task);
            } catch (error) {
                console.error('[Deploy] 后台执行失败:', error.message);
            }
        }, 100);
        
    } catch (error) {
        console.error('[Deploy] 创建任务失败:', error);
        res.status(500).json({
            success: false,
            error: {
                type: 'InternalServerError',
                message: error.message
            }
        });
    }
});

/**
 * 路由: GET /api/deploy/status/:id
 * 查询部署状态
 */
router.get('/api/deploy/status/:id', (req, res) => {
    const task = getDeployTask(req.params.id);
    
    if (!task) {
        return res.status(404).json({
            success: false,
            error: {
                type: 'NotFoundError',
                message: 'Task not found'
            }
        });
    }
    
    res.json({
        success: true,
        task
    });
});

/**
 * 路由: GET /api/deploy/history
 * 查询历史记录
 */
router.get('/api/deploy/history', (req, res) => {
    const userId = `ip-${getClientIP(req).replace(/\./g, '-')}`;
    const history = getUserHistory(userId);
    
    res.json({
        success: true,
        history
    });
});

/**
 * 状态更新 API（仅用于内部状态更新）
 */
router.post('/api/deploy/status', (req, res) => {
    const { id, status, progress, error } = req.body;
    
    if (!id || !status) {
        return res.status(400).json({
            success: false,
            error: {
                type: 'ValidationError',
                message: 'Missing id or status'
            }
        });
    }
    
    const updates = { status };
    if (progress) updates.progress = progress;
    if (error) updates.error = error;
    if (status === 'completed' || status === 'failed') {
        updates.completedAt = new Date().toISOString();
    }
    
    if (updateDeployTask(id, updates)) {
        res.json({ success: true });
    } else {
        res.status(404).json({
            success: false,
            error: {
                type: 'NotFoundError',
                message: 'Task not found'
            }
        });
    }
});

module.exports = router;