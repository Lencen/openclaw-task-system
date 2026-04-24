#!/usr/bin/env node
/**
 * Issue Deep Analyzer - 问题深度分析器
 * 
 * 专门处理功能缺失和功能bug类问题
 * 通过AI分析原始任务需求和实现情况，定位问题并生成修复方案
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

function readTasks() {
    if (!fs.existsSync(TASKS_FILE)) return [];
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
}

function writeTasks(tasks) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

/**
 * 深度分析功能缺失问题
 * @param {object} task - 任务对象
 * @param {object} issue - 问题对象
 * @returns {object} 分析结果
 */
async function analyzeFeatureMissing(task, issue) {
    console.log('[DeepAnalyzer] 分析功能缺失问题...');
    
    // 1. 获取原始需求
    const originalRequirement = task.user_description || task.description || '';
    
    // 2. 获取已实现的内容
    const implementedFeatures = extractImplementedFeatures(task);
    
    // 3. 分析缺失的功能（需要AI）
    const missingFeatures = await identifyMissingFeatures(
        originalRequirement,
        implementedFeatures,
        issue.description
    );
    
    // 4. 生成修复方案
    const fixPlan = await generateFixPlan(missingFeatures, task);
    
    return {
        type: 'feature_missing',
        severity: 'high',
        root_cause: `功能缺失：${missingFeatures.map(f => f.name).join('、')}`,
        solution: fixPlan.description,
        can_auto_fix: fixPlan.can_auto_fix,
        fix_steps: fixPlan.steps,
        missing_features: missingFeatures,
        suggested_subagent: fixPlan.suggested_agent,
        estimated_effort: fixPlan.estimated_effort
    };
}

/**
 * 分析访问/显示问题
 */
async function analyzeAccessIssue(task, issue) {
    console.log('[DeepAnalyzer] 分析访问问题...');
    
    return {
        type: 'access_issue',
        severity: 'high',
        root_cause: '开发结果未正确输出或链接配置错误，可能是：1) 输出文件路径不正确；2) 页面路由未配置；3) 输出记录未保存到outputs字段',
        solution: '1. 检查任务输出目录中的文件；2. 验证页面路由配置；3. 补充outputs字段中的文档链接',
        can_auto_fix: true,
        fix_steps: [
            '检查任务工作目录的输出文件',
            '验证页面URL是否可访问',
            '补充outputs字段记录',
            '验证文档链接有效性'
        ],
        suggested_agent: 'coder',
        estimated_effort: '30分钟'
    };
}

/**
 * 深度分析功能bug问题
 * @param {object} task - 任务对象
 * @param {object} issue - 问题对象
 * @returns {object} 分析结果
 */
async function analyzeFunctionBug(task, issue) {
    console.log('[DeepAnalyzer] 分析功能bug问题...');
    
    // 1. 获取问题相关代码
    const relatedCode = await findRelatedCode(task, issue);
    
    // 2. 分析bug原因（需要AI）
    const bugAnalysis = await analyzeBugRootCause(issue.description, relatedCode);
    
    // 3. 生成修复方案
    const fixPlan = await generateBugFixPlan(bugAnalysis, task);
    
    return {
        type: 'function_bug',
        severity: 'high',
        root_cause: bugAnalysis.root_cause,
        solution: fixPlan.description,
        can_auto_fix: fixPlan.can_auto_fix,
        fix_steps: fixPlan.steps,
        bug_location: bugAnalysis.location,
        suggested_subagent: fixPlan.suggested_agent,
        estimated_effort: fixPlan.estimated_effort
    };
}

/**
 * 提取已实现的功能
 */
function extractImplementedFeatures(task) {
    const features = [];
    
    // 从输出结果中提取
    if (task.outputs) {
        if (task.outputs.code) {
            features.push(...task.outputs.code.map(c => ({
                type: 'code',
                name: c.name,
                path: c.path
            })));
        }
        if (task.outputs.pages) {
            features.push(...task.outputs.pages.map(p => ({
                type: 'page',
                name: p.name,
                url: p.url
            })));
        }
    }
    
    // 从步骤中提取
    if (task.breakdown) {
        features.push(...task.breakdown.map(s => ({
            type: 'step',
            name: s.name,
            status: s.status
        })));
    }
    
    return features;
}

/**
 * 识别缺失的功能（需要AI）
 */
async function identifyMissingFeatures(requirement, implemented, issueDescription) {
    // 这里应该调用AI进行深度分析
    // 目前返回模拟结果
    
    // 解析原始需求中的功能点
    const requiredFeatures = parseRequiredFeatures(requirement);
    
    // 对比已实现的功能
    const missing = requiredFeatures.filter(req => 
        !implemented.some(imp => 
            imp.name && imp.name.toLowerCase().includes(req.keyword.toLowerCase())
        )
    );
    
    // 如果issue描述中有具体功能，优先处理
    if (issueDescription) {
        const mentionedFeature = {
            name: issueDescription,
            keyword: issueDescription.split(/[，,。\s]+/)[0],
            priority: 'high',
            from_issue: true
        };
        
        // 检查是否已经在missing列表中
        if (!missing.some(m => m.name === mentionedFeature.name)) {
            missing.unshift(mentionedFeature);
        }
    }
    
    return missing.length > 0 ? missing : [{
        name: '未知功能',
        keyword: 'unknown',
        priority: 'medium',
        from_issue: true
    }];
}

/**
 * 解析原始需求中的功能点
 */
function parseRequiredFeatures(requirement) {
    const features = [];
    
    // 简单的关键词提取（实际应该用AI）
    const keywords = ['管理', '查询', '创建', '删除', '更新', '导出', '导入', '分析', '统计'];
    
    keywords.forEach(keyword => {
        const regex = new RegExp(`([^，,。\\s]*${keyword}[^，,。\\s]*)`, 'g');
        const matches = requirement.match(regex);
        if (matches) {
            matches.forEach(match => {
                features.push({
                    name: match,
                    keyword: keyword,
                    priority: 'medium'
                });
            });
        }
    });
    
    return features;
}

/**
 * 查找相关代码
 */
async function findRelatedCode(task, issue) {
    // 这里应该分析任务输出，找到相关代码文件
    const relatedFiles = [];
    
    if (task.outputs && task.outputs.code) {
        // 根据issue描述匹配相关代码文件
        const keywords = issue.description.split(/[，,。\\s]+/);
        
        task.outputs.code.forEach(codeFile => {
            const name = codeFile.name.toLowerCase();
            if (keywords.some(kw => name.includes(kw.toLowerCase()))) {
                relatedFiles.push(codeFile);
            }
        });
    }
    
    return relatedFiles;
}

/**
 * 分析bug根因
 */
async function analyzeBugRootCause(description, relatedCode) {
    // 这里应该调用AI分析代码
    // 目前返回模拟结果
    
    return {
        root_cause: `功能实现存在问题：${description}`,
        location: relatedCode.length > 0 ? relatedCode[0].path : '未知',
        confidence: 0.7
    };
}

/**
 * 生成修复方案
 */
async function generateFixPlan(missingFeatures, task) {
    // 判断是否可以自动修复
    const simpleFeatures = missingFeatures.filter(f => 
        ['查询', '列表', '显示', '导出'].some(k => f.name.includes(k))
    );
    
    const complexFeatures = missingFeatures.filter(f => 
        ['权限', '安全', '认证', '支付'].some(k => f.name.includes(k))
    );
    
    if (complexFeatures.length > 0) {
        // 复杂功能需要人工确认
        return {
            can_auto_fix: false,
            description: `需要补充实现 ${missingFeatures.map(f => f.name).join('、')}。部分功能较复杂，建议人工确认后再实施。`,
            steps: [
                '确认功能需求细节',
                '设计实现方案',
                '开发实现',
                '测试验证'
            ],
            suggested_agent: 'coder',
            estimated_effort: '2-4小时'
        };
    }
    
    if (simpleFeatures.length > 0) {
        // 简单功能可以自动修复
        return {
            can_auto_fix: true,
            description: `可以自动补充实现：${simpleFeatures.map(f => f.name).join('、')}`,
            steps: [
                '分析现有代码结构',
                '补充缺失功能的API',
                '补充前端页面/组件',
                '编写测试用例',
                '验证功能正确性'
            ],
            suggested_agent: 'coder',
            estimated_effort: '30分钟-1小时'
        };
    }
    
    return {
        can_auto_fix: false,
        description: '需要进一步分析功能需求后确定修复方案',
        steps: ['需求确认', '方案设计', '开发实现'],
        suggested_agent: 'coder',
        estimated_effort: '1-2小时'
    };
}

/**
 * 生成bug修复方案
 */
async function generateBugFixPlan(bugAnalysis, task) {
    return {
        can_auto_fix: true,
        description: `修复 ${bugAnalysis.location} 中的问题`,
        steps: [
            '定位bug具体位置',
            '分析bug原因',
            '编写修复代码',
            '测试验证'
        ],
        suggested_agent: 'coder',
        estimated_effort: '30分钟'
    };
}

/**
 * 触发自动修复（调用subagent）
 */
async function triggerAutoFix(taskId, issue, analysisResult) {
    console.log('[DeepAnalyzer] 触发自动修复...');
    
    // 更新问题状态
    const tasks = readTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
        throw new Error('任务不存在');
    }
    
    const issueIndex = tasks[taskIndex].issues.findIndex(i => 
        i.id === issue.id || (i.name === issue.name && i.created_at === issue.created_at)
    );
    
    if (issueIndex === -1) {
        throw new Error('问题不存在');
    }
    
    // 更新状态
    tasks[taskIndex].issues[issueIndex].fix_status = 'fixing';
    tasks[taskIndex].issues[issueIndex].fix_triggered_at = new Date().toISOString();
    writeTasks(tasks);
    
    // 生成修复任务描述
    const fixTaskDescription = generateFixTaskDescription(issue, analysisResult, tasks[taskIndex]);
    
    // 返回修复任务信息（实际应该调用 sessions_spawn）
    return {
        fix_task: {
            title: `修复: ${issue.name}`,
            description: fixTaskDescription,
            priority: 'P1',
            parent_task: taskId,
            issue_id: issue.id,
            suggested_agent: analysisResult.suggested_subagent
        },
        message: '修复任务已创建，请确认后执行'
    };
}

/**
 * 生成修复任务描述
 */
function generateFixTaskDescription(issue, analysisResult, task) {
    let desc = `## 问题\n${issue.description || issue.name}\n\n`;
    desc += `## 根因\n${analysisResult.root_cause}\n\n`;
    desc += `## 解决方案\n${analysisResult.solution}\n\n`;
    desc += `## 修复步骤\n`;
    analysisResult.fix_steps.forEach((step, i) => {
        desc += `${i + 1}. ${step}\n`;
    });
    
    if (analysisResult.missing_features) {
        desc += `\n## 缺失功能\n`;
        analysisResult.missing_features.forEach(f => {
            desc += `- ${f.name}\n`;
        });
    }
    
    desc += `\n## 原始任务\n${task.title}\n`;
    desc += `\n请根据以上信息修复问题。`;
    
    return desc;
}

// ==================== 主入口 ====================

/**
 * 深度分析问题（主入口）
 */
async function deepAnalyzeIssue(taskId, issueId) {
    const tasks = readTasks();
    const task = tasks.find(t => t.id === taskId);
    
    if (!task) {
        throw new Error('任务不存在');
    }
    
    const issue = task.issues.find(i => i.id === issueId);
    if (!issue) {
        throw new Error('问题不存在');
    }
    
    console.log(`[DeepAnalyzer] 开始深度分析: ${issue.name}`);
    
    let result;
    
    // 根据问题类型选择分析方式
    const issueName = issue.name || issue.title || '';
    const issueDesc = issue.description || '';
    
    if (issueDesc && (
        issueDesc.includes('功能缺失') ||
        issueDesc.includes('没实现') ||
        issueDesc.includes('缺少') ||
        issueName.includes('功能缺失')
    )) {
        result = await analyzeFeatureMissing(task, issue);
    } else if (issueDesc && (
        issueDesc.includes('bug') ||
        issueDesc.includes('错误') ||
        issueDesc.includes('不正确') ||
        issueName.includes('bug')
    )) {
        result = await analyzeFunctionBug(task, issue);
    } else if (issueDesc && (
        issueDesc.includes('无法获得') ||
        issueDesc.includes('打不开') ||
        issueDesc.includes('访问')
    )) {
        // 访问/显示问题
        result = await analyzeAccessIssue(task, issue);
    } else {
        // 通用分析
        result = {
            type: 'unknown',
            severity: 'medium',
            root_cause: '需要进一步分析问题原因',
            solution: '建议人工介入分析',
            can_auto_fix: false
        };
    }
    
    // 更新问题分析结果
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    const issueIndex = tasks[taskIndex].issues.findIndex(i => i.id === issueId);
    
    tasks[taskIndex].issues[issueIndex] = {
        ...tasks[taskIndex].issues[issueIndex],
        ...result,
        analysis_status: 'completed',
        analyzed_at: new Date().toISOString(),
        analyzer: 'deep-analyzer'
    };
    
    writeTasks(tasks);
    
    console.log('[DeepAnalyzer] 分析完成');
    
    return result;
}

// ==================== CLI ====================

if (require.main === module) {
    const args = process.argv.slice(2);
    const [taskId, issueId] = args;
    
    if (!taskId || !issueId) {
        console.log('Usage: node issue-deep-analyzer.js <taskId> <issueId>');
        process.exit(1);
    }
    
    deepAnalyzeIssue(taskId, issueId).then(result => {
        console.log(JSON.stringify(result, null, 2));
    }).catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
}

module.exports = {
    deepAnalyzeIssue,
    analyzeFeatureMissing,
    analyzeFunctionBug,
    triggerAutoFix
};
