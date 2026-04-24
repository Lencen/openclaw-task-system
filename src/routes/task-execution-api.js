/**
 * TaskExecutionAPI Express Router
 * 
 * RESTful API 端点实现
 * 
 * 2026-03-27: 迁移到 SQLite，使用 DAL
 */

const express = require('express');
const router = express.Router();
const path = require('path');

const executionAPI = require('./task-execution-api');
const db = require('../db');

const DATA_DIR = path.join(__dirname, '../data');

/**
 * 创建任务
 */
router.post('/tasks/execute', (req, res) => {
  const { taskId, agentId, agentName = 'Unknown', context = {} } = req.body;
  
  if (!taskId || !agentId) {
    return res.status(400).json({
      code: 400,
      error: {
        type: 'ValidationError',
        message: '缺少必填字段: taskId, agentId'
      }
    });
  }
  
  const result = executionAPI.startExecution(taskId, agentId, agentName, context);
  res.json(result);
});

/**
 * 报告步骤执行结果
 */
router.post('/tasks/execute/step', (req, res) => {
  const { executionId, stepIndex, status, output = {}, metrics = {} } = req.body;
  
  if (!executionId || stepIndex === undefined || !status) {
    return res.status(400).json({
      code: 400,
      error: {
        type: 'ValidationError',
        message: '缺少必填字段: executionId, stepIndex, status'
      }
    });
  }
  
  const result = executionAPI.reportStepResult(executionId, stepIndex, status, output, metrics);
  res.json(result);
});

/**
 * 完成任务
 */
router.post('/tasks/execute/complete', (req, res) => {
  const { executionId, status = 'completed', output = {} } = req.body;
  
  if (!executionId) {
    return res.status(400).json({
      code: 400,
      error: {
        type: 'ValidationError',
        message: '缺少必填字段: executionId'
      }
    });
  }
  
  const result = executionAPI.completeTask(executionId, status, output);
  res.json(result);
});

/**
 * 报告错误
 */
router.post('/tasks/execute/error', (req, res) => {
  const { executionId, error, retryCount = 0 } = req.body;
  
  if (!executionId || !error) {
    return res.status(400).json({
      code: 400,
      error: {
        type: 'ValidationError',
        message: '缺少必填字段: executionId, error'
      }
    });
  }
  
  const result = executionAPI.reportError(executionId, error, retryCount);
  res.json(result);
});

/**
 * 获取任务列表 - 使用 SQLite DAL
 */
router.get('/', (req, res) => {
  try {
    let tasks = db.tasks.list();
    
    const showCompleted = req.query.showCompleted === 'true';
    const showDeleted = req.query.showDeleted === 'true';
    
    // 默认过滤掉 deleted 和 cancelled 状态
    if (!showDeleted) {
      tasks = tasks.filter(t => t.status !== 'deleted' && t.status !== 'cancelled');
    }
    
    // 根据 showCompleted 参数过滤
    if (!showCompleted) {
      tasks = tasks.filter(t => t.status !== 'completed');
    }
    
    res.json({
      code: 200,
      data: {
        tasks,
        total: tasks.length
      }
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      error: {
        type: 'SystemError',
        message: error.message
      }
    });
  }
});

/**
 * 获取任务状态
 */
router.get('/tasks/:id', (req, res) => {
  const { id: taskId } = req.params;
  
  try {
    const task = db.tasks.get(taskId);
    
    if (!task) {
      return res.status(404).json({
        code: 404,
        error: {
          type: 'NotFoundError',
          message: '任务不存在'
        }
      });
    }
    
    res.json({
      code: 200,
      data: task
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      error: {
        type: 'SystemError',
        message: error.message
      }
    });
  }
});

/**
 * 获取任务执行历史
 */
router.get('/tasks/:id/execution', (req, res) => {
  const { id: taskId } = req.params;
  
  const executions = executionAPI.getTaskExecutions(taskId);
  
  res.json({
    code: 200,
    data: {
      taskId,
      executions
    }
  });
});

/**
 * 验证任务数据
 */
router.post('/tasks/validate', (req, res) => {
  const { data, type = 'create' } = req.body;
  
  const validation = executionAPI.validateTaskData(data, type);
  
  res.json({
    code: 200,
    data: validation
  });
});

/**
 * 获取所有执行日志
 */
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = db.executionLogs.latest(limit);
    
    res.json({
      code: 200,
      data: {
        logs,
        total: logs.length
      }
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      error: {
        type: 'SystemError',
        message: error.message
      }
    });
  }
});

/**
 * 获取执行记录详情
 */
router.get('/executions/:id', (req, res) => {
  const { id: executionId } = req.params;
  
  const execution = executionAPI.getExecution(executionId);
  
  if (!execution) {
    return res.status(404).json({
      code: 404,
      error: {
        type: 'NotFoundError',
        message: '执行记录不存在'
      }
    });
  }
  
  res.json({
    code: 200,
    data: execution
  });
});

/**
 * 重试任务
 */
router.post('/tasks/:id/retry', (req, res) => {
  const { id: taskId } = req.params;
  
  try {
    // 使用 SQLite DAL
    const task = db.tasks.get(taskId);
    
    if (!task) {
      return res.status(404).json({
        code: 404,
        error: {
          type: 'NotFoundError',
          message: '任务不存在'
        }
      });
    }
    
    // 重置任务状态
    const previousStatus = task.status;
    
    console.log(`[STATUS-TRACKER] task-execution-api 重置 | Task: ${taskId} | ${previousStatus} → pending | Source: task-execution-api | Stack: ${new Error().stack.split('\n').slice(2, 4).join(' → ')}`);
    
    // 更新到 SQLite
    db.tasks.update(taskId, {
      status: 'pending',
      assigned_agent: null,
      _status_change_source: JSON.stringify({
        source: 'task-execution-api',
        type: 'reset',
        timestamp: new Date().toISOString(),
        stack: new Error().stack
      })
    });
    
    res.json({
      code: 200,
      data: {
        taskId,
        previousStatus,
        newStatus: 'pending'
      }
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      error: {
        type: 'SystemError',
        message: error.message
      }
    });
  }
});

/**
 * 获取所有任务列表
 */
router.get('/tasks', (req, res) => {
  try {
    // 从 SQLite 获取所有任务
    const tasks = db.tasks.list();
    
    // 获取查询参数
    const showCompleted = req.query.showCompleted === 'true' || req.query.showCompleted === '1';
    const assignedAgent = req.query.assignedAgent;
    const projectId = req.query.projectId;
    
    // 过滤任务
    let filteredTasks = tasks;
    
    // 根据是否显示已完成任务进行过滤
    if (!showCompleted) {
      filteredTasks = filteredTasks.filter(task => task.status !== 'completed');
    }
    
    // 根据分配的代理进行过滤（支持 both 下划线和驼峰命名）
    if (assignedAgent) {
      filteredTasks = filteredTasks.filter(task => 
        (task.assigned_agent || task.assignedAgent) && 
        (task.assigned_agent || task.assignedAgent).toLowerCase().includes(assignedAgent.toLowerCase())
      );
    }
    
    // 根据项目ID进行过滤
    if (projectId) {
      filteredTasks = filteredTasks.filter(task => 
        task.project_id === projectId
      );
    }
    
    res.json({
      code: 200,
      data: {
        tasks: filteredTasks,
        total: filteredTasks.length,
        showCompleted: showCompleted,
        filters: {
          assignedAgent: assignedAgent || null,
          projectId: projectId || null
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      error: {
        type: 'SystemError',
        message: error.message
      }
    });
  }
});

/**
 * 取消任务
 */
router.post('/tasks/:id/cancel', (req, res) => {
  const { id: taskId } = req.params;
  
  try {
    // 使用 SQLite DAL
    const task = db.tasks.get(taskId);
    
    if (!task) {
      return res.status(404).json({
        code: 404,
        error: {
          type: 'NotFoundError',
          message: '任务不存在'
        }
      });
    }
    
    // 更新到 SQLite
    db.tasks.update(taskId, {
      status: 'cancelled',
      completed_at: new Date().toISOString()
    });
    
    res.json({
      code: 200,
      data: {
        taskId,
        status: 'cancelled'
      }
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      error: {
        type: 'SystemError',
        message: error.message
      }
    });
  }
});

/**
 * 处理待分配任务
 * 
 * GET /api/tasks/process-pending-assignments
 * 
 * 功能：
 * 1. 读取 pending-assignments.jsonl 文件
 * 2. 返回待分配任务列表
 * 3. 可选：清除已处理的记录（clear=true）
 */
router.get('/process-pending-assignments', (req, res) => {
  try {
    // 使用 pendingAssignments DAL
    const assignments = db.pendingAssignments.listByStatus('pending');
    
    const response = {
      success: true,
      data: {
        assignments,
        total: assignments.length,
        message: assignments.length > 0 
          ? `发现 ${assignments.length} 个待分配任务` 
          : '没有待分配任务'
      }
    };
    
    // 如果请求清除已处理记录
    if (req.query.clear === 'true' && assignments.length > 0) {
      db.pendingAssignments.clear('pending');
      response.data.message = `已清除 ${assignments.length} 个待分配任务`;
    }
    
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 标记待分配任务为已处理
 * 
 * POST /api/tasks/mark-assignment-processed
 * 
 * 参数：
 * - assignmentId: 分配记录 ID
 * - taskId: 任务 ID（可选，用于验证）
 */
router.post('/mark-assignment-processed', (req, res) => {
  const { assignmentId, taskId } = req.body;
  
  if (!assignmentId) {
    return res.status(400).json({
      success: false,
      error: '缺少 assignmentId'
    });
  }
  
  try {
    // 使用 pendingAssignments DAL
    const record = db.pendingAssignments.listByStatus(null).find(r => r.id === assignmentId);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: '找不到指定的分配记录'
      });
    }
    
    // 更新记录状态
    db.pendingAssignments.updateStatus(assignmentId, 'processed');
    
    // 同时更新任务状态（使用 SQLite）
    if (taskId) {
      db.tasks.update(taskId, {
        status: 'doing',
        started_at: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      message: '分配记录已标记为已处理'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * API 说明 - 已禁用，避免覆盖 /api/tasks 真实任务列表
 * 如需查看 API 说明，请访问 /api/tasks/info
 */
// router.get('/info', (req, res) => {
//   res.json({ name: 'TaskExecutionAPI', version: '1.0' });
// });

module.exports = router;
