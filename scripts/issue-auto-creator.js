#!/usr/bin/env node
/**
 * Issue Auto Creator - 问题自动创建器
 * 
 * 被监控器、测试系统、验收系统调用，自动创建问题
 * 支持两种存储方式：
 * 1. 任务嵌套 issues 字段（旧方式，用于兼容）
 * 2. 独立 issues 表（新方式，统一使用 SQLite DAL）
 */

const fs = require('fs');
const path = require('path');
const issueAnalyzer = require('./issue-auto-analyzer');
const deepAnalyzer = require('./issue-deep-analyzer');
const { getIssuesDAL } = require('../src/db/issues-dal');

const DATA_DIR = path.join(__dirname, '../data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const ISSUE_LOGS_FILE = path.join(DATA_DIR, 'issue-logs.json');
const USE_NEW_STORAGE = true; // 新存储方式：使用 SQLite issues 表

const issuesDAL = getIssuesDAL(path.join(__dirname, '../data/tasks.db'));

function readTasks() {
    if (!fs.existsSync(TASKS_FILE)) return [];
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
}

function writeTasks(tasks) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

/**
 * 创建问题到独立 issues 表（新方式）
 */
async function createIssueToTable(taskId, issueData) {
    const issueId = `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const issue = {
        id: issueId,
        title: issueData.name,
        description: issueData.description || '',
        status: 'open',
        severity: issueData.priority === 'high' ? 'high' : 'medium',
        priority: issueData.priority || 'P2',
        category: null,
        task_id: taskId,
        project_id: null,
        reporter: issueData.discoverer || null,
        assignee: null,
        created_at: new Date().toISOString(),
        resolved_at: null,
        root_cause: null,
        solution: null,
        resolution: null,
        reflection: null,
        tags: [],
        related_issues: []
    };
    
    issuesDAL.create(issue);
    console.log(`[IssueAutoCreator] 问题已创建到 issues 表: ${issueId}`);
    
    // 记录日志
    logIssueAction('ISSUE_CREATED', taskId, issue, { source: issueData.source });
    
    // 触发分析
    triggerAnalysis(taskId, issue, false);
    
    return { existing: false, issue };
}

/**
 * 创建问题到任务 issues 字段（旧方式）
 */
async function createIssueToTasks(taskId, issueData, options = {}) {
    const tasks = readTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
        throw new Error(`任务不存在: ${taskId}`);
    }
    
    // 确保问题数组存在
    if (!tasks[taskIndex].issues) {
        tasks[taskIndex].issues = [];
    }
    
    // 检查是否已存在相同问题（去重）
    const existingIssue = tasks[taskIndex].issues.find(i => 
        i.name === issueData.name && 
        i.status === 'open' &&
        !i.resolved_at
    );
    
    if (existingIssue && !options.forceCreate) {
        console.log(`[IssueAutoCreator] 问题已存在，跳过创建: ${issueData.name}`);
        return { existing: true, issue: existingIssue };
    }
    
    // 判断是否需要深度分析
    const needsDeepAnalysis = checkNeedsDeepAnalysis(issueData);
    
    // 创建问题对象
    const newIssue = {
        id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: issueData.name,
        description: issueData.description || '',
        discoverer: issueData.discoverer || 'system',
        discoverer_type: issueData.discoverer_type || 'system',
        created_at: new Date().toISOString(),
        status: 'open',
        priority: issueData.priority || 'medium',
        source: issueData.source || 'unknown',
        
        // 分析相关
        analysis_status: 'pending',
        analysis_type: needsDeepAnalysis ? 'deep' : 'normal',
        analyzed_at: null,
        analyzer: null,
        root_cause: null,
        solution: null,
        can_auto_fix: false,
        fix_status: null,
        
        // 来源详情
        source_detail: issueData.source_detail || null,
        metrics: issueData.metrics || null
    };
    
    // 添加到任务
    tasks[taskIndex].issues.push(newIssue);
    tasks[taskIndex].updated_at = new Date().toISOString();
    writeTasks(tasks);
    
    console.log(`[IssueAutoCreator] 问题已创建: ${newIssue.id}`);
    
    // 记录日志
    logIssueAction('ISSUE_CREATED', taskId, newIssue, { source: issueData.source });
    
    // 异步触发分析
    triggerAnalysis(taskId, newIssue, needsDeepAnalysis);
    
    return { existing: false, issue: newIssue };
}

/**
 * 创建问题（统一入口）
 */
async function createIssue(taskId, issueData, options = {}) {
    console.log(`[IssueAutoCreator] 创建问题: ${issueData.name}`);
    
    // 新方式：使用 SQLite issues 表
    if (USE_NEW_STORAGE) {
        return createIssueToTable(taskId, issueData);
    }
    
    // 旧方式：嵌套到任务 issues 字段
    return createIssueToTasks(taskId, issueData, options);
}

/**
 * 监控器创建问题
 * @param {string} taskId - 任务ID
 * @param {object} alert - 监控告警
 */
async function createFromMonitor(taskId, alert) {
    console.log(`[IssueAutoCreator] 监控告警创建问题: ${alert.type}`);
    
    return createIssue(taskId, {
        name: `[监控] ${alert.type}: ${alert.message}`,
        description: alert.detail || alert.message,
        discoverer: 'monitor',
        discoverer_type: 'monitor',
        source: 'monitor',
        priority: alert.severity === 'critical' ? 'high' : 'medium',
        source_detail: {
            monitor_type: alert.type,
            monitor_id: alert.monitor_id,
            threshold: alert.threshold,
            actual_value: alert.actual_value
        },
        metrics: alert.metrics
    });
}

/**
 * 测试系统创建问题
 * @param {string} taskId - 任务ID
 * @param {object} testResult - 测试结果
 */
async function createFromTest(taskId, testResult) {
    console.log(`[IssueAutoCreator] 测试失败创建问题: ${testResult.test_name}`);
    
    return createIssue(taskId, {
        name: `[测试失败] ${testResult.test_name}`,
        description: testResult.error || testResult.message || '测试未通过',
        discoverer: 'test',
        discoverer_type: 'test',
        source: 'test',
        priority: testResult.critical ? 'high' : 'medium',
        source_detail: {
            test_name: testResult.test_name,
            test_type: testResult.test_type,
            expected: testResult.expected,
            actual: testResult.actual,
            error_stack: testResult.error_stack
        }
    });
}

/**
 * 验收系统创建问题
 * @param {string} taskId - 任务ID
 * @param {object} acceptanceResult - 验收结果
 */
async function createFromAcceptance(taskId, acceptanceResult) {
    console.log(`[IssueAutoCreator] 验收失败创建问题: ${acceptanceResult.check_name}`);
    
    const isAutoAcceptance = acceptanceResult.type === 'auto';
    
    return createIssue(taskId, {
        name: `[${isAutoAcceptance ? '自动验收' : '人工验收'}] ${acceptanceResult.check_name}`,
        description: acceptanceResult.detail || acceptanceResult.message || '验收未通过',
        discoverer: isAutoAcceptance ? 'auto_acceptance' : 'user',
        discoverer_type: 'acceptance',
        source: 'acceptance',
        priority: acceptanceResult.critical ? 'high' : 'medium',
        source_detail: {
            check_name: acceptanceResult.check_name,
            check_type: acceptanceResult.check_type,
            expected: acceptanceResult.expected,
            actual: acceptanceResult.actual,
            acceptance_type: isAutoAcceptance ? 'auto' : 'manual',
            user: acceptanceResult.user
        }
    });
}

/**
 * Agent执行异常创建问题
 * @param {string} taskId - 任务ID
 * @param {object} error - 错误信息
 */
async function createFromAgentError(taskId, error) {
    console.log(`[IssueAutoCreator] Agent异常创建问题: ${error.agent}`);
    
    return createIssue(taskId, {
        name: `[Agent异常] ${error.agent}: ${error.type}`,
        description: error.message || 'Agent执行过程中发生错误',
        discoverer: error.agent,
        discoverer_type: 'agent',
        source: 'agent_error',
        priority: 'high',
        source_detail: {
            agent_id: error.agent,
            error_type: error.type,
            error_stack: error.stack,
            step: error.step,
            timestamp: error.timestamp
        }
    });
}

/**
 * 判断是否需要深度分析
 */
function checkNeedsDeepAnalysis(issueData) {
    const desc = (issueData.description || '').toLowerCase();
    const name = (issueData.name || '').toLowerCase();
    
    const deepKeywords = [
        '功能缺失', '没实现', '缺少', '未实现', '遗漏',
        'bug', '错误', '不正确', '异常',
        '验收', '测试没过'
    ];
    
    return deepKeywords.some(kw => desc.includes(kw) || name.includes(kw));
}

/**
 * 触发分析
 */
async function triggerAnalysis(taskId, issue, needsDeepAnalysis) {
    try {
        if (needsDeepAnalysis) {
            await deepAnalyzer.deepAnalyzeIssue(taskId, issue.id);
        } else {
            await issueAnalyzer.handleNewIssue(taskId, issue);
        }
        console.log(`[IssueAutoCreator] 分析完成: ${issue.id}`);
    } catch (err) {
        console.error(`[IssueAutoCreator] 分析失败:`, err);
    }
}

/**
 * 记录日志
 */
function logIssueAction(action, taskId, issue, data) {
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
        console.error('[IssueAutoCreator] 写入日志失败:', err);
    }
}

// ==================== CLI ====================

if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command) {
        console.log(`
Issue Auto Creator - 问题自动创建器

Usage:
  node issue-auto-creator.js <command> <taskId> <data>

Commands:
  monitor    从监控告警创建问题
  test       从测试结果创建问题
  acceptance 从验收结果创建问题
  agent      从Agent异常创建问题

Examples:
  node issue-auto-creator.js monitor <taskId> '{"type":"cpu_high","message":"CPU超过阈值",...}'
  node issue-auto-creator.js test <taskId> '{"test_name":"登录测试","error":"密码验证失败",...}'
`);
        process.exit(0);
    }
    
    const taskId = args[1];
    const data = JSON.parse(args[2] || '{}');
    
    let promise;
    switch (command) {
        case 'monitor':
            promise = createFromMonitor(taskId, data);
            break;
        case 'test':
            promise = createFromTest(taskId, data);
            break;
        case 'acceptance':
            promise = createFromAcceptance(taskId, data);
            break;
        case 'agent':
            promise = createFromAgentError(taskId, data);
            break;
        default:
            console.error('未知命令:', command);
            process.exit(1);
    }
    
    promise.then(result => {
        console.log(JSON.stringify(result, null, 2));
    }).catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
}

module.exports = {
    createIssue,
    createFromMonitor,
    createFromTest,
    createFromAcceptance,
    createFromAgentError
};
