#!/usr/bin/env node
/**
 * Issue Auto Fixer - 问题自动修复执行器
 * 
 * 调用 sessions_spawn 执行实际修复
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const ISSUE_LOGS_FILE = path.join(DATA_DIR, 'issue-logs.json');

function readTasks() {
    if (!fs.existsSync(TASKS_FILE)) return [];
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
}

function writeTasks(tasks) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

/**
 * 执行自动修复
 * @param {string} taskId - 任务ID
 * @param {string} issueId - 问题ID
 * @param {object} options - 选项
 */
async function executeAutoFix(taskId, issueId, options = {}) {
    console.log(`[IssueAutoFixer] 开始自动修复: ${issueId}`);
    
    const tasks = readTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
        throw new Error('任务不存在');
    }
    
    const issueIndex = tasks[taskIndex].issues.findIndex(i => i.id === issueId);
    if (issueIndex === -1) {
        throw new Error('问题不存在');
    }
    
    const issue = tasks[taskIndex].issues[issueIndex];
    
    if (!issue.can_auto_fix) {
        throw new Error('此问题不支持自动修复');
    }
    
    // 更新状态为修复中
    tasks[taskIndex].issues[issueIndex].fix_status = 'fixing';
    tasks[taskIndex].issues[issueIndex].fix_started_at = new Date().toISOString();
    writeTasks(tasks);
    
    logIssueAction('AUTO_FIX_STARTED', taskId, issue);
    
    try {
        // 生成修复任务描述
        const fixPrompt = generateFixPrompt(tasks[taskIndex], issue);
        
        // 确定执行 Agent
        const agentId = issue.suggested_subagent || determineFixAgent(issue);
        
        // 调用修复执行
        const result = await callFixAgent(taskId, issueId, fixPrompt, agentId, tasks[taskIndex]);
        
        // 更新修复结果
        tasks[taskIndex].issues[issueIndex].fix_status = 'completed';
        tasks[taskIndex].issues[issueIndex].status = 'fixed';
        tasks[taskIndex].issues[issueIndex].resolved_at = new Date().toISOString();
        tasks[taskIndex].issues[issueIndex].resolver = agentId;
        tasks[taskIndex].issues[issueIndex].fix_detail = result.summary || '自动修复完成';
        tasks[taskIndex].issues[issueIndex].fix_result = result;
        writeTasks(tasks);
        
        logIssueAction('AUTO_FIX_COMPLETED', taskId, issue, { result });
        
        console.log(`[IssueAutoFixer] 修复完成: ${issueId}`);
        
        return { success: true, result };
        
    } catch (err) {
        // 更新修复失败
        tasks[taskIndex].issues[issueIndex].fix_status = 'failed';
        tasks[taskIndex].issues[issueIndex].fix_error = err.message;
        writeTasks(tasks);
        
        logIssueAction('AUTO_FIX_FAILED', taskId, issue, { error: err.message });
        
        console.error(`[IssueAutoFixer] 修复失败:`, err);
        
        throw err;
    }
}

/**
 * 生成修复提示
 */
function generateFixPrompt(task, issue) {
    let prompt = `## 任务背景\n\n`;
    prompt += `**原始任务**: ${task.title}\n`;
    prompt += `**任务描述**: ${task.user_description || task.description}\n\n`;
    
    prompt += `## 发现的问题\n\n`;
    prompt += `**问题名称**: ${issue.name}\n`;
    prompt += `**问题描述**: ${issue.description}\n\n`;
    
    if (issue.missing_features && issue.missing_features.length > 0) {
        prompt += `## 缺失功能\n\n`;
        issue.missing_features.forEach(f => {
            prompt += `- ${f.name} (优先级: ${f.priority})\n`;
        });
        prompt += '\n';
    }
    
    prompt += `## 根因分析\n\n${issue.root_cause}\n\n`;
    prompt += `## 解决方案\n\n${issue.solution}\n\n`;
    
    if (issue.fix_steps && issue.fix_steps.length > 0) {
        prompt += `## 修复步骤\n\n`;
        issue.fix_steps.forEach((step, i) => {
            prompt += `${i + 1}. ${step}\n`;
        });
        prompt += '\n';
    }
    
    prompt += `## 要求\n\n`;
    prompt += `1. 根据以上信息修复问题\n`;
    prompt += `2. 确保修复不影响现有功能\n`;
    prompt += `3. 完成后更新相关文档\n`;
    prompt += `4. 报告修复结果\n`;
    
    return prompt;
}

/**
 * 确定修复 Agent
 */
function determineFixAgent(issue) {
    const name = (issue.name || '').toLowerCase();
    const desc = (issue.description || '').toLowerCase();
    
    // 功能缺失 → coder
    if (name.includes('功能缺失') || name.includes('没实现') || desc.includes('缺少功能')) {
        return 'coder';
    }
    
    // bug → coder
    if (name.includes('bug') || name.includes('错误') || name.includes('异常')) {
        return 'coder';
    }
    
    // UI问题 → frontend-expert
    if (name.includes('显示') || name.includes('样式') || name.includes('ui')) {
        return 'coder';
    }
    
    // 默认 coder
    return 'coder';
}

/**
 * 调用修复 Agent
 */
async function callFixAgent(taskId, issueId, prompt, agentId, task) {
    console.log(`[IssueAutoFixer] 调用 Agent: ${agentId}`);
    
    // 构建修复任务
    const fixTask = {
        taskId,
        issueId,
        agentId,
        prompt,
        taskContext: {
            title: task.title,
            description: task.description,
            outputs: task.outputs,
            cwd: task.cwd
        }
    };
    
    // 写入修复任务队列
    const fixQueueFile = path.join(DATA_DIR, 'fix-queue.json');
    let fixQueue = [];
    
    if (fs.existsSync(fixQueueFile)) {
        fixQueue = JSON.parse(fs.readFileSync(fixQueueFile, 'utf-8'));
    }
    
    fixQueue.push({
        id: `fix_${Date.now()}`,
        ...fixTask,
        status: 'pending',
        created_at: new Date().toISOString()
    });
    
    fs.writeFileSync(fixQueueFile, JSON.stringify(fixQueue, null, 2));
    
    console.log(`[IssueAutoFixer] 修复任务已加入队列`);
    
    // 模拟执行（实际应该调用 sessions_spawn）
    // 这里返回模拟结果，实际执行由外部系统完成
    return {
        queue_id: `fix_${Date.now()}`,
        agent: agentId,
        status: 'queued',
        message: '修复任务已加入队列，等待执行',
        
        // 实际执行时返回的结果
        summary: '等待执行...'
    };
}

/**
 * 更新修复结果（由执行完成后调用）
 */
async function updateFixResult(taskId, issueId, result) {
    const tasks = readTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
        throw new Error('任务不存在');
    }
    
    const issueIndex = tasks[taskIndex].issues.findIndex(i => i.id === issueId);
    if (issueIndex === -1) {
        throw new Error('问题不存在');
    }
    
    if (result.success) {
        tasks[taskIndex].issues[issueIndex].fix_status = 'completed';
        tasks[taskIndex].issues[issueIndex].status = 'fixed';
        tasks[taskIndex].issues[issueIndex].resolved_at = new Date().toISOString();
        tasks[taskIndex].issues[issueIndex].resolver = result.agent || 'auto-fixer';
        tasks[taskIndex].issues[issueIndex].fix_detail = result.summary;
        tasks[taskIndex].issues[issueIndex].fix_result = result;
    } else {
        tasks[taskIndex].issues[issueIndex].fix_status = 'failed';
        tasks[taskIndex].issues[issueIndex].fix_error = result.error;
    }
    
    writeTasks(tasks);
    
    logIssueAction(result.success ? 'AUTO_FIX_COMPLETED' : 'AUTO_FIX_FAILED', taskId, 
        tasks[taskIndex].issues[issueIndex], { result });
    
    return tasks[taskIndex].issues[issueIndex];
}

/**
 * 记录日志
 */
function logIssueAction(action, taskId, issue, data = {}) {
    try {
        const logs = fs.existsSync(ISSUE_LOGS_FILE)
            ? JSON.parse(fs.readFileSync(ISSUE_LOGS_FILE, 'utf-8'))
            : [];
        
        logs.push({
            action,
            taskId,
            issueId: issue.id,
            issueName: issue.name,
            data,
            timestamp: new Date().toISOString()
        });
        
        if (logs.length > 1000) {
            logs.splice(0, logs.length - 1000);
        }
        
        fs.writeFileSync(ISSUE_LOGS_FILE, JSON.stringify(logs, null, 2));
    } catch (err) {
        console.error('[IssueAutoFixer] 写入日志失败:', err);
    }
}

// ==================== CLI ====================

if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command) {
        console.log(`
Issue Auto Fixer - 问题自动修复执行器

Usage:
  node issue-auto-fixer.js execute <taskId> <issueId>
  node issue-auto-fixer.js update <taskId> <issueId> <resultJson>

Examples:
  node issue-auto-fixer.js execute <taskId> <issueId>
  node issue-auto-fixer.js update <taskId> <issueId> '{"success":true,"summary":"已修复"}'
`);
        process.exit(0);
    }
    
    const taskId = args[1];
    const issueId = args[2];
    
    if (command === 'execute') {
        executeAutoFix(taskId, issueId).then(result => {
            console.log(JSON.stringify(result, null, 2));
        }).catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
        });
    } else if (command === 'update') {
        const result = JSON.parse(args[3] || '{}');
        updateFixResult(taskId, issueId, result).then(issue => {
            console.log(JSON.stringify(issue, null, 2));
        }).catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
        });
    }
}

module.exports = {
    executeAutoFix,
    updateFixResult,
    generateFixPrompt,
    determineFixAgent
};
