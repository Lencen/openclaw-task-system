#!/usr/bin/env node
/**
 * Issue Scanner - 问题自动扫描器
 * 
 * 定期扫描 issues.json 中的 open 问题，判断是否可以自动修复，加入修复队列
 * 
 * 运行方式：
 * - 定时任务：每 5 分钟扫描一次
 * - 手动触发：node issue-scanner.js scan
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const ISSUES_FILE = path.join(DATA_DIR, 'issues.json');
const FIX_QUEUE_FILE = path.join(DATA_DIR, 'fix-queue.json');
const DB_FILE = path.join(DATA_DIR, 'tasks.db');

/**
 * 读取问题列表 - 优先从 SQLite 读取
 */
function readIssues() {
    // 尝试从 SQLite 读取（使用已有的 DAL）
    if (fs.existsSync(DB_FILE)) {
        try {
            // 使用已有的 DAL
            const { getIssuesDAL } = require('../src/db/issues-dal');
            const dal = getIssuesDAL();
            const issues = dal.list();  // 获取所有问题
            
            // 添加空值检查
            if (!issues || !Array.isArray(issues)) {
                console.log('[IssueScanner] SQLite 返回空数据，回退到 JSON');
                return { issues: [], stats: { source: 'sqlite-empty' } };
            }
            
            return { issues, stats: { source: 'sqlite' } };
        } catch (e) {
            console.error('[IssueScanner] SQLite 读取失败，回退到 JSON:', e.message);
        }
    }
    
    // 回退到 JSON 文件
    if (!fs.existsSync(ISSUES_FILE)) {
        return { issues: [], stats: {} };
    }
    
    const content = fs.readFileSync(ISSUES_FILE, 'utf-8').trim();
    if (!content) {
        return { issues: [], stats: { source: 'json-empty' } };
    }
    
    try {
        const data = JSON.parse(content);
        if (!data.issues || !Array.isArray(data.issues)) {
            return { issues: [], stats: { source: 'json-invalid' } };
        }
        return data;
    } catch (e) {
        console.error('[IssueScanner] JSON 解析失败:', e.message);
        return { issues: [], stats: { source: 'json-parse-error' } };
    }
}

/**
 * 读取修复队列 - 优先从 SQLite 读取
 */
function readFixQueue() {
    // 尝试从 SQLite 读取
    if (fs.existsSync(DB_FILE)) {
        try {
            const { getFixQueueDAL } = require('../src/db/fix-queue-dal');
            const dal = getFixQueueDAL();
            const queue = dal.list();
            return queue.map(item => ({
                id: item.id,
                issueId: item.issue_id,
                task_id: item.task_id,
                issueTitle: item.title,
                agentId: item.agent_id,
                status: item.status,
                priority: item.priority,
                severity: item.priority, // Map priority to severity for compatibility
                type: item.type || 'bug',
                created_at: item.created_at,
                started_at: item.started_at,
                completed_at: item.completed_at,
                failed_at: item.failed_at,
                result: item.result
            }));
        } catch (e) {
            console.error('[IssueScanner] SQLite 修复队列读取失败，回退到 JSON:', e.message);
        }
    }
    
    // 回退到 JSON 文件
    if (!fs.existsSync(FIX_QUEUE_FILE)) {
        return [];
    }
    return JSON.parse(fs.readFileSync(FIX_QUEUE_FILE, 'utf-8'));
}

/**
 * 保存修复队列 - 优先使用 SQLite
 */
function saveFixQueue(queue) {
    try {
        const { getFixQueueDAL } = require('../src/db/fix-queue-dal');
        const dal = getFixQueueDAL();
        
        // 清空现有数据（简化处理，实际应该用 update）
        const existing = dal.list();
        existing.forEach(item => dal.delete(item.id));
        
        // 添加新数据
        queue.forEach(item => {
            dal.create({
                id: item.id,
                issue_id: item.issueId,
                task_id: item.taskId || item.task_id,
                title: item.issueTitle || item.title,
                priority: item.severity || item.priority || 'P2',
                status: item.status,
                agent_id: item.agentId || item.agent_id,
                type: item.type,
                created_at: item.created_at
            });
        });
        
        console.log(`[IssueScanner] ✅ 保存 ${queue.length} 个修复任务到 SQLite`);
    } catch (e) {
        console.error('[IssueScanner] SQLite 保存失败，回退到 JSON:', e.message);
        fs.writeFileSync(FIX_QUEUE_FILE, JSON.stringify(queue, null, 2));
    }
}

/**
 * 判断问题是否可以自动修复
 */
function canAutoFix(issue) {
    // 已经在修复中的不能重复加入
    if (issue.fix_status === 'fixing' || issue.fix_status === 'queued') {
        return false;
    }
    
    // 已解决的不需要修复
    if (issue.status === 'resolved' || issue.status === 'fixed' || issue.status === 'closed') {
        return false;
    }
    
    // 🚫 跳过功能缺失类问题 - 这类问题需要开发新功能，不是修复 Bug
    const solution = issue.solution || '';
    const skipKeywords = ['功能缺失类', '暂不处理', '需要开发', '待开发', '功能不存在', '缺少功能'];
    if (skipKeywords.some(kw => solution.includes(kw))) {
        console.log(`[IssueScanner] 问题 ${issue.id} 是功能缺失类，跳过修复队列`);
        return false;
    }
    
    // 🚫 跳过外部依赖类问题 - 这类问题无法自动修复
    const externalKeywords = ['外部依赖类', '飞书服务问题', '第三方服务', 'API问题'];
    if (externalKeywords.some(kw => solution.includes(kw))) {
        console.log(`[IssueScanner] 问题 ${issue.id} 是外部依赖类，跳过修复队列`);
        return false;
    }
    
    // 根据问题类型判断 - 兼容 category 和 type 字段
    const type = issue.category || issue.type || '';
    const severity = issue.severity || 'medium';
    
    // 这些类型的问题可以自动修复
    const autoFixableTypes = ['bug', 'ui', 'data', 'config', 'performance'];
    
    // 这些类型的问题需要人工处理
    const manualTypes = ['process', 'integration', 'security'];
    
    if (manualTypes.includes(type)) {
        // 流程类、集成类、安全类问题需要人工处理
        // 但如果有明确的解决方案，也可以尝试自动修复
        if (issue.solution && issue.solution.length > 10) {
            return true;
        }
        return false;
    }
    
    // Critical 问题优先处理
    if (severity === 'critical' || severity === 'high') {
        return true;
    }
    
    return autoFixableTypes.includes(type);
}

/**
 * 确定修复 Agent
 */
function determineFixAgent(issue) {
    // 如果已经有分配的 agent，使用它（兼容 SQLite 和 JSON 格式）
    if (issue.assignedAgent || issue.assignee || issue.agent_id) {
        return issue.assignedAgent || issue.assignee || issue.agent_id;
    }
    
    // 根据问题类型确定 - 兼容 category 和 type 字段
    const type = issue.category || issue.type || '';
    
    if (type === 'ui') {
        return 'coder';
    }
    
    if (type === 'bug' || type === 'data') {
        return 'coder';
    }
    
    if (type === 'config') {
        return 'main';
    }
    
    if (type === 'performance') {
        return 'coder';
    }
    
    // 默认使用 coder
    return 'coder';
}

/**
 * 安全的字符串处理函数
 */
function safeString(val, fallback = '') {
    return val == null || typeof val !== 'string' ? fallback : val;
}

/**
 * 生成修复任务描述
 */
function generateFixPrompt(issue) {
    // 添加空值检查，防止 null 引发错误
    if (!issue || !issue.id) {
        return null;
    }
    
    let prompt = `## 问题修复任务\n\n`;
    prompt += `**问题 ID**: ${issue.id}\n`;
    prompt += `**问题标题**: ${safeString(issue.title, '未知标题')}\n`;
    prompt += `**严重程度**: ${safeString(issue.severity || issue.priority, ' medium')}\n`;
    prompt += `**问题类型**: ${safeString(issue.type || issue.category, '未知')}\n\n`;
    
    prompt += `## 问题描述\n\n${safeString(issue.description, '无描述')}\n\n`;
    
    if (issue.background || issue.root_cause) {
        prompt += `## 背景\n\n${safeString(issue.background || issue.root_cause)}\n\n`;
    }
    
    if (issue.reason || issue.solution) {
        prompt += `## 原因分析\n\n${safeString(issue.reason || issue.solution)}\n\n`;
    }
    
    if (issue.solution || issue.reflection) {
        prompt += `## 解决方案\n\n${safeString(issue.solution || issue.reflection)}\n\n`;
    }
    
    // 安全处理 files 数组
    if (issue.files && Array.isArray(issue.files) && issue.files.length > 0) {
        prompt += `## 相关文件\n\n`;
        issue.files.forEach(f => {
            prompt += `- ${safeString(f)}\n`;
        });
        prompt += '\n';
    }
    
    // 安全处理 relatedDocs 数组
    if (issue.relatedDocs && Array.isArray(issue.relatedDocs) && issue.relatedDocs.length > 0) {
        prompt += `## 相关文档\n\n`;
        issue.relatedDocs.forEach(d => {
            prompt += `- ${safeString(d)}\n`;
        });
        prompt += '\n';
    }
    
    prompt += `## 修复要求\n\n`;
    prompt += `1. 根据以上信息修复问题\n`;
    prompt += `2. 确保修复不影响现有功能\n`;
    prompt += `3. 如果涉及代码修改，确保代码质量\n`;
    prompt += `4. 完成后报告修复结果\n`;
    
    return prompt;
}

/**
 * 检查问题是否已在队列中（兼容 SQLite 和 JSON 格式）
 */
function isInQueue(issueId, queue) {
    return queue.some(item => 
        (item.issueId === issueId || item.issue_id === issueId) && 
        (item.status === 'pending' || item.status === 'running')
    );
}

/**
 * 扫描问题并加入修复队列
 */
function scanAndQueue() {
    console.log('[IssueScanner] 开始扫描问题...');
    
    const { issues } = readIssues();
    const fixQueue = readFixQueue();
    
    // 添加空值检查
    if (!issues || !Array.isArray(issues)) {
        console.log('[IssueScanner] 没有问题数据，跳过');
        return { openIssues: 0, autoFixable: 0, added: 0 };
    }
    
    // 筛选 open 状态的问题（兼容 SQLite 和 JSON 格式）
    const openIssues = issues.filter(i => i.status === 'open' || i.state === 'open');
    console.log(`[IssueScanner] 发现 ${openIssues.length} 个 open 问题`);
    
    // 筛选可自动修复的问题
    const autoFixable = openIssues.filter(i => canAutoFix(i));
    console.log(`[IssueScanner] 其中 ${autoFixable.length} 个可自动修复`);
    
    // 加入修复队列
    let addedCount = 0;
    
    autoFixable.forEach(issue => {
        // 空值检查：跳过 id 为 null 的问题
        if (!issue.id) {
            console.log(`[IssueScanner] 跳过无ID问题: ${issue.title}`);
            return;
        }
        
        // 检查是否已在队列中（兼容 SQLite 和 JSON 格式）
        if (isInQueue(issue.id, fixQueue)) {
            console.log(`[IssueScanner] 问题 ${issue.id} 已在队列中，跳过`);
            return;
        }
        
        // 安全检查：确保关键字段存在
        if (!issue.id || !issue.title) {
            console.log(`[IssueScanner] 跳过无必要字段的问题: ID=${issue.id}, Title=${issue.title}`);
            return;
        }
        
        // 生成 prompt 检查
        const prompt = generateFixPrompt(issue);
        if (!prompt) {
            console.log(`[IssueScanner] 跳过生成 prompt 失败的问题: ${issue.id}`);
            return;
        }
        
        // 加入队列
        const fixTask = {
            id: `fix_${Date.now()}_${issue.id.slice(-6)}`,
            issueId: issue.id,
            issueTitle: safeString(issue.title),
            taskId: issue.relatedTaskId || issue.task_id || null,
            agentId: determineFixAgent(issue),
            prompt: prompt,
            severity: safeString(issue.severity || issue.priority, 'P2'),
            type: safeString(issue.type || issue.category, 'unknown'),
            status: 'pending',
            created_at: new Date().toISOString()
        };
        
        fixQueue.push(fixTask);
        addedCount++;
        
        console.log(`[IssueScanner] 加入队列: ${safeString(issue.title).slice(0, 30)}... (Agent: ${fixTask.agentId})`);
    });
    
    // 保存队列
    if (addedCount > 0) {
        saveFixQueue(fixQueue);
        console.log(`[IssueScanner] ✅ 已加入 ${addedCount} 个问题到修复队列`);
    } else {
        console.log(`[IssueScanner] 没有新问题需要加入队列`);
    }
    
    return {
        openIssues: openIssues.length,
        autoFixable: autoFixable.length,
        added: addedCount
    };
}

/**
 * 更新问题状态为已加入队列
 */
function updateIssueStatus(issueId, status) {
    const data = readIssues();
    const idx = data.issues.findIndex(i => i.id === issueId);
    
    if (idx !== -1) {
        data.issues[idx].fix_status = status;
        data.issues[idx].queued_at = new Date().toISOString();
        fs.writeFileSync(ISSUES_FILE, JSON.stringify(data, null, 2));
    }
}

/**
 * 监听模式 - 定期扫描
 */
function watch(intervalMs = 5 * 60 * 1000) {
    console.log(`[IssueScanner] 启动监听模式，间隔 ${intervalMs / 1000} 秒`);
    
    // 立即执行一次
    scanAndQueue();
    
    // 定期执行
    setInterval(() => {
        scanAndQueue();
    }, intervalMs);
}

// ==================== CLI ====================

if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command) {
        console.log(`
Issue Scanner - 问题自动扫描器

Usage:
  node issue-scanner.js scan      扫描问题并加入队列
  node issue-scanner.js watch     持续监听（每 5 分钟）
  node issue-scanner.js status    查看状态

Examples:
  node issue-scanner.js scan
  node issue-scanner.js watch
`);
        process.exit(0);
    }
    
    if (command === 'scan') {
        const result = scanAndQueue();
        console.log(JSON.stringify(result, null, 2));
    } else if (command === 'watch') {
        watch();
    } else if (command === 'status') {
        const { issues, stats } = readIssues();
        const fixQueue = readFixQueue();
        
        console.log(JSON.stringify({
            issues: {
                total: issues.length,
                open: issues.filter(i => i.status === 'open').length,
                resolved: issues.filter(i => i.status === 'resolved').length
            },
            fixQueue: {
                total: fixQueue.length,
                pending: fixQueue.filter(i => i.status === 'pending').length,
                running: fixQueue.filter(i => i.status === 'running').length,
                completed: fixQueue.filter(i => i.status === 'completed').length
            }
        }, null, 2));
    }
}

module.exports = {
    scanAndQueue,
    canAutoFix,
    determineFixAgent,
    generateFixPrompt,
    watch
};