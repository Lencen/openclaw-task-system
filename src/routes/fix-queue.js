/**
 * Fix Queue API - 问题修复队列管理 (简化版)
 * 
 * 功能：
 * 1. 修复队列 CRUD
 * 2. 修复任务状态管理
 * 3. 修复结果记录
 * 
 * @version 1.0.0
 * @created 2026-03-30
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const FIX_QUEUE_FILE = path.join(__dirname, '..', 'data', 'fix-queue.json');
const DB_FILE = path.join(__dirname, '..', 'data', 'tasks.db');

// ==================== 工具函数 ====================

// 读取修复队列（优先从 SQLite 读取）
function readFixQueue() {
  // 优先从 SQLite 读取
  try {
    const dal = require('../db/fix-queue-dal').getFixQueueDAL(DB_FILE);
    const list = dal.list();
    if (list && list.length > 0) {
      return list.map(item => ({
        id: item.id,
        issueId: item.issue_id,
        taskId: item.task_id,
        issueTitle: item.title,
        agentId: item.agent_id,
        status: item.status,
        severity: item.priority,
        type: item.type,
        prompt: item.description,
        result: item.result,
        error: item.error,
        created_at: item.created_at,
        started_at: item.started_at,
        completed_at: item.completed_at,
        failed_at: item.failed_at
      }));
    }
  } catch (e) {
    console.error('[FixQueue] SQLite 读取失败，回退到 JSON:', e.message);
  }
  
  // 回退到 JSON 文件
  try {
    if (fs.existsSync(FIX_QUEUE_FILE)) {
      const content = fs.readFileSync(FIX_QUEUE_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('[FixQueue] JSON 读取失败:', e.message);
  }
  return [];
}

// 写入修复队列（同时写入 SQLite 和 JSON）
function writeFixQueue(queue) {
  try {
    // 1. 写入 JSON 文件
    fs.writeFileSync(FIX_QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf-8');
    
    // 2. 同步到 SQLite
    try {
      const dal = require('../db/fix-queue-dal').getFixQueueDAL(DB_FILE);
      queue.forEach(item => {
        try {
          const existing = dal.get(item.id);
          if (existing) {
            dal.update(item.id, {
              status: item.status,
              task_id: item.taskId,
              result: item.result,
              error: item.error,
              updated_at: new Date().toISOString()
            });
          } else {
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
          }
        } catch (e) {
          console.error('[FixQueue] SQLite 同步失败:', e.message);
        }
      });
    } catch (e) {
      console.error('[FixQueue] SQLite 同步失败:', e.message);
    }
    
    return true;
  } catch (e) {
    console.error('[FixQueue] 写入数据失败:', e);
    return false;
  }
}

// ==================== 队列管理路由 ====================

// 获取修复队列状态
router.get('/status', (req, res) => {
  const queue = readFixQueue();
  
  res.json({
    success: true,
    queue: {
      total: queue.length,
      pending: queue.filter(i => i.status === 'pending').length,
      running: queue.filter(i => i.status === 'running').length,
      completed: queue.filter(i => i.status === 'completed').length,
      failed: queue.filter(i => i.status === 'failed').length
    },
    items: queue
  });
});

// 获取修复队列列表
router.get('/list', (req, res) => {
  const queue = readFixQueue();
  const { status } = req.query;
  
  let filtered = queue;
  if (status) {
    filtered = queue.filter(i => i.status === status);
  }
  
  res.json({
    success: true,
    queue: filtered,
    stats: {
      total: queue.length,
      pending: queue.filter(i => i.status === 'pending').length,
      running: queue.filter(i => i.status === 'running').length,
      completed: queue.filter(i => i.status === 'completed').length,
      failed: queue.filter(i => i.status === 'failed').length
    }
  });
});

// ==================== 单个任务管理路由 ====================

// 标记修复完成（供 Subagent 调用）
router.post('/:id/complete', (req, res) => {
  const queue = readFixQueue();
  const index = queue.findIndex(i => i.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  
  const { result, reflection } = req.body;
  
  // 更新状态为完成
  queue[index].status = 'completed';
  queue[index].completed_at = new Date().toISOString();
  queue[index].result = result;
  queue[index].reflection = reflection;
  
  writeFixQueue(queue);
  
  // 更新问题状态
  const ISSUES_FILE = path.join(__dirname, '..', 'data', 'issues.json');
  if (fs.existsSync(ISSUES_FILE)) {
    const issuesData = JSON.parse(fs.readFileSync(ISSUES_FILE, 'utf-8'));
    const issue = issuesData.issues.find(i => i.id === queue[index].issueId);
    if (issue) {
      issue.status = 'resolved';
      issue.resolved_at = new Date().toISOString();
      issue.resolution = result;
      fs.writeFileSync(ISSUES_FILE, JSON.stringify(issuesData, null, 2), 'utf-8');
    }
  }
  
  res.json({ 
    success: true, 
    message: '修复已完成',
    shouldReflect: true,
    issueTitle: queue[index].issueTitle,
    result: result
  });
});

// 标记修复失败
router.post('/:id/fail', (req, res) => {
  const queue = readFixQueue();
  const index = queue.findIndex(i => i.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  
  const { error } = req.body;
  
  queue[index].status = 'failed';
  queue[index].failed_at = new Date().toISOString();
  queue[index].error = error;
  
  writeFixQueue(queue);
  
  res.json({ success: true, message: '已记录失败原因' });
});

// 获取单个修复任务
router.get('/:id', (req, res) => {
  const queue = readFixQueue();
  const task = queue.find(i => i.id === req.params.id);
  
  if (task) {
    res.json({ success: true, task });
  } else {
    res.status(404).json({ success: false, error: '任务不存在' });
  }
});

// 删除/取消修复任务
router.delete('/:id', (req, res) => {
  const queue = readFixQueue();
  const index = queue.findIndex(i => i.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  
  if (queue[index].status !== 'pending') {
    return res.status(400).json({ success: false, error: '只能取消待处理的任务' });
  }
  
  queue.splice(index, 1);
  writeFixQueue(queue);
  
  res.json({ success: true, message: '已取消修复任务' });
});

module.exports = router;
