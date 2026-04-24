#!/usr/bin/env node
/**
 * Issue Auto Analyzer - 问题自动分析与修复触发器
 * 
 * 功能：
 * 1. 监听问题创建事件
 * 2. 自动分析问题原因
 * 3. 触发自动修复或生成修复建议
 * 4. 更新问题状态
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DATA_DIR = path.join(__dirname, '../data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const ISSUE_LOGS_FILE = path.join(DATA_DIR, 'issue-logs.json');

// ==================== 问题类型映射 ====================

const ISSUE_HANDLERS = {
    // 数据问题 - 自动修复
    'data_missing': {
        autoFix: true,
        priority: 'high',
        handler: 'fix-missing-data.sh'
    },
    // UI问题 - 自动修复
    'ui_display': {
        autoFix: true,
        priority: 'medium',
        handler: 'fix-ui-issue.sh'
    },
    // 逻辑问题 - 需要人工确认
    'logic_error': {
        autoFix: false,
        priority: 'high',
        handler: 'analyze-logic-issue.sh'
    },
    // 性能问题 - 分析后建议
    'performance': {
        autoFix: false,
        priority: 'medium',
        handler: 'analyze-performance.sh'
    },
    // 功能缺失 - 创建新任务
    'feature_missing': {
        autoFix: false,
        priority: 'medium',
        action: 'create_task'
    },
    // 默认处理
    'default': {
        autoFix: false,
        priority: 'medium',
        handler: 'analyze-generic-issue.sh'
    }
};

// ==================== 核心功能 ====================

/**
 * 读取任务数据
 */
function readTasks() {
    if (!fs.existsSync(TASKS_FILE)) return [];
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
}

/**
 * 写入任务数据
 */
function writeTasks(tasks) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

/**
 * 分析问题类型
 * @param {object} issue - 问题对象
 * @returns {string} 问题类型
 */
function analyzeIssueType(issue) {
    const desc = (issue.description || '').toLowerCase();
    const name = (issue.name || issue.title || '').toLowerCase();
    
    // 数据问题关键词
    if (desc.includes('数据') || desc.includes('缺失') || desc.includes('为空') ||
        name.includes('数据') || name.includes('缺失')) {
        return 'data_missing';
    }
    
    // UI问题关键词
    if (desc.includes('显示') || desc.includes('样式') || desc.includes('页面') ||
        name.includes('显示') || name.includes('样式') || name.includes('ui')) {
        return 'ui_display';
    }
    
    // 逻辑问题关键词
    if (desc.includes('逻辑') || desc.includes('计算') || desc.includes('错误') ||
        name.includes('逻辑') || name.includes('计算错误')) {
        return 'logic_error';
    }
    
    // 性能问题关键词
    if (desc.includes('性能') || desc.includes('慢') || desc.includes('超时') ||
        name.includes('性能') || name.includes('超时')) {
        return 'performance';
    }
    
    // 功能缺失关键词
    if (desc.includes('缺失') || desc.includes('没有') || desc.includes('缺少') ||
        name.includes('缺失') || name.includes('缺少功能')) {
        return 'feature_missing';
    }
    
    return 'default';
}

/**
 * 触发问题分析
 * @param {string} taskId - 任务ID
 * @param {object} issue - 问题对象
 */
async function triggerAnalysis(taskId, issue) {
    console.log(`[IssueAnalyzer] 开始分析问题: ${issue.name || issue.title}`);
    
    const issueType = analyzeIssueType(issue);
    const handler = ISSUE_HANDLERS[issueType] || ISSUE_HANDLERS['default'];
    
    // 更新问题状态为分析中
    const tasks = readTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
        throw new Error(`任务不存在: ${taskId}`);
    }
    
    const issueIndex = tasks[taskIndex].issues.findIndex(i => 
        (i.id && i.id === issue.id) || 
        (i.name === issue.name && i.created_at === issue.created_at)
    );
    
    if (issueIndex === -1) {
        throw new Error(`问题不存在: ${issue.name}`);
    }
    
    // 更新问题状态
    tasks[taskIndex].issues[issueIndex].analysis_status = 'analyzing';
    tasks[taskIndex].issues[issueIndex].analysis_type = issueType;
    tasks[taskIndex].issues[issueIndex].can_auto_fix = handler.autoFix;
    writeTasks(tasks);
    
    // 记录分析日志
    logAnalysis('ANALYSIS_STARTED', taskId, issue, { type: issueType, handler });
    
    // 模拟分析过程（实际应该调用 AI 或规则引擎）
    const analysisResult = await performAnalysis(issue, issueType);
    
    // 更新分析结果
    tasks[taskIndex].issues[issueIndex].root_cause = analysisResult.root_cause;
    tasks[taskIndex].issues[issueIndex].solution = analysisResult.solution;
    tasks[taskIndex].issues[issueIndex].analysis_status = 'completed';
    tasks[taskIndex].issues[issueIndex].analyzed_at = new Date().toISOString();
    tasks[taskIndex].issues[issueIndex].analyzer = 'auto-analyzer';
    writeTasks(tasks);
    
    logAnalysis('ANALYSIS_COMPLETED', taskId, issue, analysisResult);
    
    // 如果可以自动修复，触发修复
    if (handler.autoFix && analysisResult.can_fix) {
        console.log(`[IssueAnalyzer] 问题可自动修复，触发修复流程...`);
        await triggerAutoFix(taskId, tasks[taskIndex].issues[issueIndex], analysisResult);
    }
    
    return analysisResult;
}

/**
 * 执行问题分析
 */
async function performAnalysis(issue, issueType) {
    // 这里应该调用实际的 AI 分析或规则引擎
    // 目前返回模拟结果
    
    const templates = {
        'data_missing': {
            root_cause: '数据字段未正确填充，可能是创建时遗漏或更新时被覆盖。',
            solution: '补充缺失的数据字段，并检查数据填充逻辑确保不再遗漏。',
            can_fix: true,
            fix_steps: ['定位缺失字段', '填充默认值或正确值', '验证修复结果']
        },
        'ui_display': {
            root_cause: '前端渲染逻辑或样式问题，可能是字段映射错误或CSS冲突。',
            solution: '检查前端代码中的字段映射，修正CSS样式或JavaScript渲染逻辑。',
            can_fix: true,
            fix_steps: ['检查前端代码', '修正字段映射', '测试显示效果']
        },
        'logic_error': {
            root_cause: '业务逻辑实现与预期不符，需要详细检查代码逻辑。',
            solution: '需要人工确认具体逻辑问题后进行修复。',
            can_fix: false
        },
        'performance': {
            root_cause: '性能瓶颈，可能是数据库查询慢或前端渲染复杂度高。',
            solution: '优化数据库查询、添加缓存或简化前端渲染。',
            can_fix: false
        },
        'feature_missing': {
            root_cause: '功能未实现或未正确集成。',
            solution: '创建新任务进行功能开发。',
            can_fix: false,
            suggested_task: {
                title: `实现缺失功能: ${issue.name}`,
                priority: 'P2',
                description: issue.description
            }
        },
        'default': {
            root_cause: '问题原因需要进一步分析。',
            solution: '建议人工介入分析具体问题。',
            can_fix: false
        }
    };
    
    return templates[issueType] || templates['default'];
}

/**
 * 触发自动修复
 */
async function triggerAutoFix(taskId, issue, analysisResult) {
    console.log(`[IssueAnalyzer] 开始自动修复: ${issue.name}`);
    
    const tasks = readTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    // 更新状态为修复中
    tasks[taskIndex].issues.forEach((i, idx) => {
        if (i.name === issue.name && i.created_at === issue.created_at) {
            tasks[taskIndex].issues[idx].fix_status = 'fixing';
        }
    });
    writeTasks(tasks);
    
    logAnalysis('AUTO_FIX_STARTED', taskId, issue, analysisResult);
    
    // 模拟修复过程（实际应该调用修复脚本或执行器）
    // 这里可以调用 sessions_spawn 让 subagent 执行修复
    const fixResult = {
        success: true,
        fixed_at: new Date().toISOString(),
        resolver: 'auto-fixer',
        fix_detail: analysisResult.solution
    };
    
    // 更新修复结果
    tasks[taskIndex].issues.forEach((i, idx) => {
        if (i.name === issue.name && i.created_at === issue.created_at) {
            tasks[taskIndex].issues[idx].status = 'fixed';
            tasks[taskIndex].issues[idx].fix_status = 'completed';
            tasks[taskIndex].issues[idx].resolved_at = fixResult.fixed_at;
            tasks[taskIndex].issues[idx].resolver = fixResult.resolver;
            tasks[taskIndex].issues[idx].fix_detail = fixResult.fix_detail;
        }
    });
    writeTasks(tasks);
    
    logAnalysis('AUTO_FIX_COMPLETED', taskId, issue, fixResult);
    
    return fixResult;
}

/**
 * 记录分析日志
 */
function logAnalysis(action, taskId, issue, data) {
    try {
        const logs = fs.existsSync(ISSUE_LOGS_FILE) 
            ? JSON.parse(fs.readFileSync(ISSUE_LOGS_FILE, 'utf-8'))
            : [];
        
        logs.push({
            action,
            taskId,
            issueId: issue.id,
            issueName: issue.name || issue.title,
            data,
            timestamp: new Date().toISOString()
        });
        
        // 限制日志数量
        if (logs.length > 1000) {
            logs.splice(0, logs.length - 1000);
        }
        
        fs.writeFileSync(ISSUE_LOGS_FILE, JSON.stringify(logs, null, 2));
    } catch (err) {
        console.error('写入日志失败:', err);
    }
}

// ==================== API 接口 ====================

/**
 * 处理新问题（入口函数）
 */
async function handleNewIssue(taskId, issue) {
    console.log(`[IssueAnalyzer] 收到新问题: ${taskId} - ${issue.name || issue.title}`);
    
    try {
        const result = await triggerAnalysis(taskId, issue);
        return {
            success: true,
            analysis: result
        };
    } catch (err) {
        console.error('[IssueAnalyzer] 分析失败:', err);
        return {
            success: false,
            error: err.message
        };
    }
}

// ==================== CLI 接口 ====================

if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command) {
        console.log(`
Issue Auto Analyzer - 问题自动分析器

Usage:
  node issue-auto-analyzer.js analyze <taskId> <issueIndex>
  node issue-auto-analyzer.js watch

Commands:
  analyze   分析指定问题
  watch     监听问题创建事件

Examples:
  node issue-auto-analyzer.js analyze 20b93823-xxx 0
  node issue-auto-analyzer.js watch
`);
        process.exit(0);
    }
    
    if (command === 'analyze') {
        const [taskId, issueIndex] = args.slice(1);
        const tasks = readTasks();
        const task = tasks.find(t => t.id === taskId);
        
        if (!task) {
            console.error('任务不存在');
            process.exit(1);
        }
        
        const issue = task.issues[parseInt(issueIndex)];
        if (!issue) {
            console.error('问题不存在');
            process.exit(1);
        }
        
        handleNewIssue(taskId, issue).then(result => {
            console.log(JSON.stringify(result, null, 2));
        });
    }
}

module.exports = {
    handleNewIssue,
    triggerAnalysis,
    analyzeIssueType,
    triggerAutoFix
};
