/**
 * 任务 API - SQLite 版本
 * 替代原有的 JSON 文件存储
 * 
 * v1.1 新增：任务去重机制
 */

const express = require('express');
const router = express.Router();
const { getDAL, ErrorCodes } = require('../db/data-access-layer');
const path = require('path');
const taskDedup = require('../lib/redis/task-dedup-manager');

const dal = getDAL(path.join(__dirname, '../data/tasks.db'));

// ==================== 任务 CRUD ====================

// 获取任务列表
router.get('/', (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.projectId) filter.project_id = req.query.projectId;
    if (req.query.project_id) filter.project_id = req.query.project_id;
    
    const tasks = dal.listTasks(filter);
    res.json({
      success: true,
      data: { tasks, total: tasks.length }
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message
    });
  }
});

// 获取单个任务
router.get('/:id', (req, res) => {
  try {
    const task = dal.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: '任务不存在'
      });
    }
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message
    });
  }
});

// 创建任务（带去重检查）
router.post('/', async (req, res) => {
  try {
    const task = {
      id: req.body.id || generateId(),
      ...req.body,
      created_at: req.body.created_at || new Date().toISOString(),
    };
    
    // ========== 去重检查 ==========
    const dedupResult = await taskDedup.deduplicateTask(task, 60 * 60); // 1 小时窗口
    
    if (dedupResult.isDuplicate) {
      console.log(`[TASKS-API] ⚠️ 任务已存在（去重）：${task.title}`);
      
      // 返回已存在任务信息
      const existingTask = dal.listTasks().find(t => 
        t.message_hash === dedupResult.signature ||
        t.id === (req.body.id || '')
      );
      
      return res.json({
        success: true,
        alreadyExists: true,
        id: existingTask ? existingTask.id : dedupResult.key,
        task: existingTask || task,
        message: dedupResult.message || '任务已存在'
      });
    }
    
    // 检查相似任务（提示用户）
    if (dedupResult.similarTasks && dedupResult.similarTasks.length > 0) {
      console.log(`[TASKS-API] ⚠️ 发现 ${dedupResult.similarTasks.length} 个相似任务`);
      
      // 可以选择自动拒绝或提示用户
      // 这里选择提示用户
      console.log(`[TASKS-API] 提示用户：${dedupResult.message}`);
    }
    
    dal.createTask(task);
    
    res.status(201).json({
      success: true,
      data: { id: task.id },
      message: '任务创建成功'
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message
    });
  }
});

// 更新任务
router.put('/:id', (req, res) => {
  try {
    const options = {
      skipAudit: false,
      agentId: req.body.agentId || req.headers['x-agent-id'] || 'api',
      reason: req.body.reason || req.body.status_change_reason || null
    };
    const result = dal.updateTask(req.params.id, req.body, options);
    res.json({
      success: true,
      changes: result.changes
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message
    });
  }
});

// 删除任务
router.delete('/:id', (req, res) => {
  try {
    const result = dal.deleteTask(req.params.id);
    res.json({
      success: true,
      changes: result.changes
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message
    });
  }
});

// 统计
router.get('/stats/summary', (req, res) => {
  try {
    const all = dal.listTasks();
    const stats = {
      total: all.length,
      pending: all.filter(t => t.status === 'pending').length,
      doing: all.filter(t => t.status === 'doing').length,
      completed: all.filter(t => t.status === 'completed').length,
      failed: all.filter(t => t.status === 'failed').length,
    };
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function generateId() {
  return 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 10);
}

module.exports = router;
