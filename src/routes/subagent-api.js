/**
 * Subagent 启动 API
 * 
 * 允许任何 Agent 通过 API 启动 Subagent 执行任务
 * 
 * POST /api/subagent/spawn - 启动 Subagent
 * GET  /api/subagent/list - 列出当前 Subagent
 * POST /api/subagent/kill - 终止 Subagent
 */

const express = require('express');
const router = express.Router();
const http = require('http');

/**
 * POST /api/subagent/spawn
 * 启动 Subagent 执行任务
 * 
 * Body:
 * - task: 任务描述
 * - agentId: Agent 类型 (coder, deep, fast, chat, test, office)
 * - mode: run | session
 * - timeoutSeconds: 超时时间
 * - parentAgent: 调用者 Agent ID
 * - taskId: 关联的任务 ID
 */
router.post('/spawn', async (req, res) => {
  try {
    const { task, agentId = 'coder', mode = 'run', timeoutSeconds = 600, parentAgent, taskId } = req.body;
    
    if (!task) {
      return res.status(400).json({ success: false, error: '任务描述不能为空' });
    }
    
    console.log(`[Subagent] ${parentAgent || 'unknown'} 请求启动 ${agentId} Subagent`);
    console.log(`[Subagent] 任务: ${task.substring(0, 100)}...`);
    
    // 调用 OpenClaw Gateway 的 sessions_spawn API
    const spawnResult = await callOpenClawSessionsSpawn({
      task,
      agentId,
      mode,
      timeoutSeconds,
      context: {
        parentAgent,
        taskId,
        spawnedAt: new Date().toISOString()
      }
    });
    
    if (spawnResult.success) {
      // 更新任务状态（如果有 taskId）
      if (taskId) {
        try {
          const db = require('../db');
          db.tasks.update(taskId, {
            assigned_agent: agentId,
            status: 'doing',
            started_at: new Date().toISOString()
          });
          console.log(`[Subagent] 任务 ${taskId} 状态更新为 doing`);
        } catch (e) {
          console.error('[Subagent] 更新任务状态失败:', e.message);
        }
      }
      
      res.json({
        success: true,
        sessionId: spawnResult.sessionId,
        agentId,
        message: `Subagent ${agentId} 已启动`
      });
    } else {
      res.status(500).json({
        success: false,
        error: spawnResult.error || '启动 Subagent 失败'
      });
    }
  } catch (err) {
    console.error('[Subagent] 启动失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/subagent/list
 * 列出当前运行的 Subagent
 */
router.get('/list', async (req, res) => {
  try {
    const result = await callOpenClawAPI('/api/sessions');
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Subagent] 获取列表失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/subagent/kill
 * 终止 Subagent
 */
router.post('/kill', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId 不能为空' });
    }
    
    // 调用 OpenClaw API 终止 session
    const result = await callOpenClawAPI(`/api/sessions/${sessionId}/kill`, 'POST');
    
    res.json({ success: true, result });
  } catch (err) {
    console.error('[Subagent] 终止失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 调用 OpenClaw Gateway sessions_spawn
 */
async function callOpenClawSessionsSpawn(options) {
  return new Promise((resolve, reject) => {
    // 使用 /api/tasks/assign-and-spawn API
    const postData = JSON.stringify({
      taskId: options.taskId || `task-${Date.now()}`,
      agentId: options.agentId,
      taskTitle: options.task?.title || 'Subagent Task',
      taskDescription: options.task?.description || options.task
    });
    
    const req = http.request({
      hostname: 'localhost',
      port: 8081,
      path: '/api/tasks/assign-and-spawn',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    
    req.write(postData);
    req.end();
  });
}

/**
 * 调用 OpenClaw API
 */
async function callOpenClawAPI(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 8081,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

console.log('✅ Subagent API 已加载');

module.exports = router;