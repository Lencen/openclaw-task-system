/**
 * 两级队列 API 路由
 * 提供全局池和 Agent 队列的 REST API
 * 
 * 修改记录：
 * - 2026-03-27: 将 JSON 文件读写改为使用 DAL (db.tasks.list)
 */

const express = require('express');
const router = express.Router();

// 使用 DAL 层访问数据库
const db = require('../db');

/**
 * 获取全局池状态
 * GET /api/global-pool
 */
router.get('/global-pool', (req, res) => {
  try {
    const tasks = db.tasks.list();
    const pendingTasks = tasks.filter(task => task.status === 'pending');
    
    res.json({
      success: true,
      data: {
        total: pendingTasks.length,
        tasks: pendingTasks.map(task => ({
          id: task.id,
          title: task.title,
          priority: task.priority || 'P3',
          createdAt: task.created_at || task.createdAt,
          agentId: task.agentId || null
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取 Agent 队列状态
 * GET /api/agent-queue/:agentId
 */
router.get('/agent-queue/:agentId', (req, res) => {
  try {
    const { agentId } = req.params;
    const tasks = db.tasks.list();
    
    // 过滤出分配给该Agent的任务
    const agentTasks = tasks.filter(task => 
      task.agentId === agentId && 
      (task.status === 'doing' || task.status === 'pending')
    );
    
    // 执行中的任务
    const doingTasks = agentTasks.filter(task => task.status === 'doing');
    // 排队中的任务
    const pendingTasks = agentTasks.filter(task => task.status === 'pending');
    
    res.json({
      success: true,
      data: {
        agentId: agentId,
        doing: {
          total: doingTasks.length,
          tasks: doingTasks.map(task => ({
            id: task.id,
            title: task.title,
            priority: task.priority || 'P3',
            startedAt: task.started_at,
            progress: Math.round((task.completed_steps || 0) / (task.total_steps || 1) * 100)
          }))
        },
        pending: {
          total: pendingTasks.length,
          tasks: pendingTasks.map(task => ({
            id: task.id,
            title: task.title,
            priority: task.priority || 'P3',
            createdAt: task.created_at
          }))
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取所有队列状态
 * GET /api/queues
 */
router.get('/', (req, res) => {
  try {
    const tasks = db.tasks.list();
    
    // 获取全局池
    const pendingTasks = tasks.filter(task => task.status === 'pending');
    const globalPool = {
      total: pendingTasks.length,
      tasks: pendingTasks.map(task => ({
        id: task.id,
        title: task.title,
        priority: task.priority || 'P3',
        createdAt: task.created_at || task.createdAt,
        agentId: task.agentId || null
      }))
    };
    
    // 获取所有Agent ID
    const agentIds = new Set();
    tasks.forEach(task => {
      if (task.agentId) {
        agentIds.add(task.agentId);
      }
    });
    
    // 添加默认Agent列表
    const defaultAgents = ['agent-main', 'agent-coder', 'agent-deep', 'agent-fast', 'agent-chat', 'agent-test', 'agent-office'];
    defaultAgents.forEach(id => agentIds.add(id));
    
    // 获取每个Agent的队列状态
    const agentQueues = {};
    agentIds.forEach(agentId => {
      const agentTasks = tasks.filter(task => 
        task.agentId === agentId && 
        (task.status === 'doing' || task.status === 'pending')
      );
      
      const doingTasks = agentTasks.filter(task => task.status === 'doing');
      const pendingTasks2 = agentTasks.filter(task => task.status === 'pending');
      
      agentQueues[agentId] = {
        agentId: agentId,
        doing: {
          total: doingTasks.length,
          tasks: doingTasks.map(task => ({
            id: task.id,
            title: task.title,
            priority: task.priority || 'P3',
            startedAt: task.started_at,
            progress: Math.round((task.completed_steps || 0) / (task.total_steps || 1) * 100)
          }))
        },
        pending: {
          total: pendingTasks2.length,
          tasks: pendingTasks2.map(task => ({
            id: task.id,
            title: task.title,
            priority: task.priority || 'P3',
            createdAt: task.created_at
          }))
        }
      };
    });
    
    res.json({
      success: true,
      data: {
        globalPool,
        agentQueues
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;