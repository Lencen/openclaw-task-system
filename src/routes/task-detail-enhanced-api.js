/**
 * 任务详情增强 API
 * 提供 Planning、Tool Use、Multi-Agent、Reflection 的详细信息
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const TASKS_DIR = path.join(__dirname, '../data/tasks');
const PLANNING_DIR = path.join(__dirname, '../data/planning');
const EVOLUTION_DIR = path.join(__dirname, '../data/self-evolution');
const COLLABORATION_DIR = path.join(__dirname, '../data/collaboration');

// 确保目录存在
[COLLABORATION_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

/**
 * GET /api/tasks/:id/detail
 * 获取任务完整详情（包含所有关联信息）
 */
router.get('/:id/detail', (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. 读取任务数据
        const task = readTask(id);
        if (!task) {
            return res.status(404).json({
                code: 404,
                error: { type: 'NotFoundError', message: '任务不存在' }
            });
        }
        
        // 2. 获取关联的 Planning 信息
        const planning = getPlanningInfo(id);
        
        // 3. 获取工具调用记录
        const toolCalls = getToolCalls(task);
        
        // 4. 获取协作记录
        const collaboration = getCollaborationInfo(id);
        
        // 5. 获取关联的反思记录
        const reflections = getReflections(id);
        
        // 6. 构建完整详情
        const detail = {
            ...task,
            planning,
            toolCalls,
            collaboration,
            reflections,
            _enhanced: true
        };
        
        res.json({
            code: 200,
            data: detail
        });
    } catch (err) {
        console.error('[TaskDetailAPI] 获取任务详情失败:', err);
        res.status(500).json({
            code: 500,
            error: { type: 'InternalError', message: err.message }
        });
    }
});

/**
 * GET /api/tasks/:id/planning
 * 获取任务的 Planning 信息
 */
router.get('/:id/planning', (req, res) => {
    try {
        const { id } = req.params;
        const planning = getPlanningInfo(id);
        
        res.json({
            code: 200,
            data: planning
        });
    } catch (err) {
        res.status(500).json({
            code: 500,
            error: { type: 'InternalError', message: err.message }
        });
    }
});

/**
 * GET /api/tasks/:id/tool-calls
 * 获取任务的工具调用记录
 */
router.get('/:id/tool-calls', (req, res) => {
    try {
        const { id } = req.params;
        const task = readTask(id);
        const toolCalls = getToolCalls(task);
        
        res.json({
            code: 200,
            data: toolCalls
        });
    } catch (err) {
        res.status(500).json({
            code: 500,
            error: { type: 'InternalError', message: err.message }
        });
    }
});

/**
 * GET /api/tasks/:id/collaboration
 * 获取任务的协作记录
 */
router.get('/:id/collaboration', (req, res) => {
    try {
        const { id } = req.params;
        const collaboration = getCollaborationInfo(id);
        
        res.json({
            code: 200,
            data: collaboration
        });
    } catch (err) {
        res.status(500).json({
            code: 500,
            error: { type: 'InternalError', message: err.message }
        });
    }
});

/**
 * GET /api/tasks/:id/reflections
 * 获取任务关联的反思记录
 */
router.get('/:id/reflections', (req, res) => {
    try {
        const { id } = req.params;
        const reflections = getReflections(id);
        
        res.json({
            code: 200,
            data: reflections
        });
    } catch (err) {
        res.status(500).json({
            code: 500,
            error: { type: 'InternalError', message: err.message }
        });
    }
});

/**
 * POST /api/tasks/:id/collaboration
 * 记录 Agent 协作
 */
router.post('/:id/collaboration', (req, res) => {
    try {
        const { id } = req.params;
        const { fromAgent, toAgent, action, message, response } = req.body;
        
        const record = {
            id: `collab-${Date.now()}`,
            taskId: id,
            timestamp: new Date().toISOString(),
            fromAgent,
            toAgent,
            action,
            message,
            response
        };
        
        // 保存协作记录
        const collabFile = path.join(COLLABORATION_DIR, `${id}.json`);
        let records = [];
        
        if (fs.existsSync(collabFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(collabFile, 'utf8'));
                records = data.records || [];
            } catch (e) {
                records = [];
            }
        }
        
        records.push(record);
        fs.writeFileSync(collabFile, JSON.stringify({ taskId: id, records }, null, 2));
        
        res.json({
            code: 200,
            data: record,
            message: '协作记录已保存'
        });
    } catch (err) {
        res.status(500).json({
            code: 500,
            error: { type: 'InternalError', message: err.message }
        });
    }
});

// ============ 辅助函数 ============

function readTask(taskId) {
    const files = fs.readdirSync(TASKS_DIR);
    
    for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
            const content = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, file), 'utf8'));
            
            // 检查是否是单个任务文件
            if (content.id === taskId) {
                return content;
            }
            
            // 检查是否是批量任务文件
            if (Array.isArray(content)) {
                const task = content.find(t => t.id === taskId);
                if (task) return task;
            }
            
            // 检查 data 字段
            if (content.data && Array.isArray(content.data)) {
                const task = content.data.find(t => t.id === taskId);
                if (task) return task;
            }
        } catch (e) {
            // 忽略解析错误
        }
    }
    
    return null;
}

function getPlanningInfo(taskId) {
    const planFile = path.join(PLANNING_DIR, 'plans', `plan-${taskId}.json`);
    
    if (!fs.existsSync(planFile)) {
        return null;
    }
    
    try {
        const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
        
        // 读取版本历史
        const versionsFile = path.join(PLANNING_DIR, 'versions', `plan-${taskId}-versions.json`);
        let versions = [];
        
        if (fs.existsSync(versionsFile)) {
            versions = JSON.parse(fs.readFileSync(versionsFile, 'utf8'));
        }
        
        // 读取验证历史
        const validationHistory = readValidationHistory(taskId);
        
        return {
            plan,
            versions,
            validationHistory,
            stats: {
                totalSteps: plan.steps?.length || 0,
                completedSteps: plan.steps?.filter(s => s.status === 'completed').length || 0,
                currentStep: plan.currentStep || 0,
                estimatedTime: plan.estimatedTime || 0
            }
        };
    } catch (e) {
        return null;
    }
}

function readValidationHistory(taskId) {
    const historyFile = path.join(PLANNING_DIR, 'validation-history.jsonl');
    
    if (!fs.existsSync(historyFile)) {
        return [];
    }
    
    const lines = fs.readFileSync(historyFile, 'utf8').split('\n').filter(l => l.trim());
    const history = [];
    
    for (const line of lines.slice(-100)) {
        try {
            const entry = JSON.parse(line);
            if (entry.stepId && entry.stepId.includes(taskId)) {
                history.push(entry);
            }
        } catch (e) {
            // 忽略
        }
    }
    
    return history;
}

function getToolCalls(task) {
    const toolCalls = [];
    
    if (!task || !task.execution_log) {
        return { calls: [], stats: { total: 0, success: 0, failed: 0, byTool: {} } };
    }
    
    // 从执行日志中提取工具调用
    for (const log of task.execution_log) {
        if (log.tool || log.action === '工具调用') {
            toolCalls.push({
                id: log.id || `tool-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
                timestamp: log.timestamp,
                agentId: log.agentId,
                name: log.tool?.name || log.toolName || 'unknown',
                params: log.tool?.params || log.params || {},
                result: log.tool?.result || log.result || {},
                success: log.tool?.result?.success !== false,
                duration: log.tool?.duration || log.duration || 0
            });
        }
    }
    
    // 统计
    const stats = {
        total: toolCalls.length,
        success: toolCalls.filter(c => c.success).length,
        failed: toolCalls.filter(c => !c.success).length,
        byTool: {}
    };
    
    for (const call of toolCalls) {
        stats.byTool[call.name] = (stats.byTool[call.name] || 0) + 1;
    }
    
    return { calls: toolCalls, stats };
}

function getCollaborationInfo(taskId) {
    const collabFile = path.join(COLLABORATION_DIR, `${taskId}.json`);
    
    if (!fs.existsSync(collabFile)) {
        return { records: [], participants: [], timeline: [] };
    }
    
    try {
        const data = JSON.parse(fs.readFileSync(collabFile, 'utf8'));
        const records = data.records || [];
        
        // 提取参与者
        const participants = [...new Set(records.flatMap(r => [r.fromAgent, r.toAgent]))];
        
        // 构建时间线
        const timeline = records.map(r => ({
            time: r.timestamp,
            from: r.fromAgent,
            to: r.toAgent,
            action: r.action
        }));
        
        return { records, participants, timeline };
    } catch (e) {
        return { records: [], participants: [], timeline: [] };
    }
}

function getReflections(taskId) {
    const reflectionsDir = path.join(EVOLUTION_DIR, 'reflections');
    
    if (!fs.existsSync(reflectionsDir)) {
        return [];
    }
    
    const reflections = [];
    const files = fs.readdirSync(reflectionsDir);
    
    for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
            const reflection = JSON.parse(fs.readFileSync(path.join(reflectionsDir, file), 'utf8'));
            
            // 检查是否关联到此任务
            if (reflection.taskId === taskId || 
                (reflection.context && reflection.context.includes(taskId))) {
                reflections.push(reflection);
            }
        } catch (e) {
            // 忽略
        }
    }
    
    return reflections;
}

module.exports = router;