/**
 * Issue API Router - 问题管理 API
 * 
 * 功能：
 * - 创建问题（手动/自动）
 * - 触发自动分析（普通/深度）
 * - 触发自动修复
 * - 更新问题状态
 */

const express = require('express');
const router = express.Router();
const { getDAL } = require('../db/data-access-layer');
const db = require('../db');
const issueAnalyzer = require('../../scripts/issue-auto-analyzer');
const deepAnalyzer = require('../../scripts/issue-deep-analyzer');
const issueCreator = require('../../scripts/issue-auto-creator');
const issueFixer = require('../../scripts/issue-auto-fixer');

const dal = getDAL();
const issuesDal = db.issues; // 使用数据库统一入口的 issues 对象

// 读取任务列表
async function readTasks() {
    return dal.listTasks();
}

// 读取单个任务
async function readTaskById(id) {
    return dal.getTask(id);
}

// 保存任务（包含 issues）
async function saveTask(task) {
    // 更新任务的 issues 字段
    await dal.updateTask(task.id, { issues: task.issues });
}

/**
 * POST /api/issues/:taskId - 创建问题并触发自动分析
 */
router.post('/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        const issue = req.body;
        
        const task = await readTaskById(taskId);
        
        if (!task) {
            return res.status(404).json({ success: false, error: '任务不存在' });
        }
        
        // 使用自动创建器创建问题
        const result = await issueCreator.createIssue(taskId, {
            name: issue.name || issue.title,
            description: issue.description || '',
            discoverer: issue.discoverer || 'user',
            discoverer_type: issue.discoverer_type || 'user',
            source: issue.source || 'manual',
            priority: issue.priority || 'medium',
            source_detail: issue.source_detail
        });
        
        res.json({
            success: true,
            data: {
                issue: result.issue,
                existing: result.existing,
                analysis_type: result.issue.analysis_type,
                message: result.existing 
                    ? '问题已存在' 
                    : '问题已创建，正在自动分析中...'
            }
        });
        
    } catch (err) {
        console.error('[IssueAPI] 创建问题失败:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/issues/:taskId/monitor - 监控器创建问题
 */
router.post('/:taskId/monitor', async (req, res) => {
    try {
        const { taskId } = req.params;
        const alert = req.body;
        
        const result = await issueCreator.createFromMonitor(taskId, alert);
        
        res.json({
            success: true,
            data: result
        });
        
    } catch (err) {
        console.error('[IssueAPI] 监控创建问题失败:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/issues/:taskId/test - 测试系统创建问题
 */
router.post('/:taskId/test', async (req, res) => {
    try {
        const { taskId } = req.params;
        const testResult = req.body;
        
        const result = await issueCreator.createFromTest(taskId, testResult);
        
        res.json({
            success: true,
            data: result
        });
        
    } catch (err) {
        console.error('[IssueAPI] 测试创建问题失败:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/issues/:taskId/acceptance - 验收系统创建问题
 */
router.post('/:taskId/acceptance', async (req, res) => {
    try {
        const { taskId } = req.params;
        const acceptanceResult = req.body;
        
        const result = await issueCreator.createFromAcceptance(taskId, acceptanceResult);
        
        res.json({
            success: true,
            data: result
        });
        
    } catch (err) {
        console.error('[IssueAPI] 验收创建问题失败:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/issues/:taskId/agent-error - Agent异常创建问题
 */
router.post('/:taskId/agent-error', async (req, res) => {
    try {
        const { taskId } = req.params;
        const error = req.body;
        
        const result = await issueCreator.createFromAgentError(taskId, error);
        
        res.json({
            success: true,
            data: result
        });
        
    } catch (err) {
        console.error('[IssueAPI] Agent异常创建问题失败:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/issues/:taskId/:issueId/analyze - 手动触发问题分析
 * 支持从任务 issues 或独立 issues 表读取
 */
router.post('/:taskId/:issueId/analyze', async (req, res) => {
    try {
        const { taskId, issueId } = req.params;
        const { deep } = req.body;
        
        const task = await readTaskById(taskId);
        
        if (!task) {
            return res.status(404).json({ success: false, error: '任务不存在' });
        }
        
        // 尝试从任务 issues 中查找
        let issue = (task.issues || []).find(i => i.id === issueId);
        
        // 如果在任务 issues 中找不到，尝试从独立 issues 表查找
        if (!issue) {
            const issueFromTable = issuesDal.get(issueId);
            if (issueFromTable) {
                // 转换格式
                issue = {
                    id: issueFromTable.id,
                    name: issueFromTable.title,
                    title: issueFromTable.title,
                    description: issueFromTable.description,
                    created_at: issueFromTable.created_at,
                    status: issueFromTable.status,
                    priority: issueFromTable.priority,
                    source: issueFromTable.source,
                    root_cause: issueFromTable.root_cause,
                    solution: issueFromTable.solution
                };
            }
        }
        
        if (!issue) {
            return res.status(404).json({ success: false, error: '问题不存在' });
        }
        
        let result;
        if (deep || issue.analysis_type === 'deep') {
            result = await deepAnalyzer.deepAnalyzeIssue(taskId, issueId);
        } else {
            result = await issueAnalyzer.handleNewIssue(taskId, issue);
        }
        
        res.json({
            success: true,
            data: result
        });
        
    } catch (err) {
        console.error('[IssueAPI] 分析失败:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/issues/:taskId/:issueId/auto-fix - 触发自动修复
 * 支持从任务 issues 或独立 issues 表读取
 */
router.post('/:taskId/:issueId/auto-fix', async (req, res) => {
    try {
        const { taskId, issueId } = req.params;
        
        const task = await readTaskById(taskId);
        if (!task) {
            return res.status(404).json({ success: false, error: '任务不存在' });
        }
        
        // 检查问题是否在任务 issues 中
        const issueInTask = (task.issues || []).find(i => i.id === issueId);
        
        // 从独立 issues 表读取完整信息
        const issueFromTable = issuesDal.get(issueId);
        
        let result;
        if (issueInTask) {
            // 优先使用任务中的问题（兼容旧数据）
            result = await issueFixer.executeAutoFix(taskId, issueId);
        } else if (issueFromTable) {
            // 如果问题只在 issues 表中，需要创建临时问题对象
            const tempIssue = {
                id: issueId,
                name: issueFromTable.title,
                can_auto_fix: false, // 默认不支持自动修复
                fix_status: null
            };
            result = { message: '问题已在 issues 表中记录，需要进一步处理' };
        } else {
            return res.status(404).json({ success: false, error: '问题不存在' });
        }
        
        res.json({
            success: true,
            data: result,
            message: '修复任务已创建，正在执行中...'
        });
        
    } catch (err) {
        console.error('[IssueAPI] 自动修复失败:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/issues/:taskId/:issueId/fix-result - 更新修复结果
 * 支持从任务 issues 或独立 issues 表读取
 */
router.post('/:taskId/:issueId/fix-result', async (req, res) => {
    try {
        const { taskId, issueId } = req.params;
        const result = req.body;
        
        // 尝试从任务 issues 中查找
        const task = await readTaskById(taskId);
        let issue = (task.issues || []).find(i => i.id === issueId);
        
        // 如果在任务 issues 中找不到，尝试从独立 issues 表查找
        if (!issue) {
            issue = issuesDal.get(issueId);
        }
        
        if (!issue) {
            return res.status(404).json({ success: false, error: '问题不存在' });
        }
        
        // 更新独立 issues 表
        issuesDal.update(issueId, {
            solution: result.solution || null,
            resolved_at: new Date().toISOString()
        });
        
        res.json({
            success: true,
            data: result
        });
        
    } catch (err) {
        console.error('[IssueAPI] 更新修复结果失败:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/issues/:taskId/:issueId - 更新问题
 * 使用独立 issues 表（SQLite DAL）
 */
router.put('/:taskId/:issueId', async (req, res) => {
    try {
        const { taskId, issueId } = req.params;
        const updates = req.body;
        
        const task = await readTaskById(taskId);
        
        if (!task) {
            return res.status(404).json({ success: false, error: '任务不存在' });
        }
        
        // 尝试在任务 issues 中查找问题（兼容旧数据）
        let issue = (task.issues || []).find(i => i.id === issueId);
        
        // 如果在任务 issues 中找不到，尝试在独立 issues 表中查找
        if (!issue) {
            issue = issuesDal.get(issueId);
            // 如果在 issues 表中找到，转换格式
            if (issue) {
                issue = {
                    id: issue.id,
                    name: issue.title,
                    description: issue.description,
                    created_at: issue.created_at,
                    status: issue.status,
                    priority: issue.priority,
                    source_detail: issue.source || null,
                    metrics: null,
                    analysis_status: 'pending',
                    analysis_type: null,
                    analyzed_at: null,
                    analyzer: null,
                    root_cause: issue.root_cause,
                    solution: issue.solution,
                    can_auto_fix: false,
                    fix_status: null,
                    resolved_at: issue.resolved_at || null,
                    resolver: null,
                    discoverer: issue.reporter,
                    discoverer_type: null,
                    source: null
                };
            }
        }
        
        if (!issue) {
            return res.status(404).json({ success: false, error: '问题不存在' });
        }
        
        // 更新问题
        const updatedIssue = {
            ...issue,
            ...updates,
            id: issue.id,
            created_at: issue.created_at
        };
        
        if (updates.status === 'fixed' || updates.status === 'resolved') {
            updatedIssue.resolved_at = new Date().toISOString();
            updatedIssue.resolver = updates.resolver || 'manual';
            
            // ========== 问题完成时触发反思 ==========
            if (!updatedIssue.reflection) {
              console.log(`[IssueAPI] 🤔 问题 ${issueId} 已解决，触发反思机制`);
              updatedIssue.reflection = {
                triggered_at: new Date().toISOString(),
                status: 'pending',
                context: {
                  issue_title: updatedIssue.name || updatedIssue.title,
                  issue_status: updates.status,
                  resolved_at: updatedIssue.resolved_at,
                  task_id: taskId,
                  resolver: updatedIssue.resolver
                },
                reflection_data: null,
                improvements: [],
                evolution_trigger: null
              };
            }
        }
        
        // 更新任务 issues 字段
        if (task.issues) {
            const issueIndex = task.issues.findIndex(i => i.id === issueId);
            if (issueIndex !== -1) {
                task.issues[issueIndex] = updatedIssue;
                await saveTask(task);
            }
        }
        
        // 也更新独立 issues 表
        const issuesUpdates = {
            title: updatedIssue.name || updatedIssue.title,
            description: updatedIssue.description,
            status: updatedIssue.status,
            severity: updatedIssue.priority === 'high' ? 'high' : 'medium',
            priority: updatedIssue.priority,
            root_cause: updatedIssue.root_cause,
            solution: updatedIssue.solution,
            resolved_at: updatedIssue.resolved_at
        };
        issuesDal.update(issueId, issuesUpdates);
        
        res.json({ success: true, data: updatedIssue });
        
    } catch (err) {
        console.error('[IssueAPI] 更新问题失败:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/issues/:taskId - 获取任务的所有问题
 * 统一从 SQLite issues 表读取
 */
router.get('/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        
        const task = await readTaskById(taskId);
        
        if (!task) {
            return res.status(404).json({ success: false, error: '任务不存在' });
        }
        
        // 优先从独立 issues 表读取
        const issuesFromTable = issuesDal.list({ task_id: taskId });
        
        // 转换格式
        const issues = issuesFromTable.map(i => ({
            id: i.id,
            name: i.title,
            title: i.title,
            description: i.description,
            created_at: i.created_at,
            status: i.status,
            priority: i.priority,
            source: i.source || null,
            source_detail: null,
            metrics: null,
            analysis_status: 'pending',
            analysis_type: null,
            analyzed_at: null,
            analyzer: null,
            root_cause: i.root_cause,
            solution: i.solution,
            can_auto_fix: false,
            fix_status: null,
            resolved_at: i.resolved_at || null,
            resolver: null,
            discoverer: i.reporter,
            discoverer_type: null
        }));
        
        // 兼容：如果任务 issues 字段有数据且表中没有，添加这些问题
        if (task.issues && task.issues.length > 0) {
            const existingIds = new Set(issues.map(i => i.id));
            for (const taskIssue of task.issues) {
                if (!existingIds.has(taskIssue.id)) {
                    issues.push({
                        id: taskIssue.id,
                        name: taskIssue.name,
                        title: taskIssue.name,
                        description: taskIssue.description,
                        created_at: taskIssue.created_at,
                        status: taskIssue.status,
                        priority: taskIssue.priority,
                        source: taskIssue.source,
                        source_detail: taskIssue.source_detail,
                        metrics: taskIssue.metrics,
                        analysis_status: taskIssue.analysis_status,
                        analysis_type: taskIssue.analysis_type,
                        analyzed_at: taskIssue.analyzed_at,
                        analyzer: taskIssue.analyzer,
                        root_cause: taskIssue.root_cause,
                        solution: taskIssue.solution,
                        can_auto_fix: taskIssue.can_auto_fix,
                        fix_status: taskIssue.fix_status,
                        resolved_at: taskIssue.resolved_at,
                        resolver: taskIssue.resolver,
                        discoverer: taskIssue.discoverer,
                        discoverer_type: taskIssue.discoverer_type
                    });
                }
            }
        }
        
        res.json({ success: true, data: issues });
        
    } catch (err) {
        console.error('[IssueAPI] 获取问题失败:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
