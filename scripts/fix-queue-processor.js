#!/usr/bin/env node
/**
 * Fix Queue Processor - 修复队列处理器
 * 
 * 从修复队列读取任务，调用 Gateway API 执行实际修复
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getFixQueueDAL } = require(path.join(__dirname, '../db/fix-queue-dal'));
const { getIssuesDAL } = require(path.join(__dirname, '../db/issues-dal'));

const DATA_DIR = path.join(__dirname, '../data');
const FIX_QUEUE_FILE = path.join(DATA_DIR, 'fix-queue.json');
const DB_FILE = path.join(DATA_DIR, 'tasks.db');

// SQLite 数据库连接
let db = null;

function getDb() {
    if (!db) {
        db = require('better-sqlite3')(DB_FILE);
    }
    return db;
}

/**
 * 获取修复队列（优先使用 SQLite）
 */
function getFixQueue() {
    try {
        const dal = getFixQueueDAL(DB_FILE);
        const queue = dal.list();
        return queue.map(item => ({
            id: item.id,
            issueId: item.issue_id,
            taskId: item.task_id,
            issueTitle: item.title,
            agentId: item.agent_id,
            status: item.status,
            severity: item.priority,
            type: item.type || 'bug',
            created_at: item.created_at,
            started_at: item.started_at,
            completed_at: item.completed_at,
            failed_at: item.failed_at,
            result: item.result
        }));
    } catch (e) {
        console.error('[FixQueueProcessor] SQLite 读取失败，回退到 JSON:', e.message);
    }
    
    // 回退到 JSON 文件
    if (!fs.existsSync(FIX_QUEUE_FILE)) return [];
    return JSON.parse(fs.readFileSync(FIX_QUEUE_FILE, 'utf-8'));
}

/**
 * 保存修复队列（同时更新 SQLite 和 JSON）
 */
function saveFixQueue(queue) {
    try {
        const dal = getFixQueueDAL(DB_FILE);
        
        // 清空现有数据
        const existing = dal.list();
        existing.forEach(item => dal.delete(item.id));
        
        // 添加新数据
        queue.forEach(item => {
            dal.create({
                id: item.id,
                issue_id: item.issueId,
                task_id: item.taskId,
                title: item.issueTitle,
                priority: item.severity || 'P2',
                status: item.status,
                agent_id: item.agentId,
                type: item.type,
                created_at: item.created_at
            });
        });
        
        console.log(`[FixQueueProcessor] 保存 ${queue.length} 个修复任务到 SQLite`);
    } catch (e) {
        console.error('[FixQueueProcessor] SQLite 保存失败:', e.message);
    }
    
    // 同时保存到 JSON 文件，确保数据同步
    try {
        fs.writeFileSync(FIX_QUEUE_FILE, JSON.stringify(queue, null, 2));
        console.log(`[FixQueueProcessor] 同步 ${queue.length} 个修复任务到 JSON`);
    } catch (e) {
        console.error('[FixQueueProcessor] JSON 保存失败:', e.message);
    }
}

/**
 * 获取任务数据 (SQLite)
 */
function getTask(taskId) {
    try {
        const database = getDb();
        const task = database.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        return task;
    } catch (err) {
        console.error('[FixQueueProcessor] 获取任务失败:', err.message);
        return null;
    }
}

/**
 * 处理单个修复任务
 */
async function processFixTask(fixTask, queue) {
    console.log(`[FixQueueProcessor] 处理修复任务: ${fixTask.id}`);
    
    try {
        // 更新状态为执行中
        fixTask.status = 'running';
        fixTask.started_at = new Date().toISOString();
        saveFixQueue(queue);
        
        // 调用 Gateway API 执行修复
        const result = await callGatewayAPI(fixTask);
        
        // 更新状态为完成
        fixTask.status = 'completed';
        fixTask.completed_at = new Date().toISOString();
        fixTask.result = result;
        saveFixQueue(queue);
        
        // 更新问题状态
        await updateIssueStatus(fixTask.taskId, fixTask.issueId, {
            success: true,
            summary: result.summary || '修复完成',
            agent: fixTask.agentId
        });
        
        console.log(`[FixQueueProcessor] 修复任务完成: ${fixTask.id}`);
        
        return { success: true, result };
        
    } catch (err) {
        // 更新状态为失败
        fixTask.status = 'failed';
        fixTask.failed_at = new Date().toISOString();
        fixTask.error = err.message;
        saveFixQueue(queue);
        
        // 更新问题状态
        await updateIssueStatus(fixTask.taskId, fixTask.issueId, {
            success: false,
            error: err.message
        });
        
        console.error(`[FixQueueProcessor] 修复任务失败: ${fixTask.id}`, err);
        
        return { success: false, error: err.message };
    }
}

/**
 * 调用 Gateway API 执行修复
 * 1. 先创建临时任务
 * 2. 然后分配任务给 Agent 启动 Subagent
 */
async function callGatewayAPI(fixTask) {
    const http = require('http');
    const { generateShortId } = require('../src/db/uuid-generator');
    
    const taskId = fixTask.taskId || generateShortId('task');
    
    // Step 1: 创建临时任务
    console.log(`[FixQueueProcessor] Step 1: 创建任务 ${taskId}`);
    
    const taskData = {
        id: taskId,
        title: `修复问题: ${fixTask.issueTitle}`,
        description: fixTask.prompt,
        user_description: fixTask.prompt,
        status: 'pending',
        priority: fixTask.severity || 'P2',
        quadrant: 1,
        created_at: new Date().toISOString(),
        analysis: { thought: '', conclusion: '' },
        breakdown: [],
        execution_log: [{
            timestamp: new Date().toISOString(),
            action: 'CREATE',
            detail: `修复任务自动创建：${fixTask.issueId}`,
            source: 'fix-queue-processor'
        }],
        issues: [fixTask.issueId],
        related_docs: [],
        test_acceptance: { plan: '', cases: [], result: '' }
    };
    
    try {
        const createTaskResult = await new Promise((resolve, reject) => {
            const createPostData = JSON.stringify(taskData);
            const createOptions = {
                hostname: 'localhost',
                port: 8081,
                path: '/api/tasks',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(createPostData)
                }
            };
            
            const createReq = http.request(createOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        resolve(result);
                    } catch (err) {
                        reject(new Error(`创建任务解析失败: ${err.message}, response: ${data}`));
                    }
                });
            });
            
            createReq.on('error', reject);
            createReq.write(createPostData);
            createReq.end();
        });
        
        if (!createTaskResult.success) {
            throw new Error(`创建任务失败: ${createTaskResult.error}`);
        }
        
        console.log(`[FixQueueProcessor] ✅ 任务已创建: ${taskId}`);
        
        // Step 2: 分配任务给 Agent
        console.log(`[FixQueueProcessor] Step 2: 分配任务给 ${fixTask.agentId}`);
        
        // Step 2: 使用正确的 API 端点分配任务给 Agent
        console.log(`[FixQueueProcessor] Step 2: 分配任务给 ${fixTask.agentId}`);
        
        // 使用 Gateway API 的正确端点
        const assignResult = await new Promise((resolve, reject) => {
            const assignPostData = JSON.stringify({
                taskId,
                agentId: fixTask.agentId || 'coder'
            });
            
            const assignOptions = {
                hostname: 'localhost',
                port: 8081,
                path: '/api/tasks',  // 使用正确的 API 端点
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(assignPostData)
                }
            };
            
            const assignReq = http.request(assignOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        resolve(result);
                    } catch (err) {
                        reject(new Error(`分配任务解析失败: ${err.message}, response: ${data}`));
                    }
                });
            });
            
            assignReq.on('error', reject);
            assignReq.write(assignPostData);
            assignReq.end();
        });
        
        if (!assignResult.success) {
            throw new Error(`分配任务失败: ${assignResult.error}`);
        }
        
        console.log(`[FixQueueProcessor] ✅ 任务已分配并启动: ${assignResult.subagentSessionKey || taskId}`);
        
        return {
            summary: `修复任务已启动: ${fixTask.issueTitle}`,
            taskId,
            sessionId: assignResult.subagentSessionKey,
            exitCode: 0,
            spawned: true,
            response: assignResult
        };
        
    } catch (err) {
        throw new Error(`启动修复任务失败: ${err.message}`);
    }
}

/**
 * 备用模式：任务已通过 Gateway API 启动，无需额外处理
 */
async function useFallbackMode(fixTask) {
    return {
        summary: '修复任务已通过 Gateway API 启动',
        sessionId: null,
        exitCode: 0,
        spawned: true
    };
}

/**
 * 更新问题状态（使用 SQLite DAL）
 */
async function updateIssueStatus(taskId, issueId, result) {
    const { getIssuesDAL } = require(path.join(__dirname, '../db/issues-dal'));
    const dal = getIssuesDAL(DB_FILE);
    
    const issue = dal.get(issueId);
    if (!issue) {
        console.error(`[FixQueueProcessor] 问题 ${issueId} 不存在`);
        return;
    }
    
    const updateData = {};
    
    if (result.success) {
        updateData.status = 'resolved';
        updateData.resolved_at = new Date().toISOString();
        updateData.solution = result.summary;
        console.log(`[FixQueueProcessor] 问题 ${issueId} 已修复`);
    } else {
        updateData.status = 'open';
        updateData.solution = `修复失败: ${result.error}`;
        console.log(`[FixQueueProcessor] 问题 ${issueId} 修复失败: ${result.error}`);
    }
    
    dal.update(issueId, updateData);
}

/**
 * 清理卡住的任务（running 状态超过 30 分钟）
 */
function cleanupStuckTasks(queue) {
    const THIRTY_MINUTES = 30 * 60 * 1000;
    const now = Date.now();
    let cleanedCount = 0;
    
    queue.forEach(task => {
        if (task.status === 'running' && task.started_at) {
            const startTime = new Date(task.started_at).getTime();
            if (now - startTime > THIRTY_MINUTES) {
                console.log(`[FixQueueProcessor] 清理卡住的任务: ${task.id} (卡住 ${Math.round((now - startTime) / 60000)} 分钟)`);
                task.status = 'failed';
                task.error = '任务卡住超时';
                task.failed_at = new Date().toISOString();
                cleanedCount++;
            }
        }
    });
    
    return cleanedCount;
}

/**
 * 处理队列
 */
async function processQueue() {
    console.log('[FixQueueProcessor] 开始处理队列...');
    
    const queue = getFixQueue();
    const pendingTasks = queue.filter(t => t.status === 'pending');
    
    console.log(`[FixQueueProcessor] 发现 ${pendingTasks.length} 个待处理任务`);
    
    if (pendingTasks.length === 0) {
        return { success: true, message: '没有待处理任务' };
    }
    
    // 清理卡住的任务
    const cleanedCount = cleanupStuckTasks(queue);
    if (cleanedCount > 0) {
        saveFixQueue(queue);
        console.log(`[FixQueueProcessor] 清理了 ${cleanedCount} 个卡住的任务`);
    }
    
    // 处理每个待处理任务
    for (const task of pendingTasks) {
        try {
            await processFixTask(task, queue);
        } catch (err) {
            console.error(`[FixQueueProcessor] 处理任务失败: ${task.id}`, err);
        }
    }
    
    return { success: true };
}

/**
 * 扫描问题并加入队列
 */
async function scanIssues() {
    const { scanAndQueue } = require('./issue-scanner');
    const result = scanAndQueue();
    console.log('[FixQueueProcessor] 扫描完成:', result);
    return result;
}

/**
 * 监听模式
 */
async function watch() {
    console.log('[FixQueueProcessor] 启动监听模式...');
    
    // 立即处理一次
    await processQueue();
    
    // 每 5 秒检查一次队列
    setInterval(async () => {
        await processQueue();
    }, 5000);
    
    // 每 5 分钟扫描一次问题
    setInterval(async () => {
        await scanIssues();
    }, 5 * 60 * 1000);
}

// ==================== CLI ====================

if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command) {
        console.log(`
Fix Queue Processor - 修复队列处理器

Usage:
  node fix-queue-processor.js process      处理所有待处理任务
  node fix-queue-processor.js watch        持续监听队列
  node fix-queue-processor.js status       查看队列状态
  node fix-queue-processor.js cleanup-sessions  清理卡住的 Agent Sessions (超过 4 小时)

Examples:
  node fix-queue-processor.js watch
`);
        process.exit(0);
    }
    
    if (command === 'process') {
        processQueue().then(() => {
            console.log('处理完成');
            process.exit(0);
        }).catch(err => {
            console.error('处理失败:', err);
            process.exit(1);
        });
    } else if (command === 'watch') {
        watch();
    } else if (command === 'status') {
        const queue = getFixQueue();
        console.log(JSON.stringify({
            total: queue.length,
            pending: queue.filter(t => t.status === 'pending').length,
            running: queue.filter(t => t.status === 'running').length,
            completed: queue.filter(t => t.status === 'completed').length,
            failed: queue.filter(t => t.status === 'failed').length
        }, null, 2));
    } else if (command === 'cleanup-sessions') {
        // 清理卡住的 Agent Sessions（超过 4 小时）
        cleanupStuckSessionsByTimeout(4 * 60 * 60 * 1000);
    }
}

module.exports = {
    processQueue,
    processFixTask,
    watch
};

/**
 * 清理卡住的 Agent Sessions（超过指定时间）
 */
function cleanupStuckSessionsByTimeout(timeoutMs) {
    const fs = require('fs');
    const path = require('path');
    
    const now = Date.now();
    let cleanedCount = 0;
    
    const AGENTS_DIR = process.env.AGENTS_DIR || require('path').join(process.env.HOME || '/home/user', '.openclaw', 'agents');
    
    if (!fs.existsSync(AGENTS_DIR)) {
        console.log('[FixQueueProcessor] Agents 目录不存在');
        return cleanedCount;
    }
    
    const agentNames = fs.readdirSync(AGENTS_DIR);
    
    agentNames.forEach(agentName => {
        const agentDir = path.join(AGENTS_DIR, agentName);
        const sessionsDir = path.join(agentDir, 'sessions');
        
        if (!fs.existsSync(sessionsDir)) {
            return;
        }
        
        const sessionFiles = fs.readdirSync(sessionsDir);
        
        sessionFiles.forEach(sessionFile => {
            const sessionPath = path.join(sessionsDir, sessionFile);
            const stats = fs.statSync(sessionPath);
            const ageMinutes = Math.round((now - stats.mtime.getTime()) / 60000);
            
            if (ageMinutes > (timeoutMs / 60000)) {
                console.log(`[FixQueueProcessor] 清理卡住的 Session: ${agentName}/${sessionFile} (卡住 ${ageMinutes} 分钟)`);
                // fs.unlinkSync(sessionPath);
                cleanedCount++;
            }
        });
    });
    
    console.log(`[FixQueueProcessor] 发现 ${cleanedCount} 个可能卡住的 sessions，建议手动清理（暂时只记录）`);
    return cleanedCount;
}