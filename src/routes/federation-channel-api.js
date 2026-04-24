/**
 * 联邦通信渠道 API
 * 管理联邦通信渠道的 Agent 配置和实例注册
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const pendingSpawnsDAL = require('../db/pending-spawns-dal');
const db = require('../db');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FEDERATION_FILE = path.join(DATA_DIR, 'federation-config.json');

// 🔧 Phase 2: 用户通知服务
const TASK_API = process.env.TASK_API || 'http://localhost:8081';
const BASE_URL = process.env.BASE_URL || 'http://localhost:8081';

/**
 * 发送任务通知（飞书/Discord/CLI）
 * @param {string} type - 通知类型：created/assigned/started/completed/failed
 * @param {object} data - 任务数据
 */
async function sendTaskNotification(type, data) {
  const { taskId, taskTitle, agentId, priority, error, result } = data;
  
  // 通知模板
  const templates = {
    created: `✅ 已创建任务：${taskTitle}\n优先级：${priority || 'P2'}\n状态：pending\n\n📋 查看详情：${BASE_URL}/pages/task-detail.html?id=${taskId}`,
    assigned: `✅ 已分配给 ${agentId} Agent\n任务：${taskTitle}\n\n📋 查看详情：${BASE_URL}/pages/task-detail.html?id=${taskId}`,
    started: `🚀 任务开始执行\n任务：${taskTitle}\n执行者：${agentId}\n\n📋 查看进度：${BASE_URL}/pages/task-timeline.html?id=${taskId}`,
    completed: `✅ 任务完成：${taskTitle}\n结果：${result || '成功'}\n执行者：${agentId}\n\n📋 查看详情：${BASE_URL}/pages/task-detail.html?id=${taskId}`,
    failed: `❌ 任务失败：${taskTitle}\n错误：${error || '未知错误'}\n执行者：${agentId}\n\n📋 查看详情：${BASE_URL}/pages/task-detail.html?id=${taskId}`
  };
  
  const message = templates[type] || `任务状态更新：${type}`;
  
  // 获取任务信息以确定通知渠道
  try {
    const task = await getTaskInfo(taskId);
    if (task && task.triggered_channel === 'feishu') {
      // 通过 OpenClaw message tool 发送飞书通知
      console.log(`[Notification] 发送飞书通知 [${type}]: ${taskTitle}`);
      // 实际发送由 agent-im-server 处理
    }
  } catch (err) {
    console.error(`[Notification] 发送通知失败:`, err.message);
  }
  
  // 同时记录日志
  console.log(`[Notification] [${type}] ${message.replace(/\n/g, ' | ')}`);
  return { success: true, type, message };
}

/**
 * 获取任务信息
 */
async function getTaskInfo(taskId) {
  try {
    const response = await fetch(`${TASK_API}/api/tasks/${taskId}`);
    if (response.ok) {
      const data = await response.json();
      return data.data || data;
    }
  } catch (err) {
    console.error(`[Notification] 获取任务信息失败:`, err.message);
  }
  return null;
}

// 默认配置
const DEFAULT_CONFIG = {
  channel: {
    id: 'federation',
    name: '联邦通信',
    icon: '🌐',
    type: 'Federation',
    status: 'online',
    description: 'OpenClaw 联邦通信网络，支持跨实例 Agent 协作'
  },
  localAgents: [
    { id: 'main', name: 'Main Agent', icon: '🎯', role: '总控', enabled: true, model: 'qwencoding/glm-5' },
    { id: 'coder', name: 'Coder Agent', icon: '💻', role: '编码', enabled: true, model: 'qwencoding/glm-5' },
    { id: 'deep', name: 'Deep Agent', icon: '🧠', role: '深度分析', enabled: true, model: 'qwencoding/glm-5' },
    { id: 'fast', name: 'Fast Agent', icon: '⚡', role: '快速响应', enabled: true, model: 'qwencoding/glm-5' },
    { id: 'chat', name: 'Chat Agent', icon: '💬', role: '对话', enabled: true, model: 'qwencoding/glm-5' },
    { id: 'test', name: 'Test Agent', icon: '🔍', role: '测试', enabled: false, model: 'qwencoding/glm-5' },
    { id: 'office', name: 'Office Agent', icon: '📊', role: '办公', enabled: true, model: 'qwencoding/glm-5' }
  ],
  remoteInstances: [],
  settings: {
    allowRemoteAccess: true,
    requireAuth: true,
    messageTimeout: 30000,
    maxConcurrentSessions: 10
  }
};

// 读取配置
function readConfig() {
  try {
    if (fs.existsSync(FEDERATION_FILE)) {
      return JSON.parse(fs.readFileSync(FEDERATION_FILE, 'utf8'));
    }
    // 创建默认配置
    fs.writeFileSync(FEDERATION_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  } catch (err) {
    console.error('[FEDERATION] 读取配置失败:', err);
    return DEFAULT_CONFIG;
  }
}

// 写入配置
function writeConfig(config) {
  try {
    fs.writeFileSync(FEDERATION_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.error('[FEDERATION] 写入配置失败:', err);
    return false;
  }
}

// GET /api/federation/status - 获取联邦通信状态
router.get('/status', (req, res) => {
  const config = readConfig();
  
  res.json({
    success: true,
    data: {
      channel: config.channel,
      localAgents: config.localAgents.filter(a => a.enabled),
      remoteInstances: config.remoteInstances,
      stats: {
        localAgents: config.localAgents.filter(a => a.enabled).length,
        remoteInstances: config.remoteInstances.length,
        totalAgents: config.localAgents.filter(a => a.enabled).length + 
                     config.remoteInstances.reduce((sum, i) => sum + (i.agents?.length || 0), 0)
      }
    }
  });
});

// GET /api/federation/channel - 获取渠道信息（供 channels.html 使用）
router.get('/channel', (req, res) => {
  const config = readConfig();
  
  res.json({
    success: true,
    channel: {
      id: config.channel.id,
      name: config.channel.name,
      icon: config.channel.icon,
      type: config.channel.type,
      status: config.channel.status,
      description: config.channel.description,
      accounts: ['default'],  // 本地实例
      connectionMode: 'websocket',
      defaultAgent: 'chat',
      dmPolicy: 'open',
      groupPolicy: 'open',
      requireMention: true,
      agents: config.localAgents.filter(a => a.enabled),
      remoteInstances: config.remoteInstances
    }
  });
});

// GET /api/federation/agents - 获取所有 Agent（本地 + 远程）
router.get('/agents', (req, res) => {
  const config = readConfig();
  
  const agents = [
    // 本地 Agent
    ...config.localAgents.map(a => ({
      ...a,
      instance: 'local',
      instanceName: '本机'
    })),
    // 远程 Agent
    ...config.remoteInstances.flatMap(instance => 
      (instance.agents || []).map(a => ({
        ...a,
        instance: instance.id,
        instanceName: instance.name
      }))
    )
  ];
  
  res.json({
    success: true,
    agents
  });
});

// PUT /api/federation/agents/:id - 更新 Agent 配置
router.put('/agents/:id', (req, res) => {
  const config = readConfig();
  const { id } = req.params;
  const updates = req.body;
  
  const agentIndex = config.localAgents.findIndex(a => a.id === id);
  if (agentIndex === -1) {
    return res.status(404).json({
      success: false,
      error: 'Agent 不存在'
    });
  }
  
  // 更新配置
  config.localAgents[agentIndex] = {
    ...config.localAgents[agentIndex],
    ...updates
  };
  
  writeConfig(config);
  
  res.json({
    success: true,
    agent: config.localAgents[agentIndex]
  });
});

// POST /api/federation/instances - 注册远程实例
router.post('/instances', (req, res) => {
  const config = readConfig();
  const { id, name, url, agents, token } = req.body;
  
  if (!id || !name || !url) {
    return res.status(400).json({
      success: false,
      error: '缺少必要字段'
    });
  }
  
  // 检查是否已存在
  const existingIndex = config.remoteInstances.findIndex(i => i.id === id);
  
  const instance = {
    id,
    name,
    url,
    agents: agents || [],
    registeredAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString(),
    status: 'online'
  };
  
  if (existingIndex >= 0) {
    config.remoteInstances[existingIndex] = instance;
  } else {
    config.remoteInstances.push(instance);
  }
  
  writeConfig(config);
  
  res.json({
    success: true,
    instance
  });
});

// DELETE /api/federation/instances/:id - 移除远程实例
router.delete('/instances/:id', (req, res) => {
  const config = readConfig();
  const { id } = req.params;
  
  config.remoteInstances = config.remoteInstances.filter(i => i.id !== id);
  writeConfig(config);
  
  res.json({
    success: true,
    message: '实例已移除'
  });
});

// PUT /api/federation/settings - 更新设置
router.put('/settings', (req, res) => {
  const config = readConfig();
  config.settings = {
    ...config.settings,
    ...req.body
  };
  writeConfig(config);
  
  res.json({
    success: true,
    settings: config.settings
  });
});

// POST /api/federation/spawn - 通过联邦通信启动子 Agent
// 🔧 教训130: 直接通知 Main Agent 去 spawn，不再返回假 sessionId
router.post('/spawn', async (req, res) => {
  const { agentId, task, mode, timeoutSeconds, priority, taskId } = req.body;
  
  if (!agentId || !task) {
    return res.status(400).json({ 
      success: false, 
      error: '缺少 agentId 或 task' 
    });
  }
  
  try {
    const actualTaskId = taskId || `task-${Date.now().toString(36)}`;
    const taskTitle = typeof task === 'string' ? task.slice(0, 50) : task.title;
    const taskDesc = typeof task === 'string' ? task : task.description;
    
    // 写入 pending_spawns
    const spawnRecord = {
      id: `spawn-${actualTaskId}-${Date.now()}`,
      taskId: actualTaskId,
      taskTitle: taskTitle,
      taskDescription: taskDesc,
      agentId: agentId,
      priority: priority || 'P2',
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    pendingSpawnsDAL.addRecord(spawnRecord);
    console.log(`[Federation] ✅ 已写入 pending_spawns: ${actualTaskId} -> ${agentId}`);
    
    // 🎯 方案 B：发送 task_assignment 消息给目标 agent，让它自己启动 subagent
    // 这样 subagent 数量就算目标 agent 的，而不是 main 的
    const AGENT_IM_URL = process.env.AGENT_IM_URL || 'http://localhost:18790';
    const targetSession = `agent:${agentId}`;
    
    console.log(`[Federation] 🎯 发送 task_assignment 消息给 ${targetSession}，让 coder 自己启动 subagent`);
    
    // 通过 agent-im-server 发送 task_assignment 消息给目标 agent
    const messageResponse = await fetch(`${AGENT_IM_URL}/api/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: targetSession,
        type: 'task_assignment',
        taskId: actualTaskId,
        targetAgent: agentId,
        task: {
          id: actualTaskId,
          title: taskTitle,
          description: taskDesc,
          priority: priority || 'P2',
          mode: mode || 'run',
          timeoutSeconds: timeoutSeconds || 3600
        },
        timestamp: Date.now()
      })
    });
    
    if (messageResponse.ok) {
      console.log(`[Federation] ✅ task_assignment 已发送给 ${targetSession}，等待 coder 自行启动 subagent`);
      pendingSpawnsDAL.updateRecordStatus(spawnRecord.id, 'assigned');
      
      // 🔧 修复：更新任务状态为 doing（当 subagent 启动时）
      try {
        // 尝试更新任务状态（taskId 可能是实际的 task ID）
        if (actualTaskId && actualTaskId.startsWith('task-')) {
          await db.tasks.update(actualTaskId, {
            status: 'doing',
            started_at: new Date().toISOString()
          });
          console.log(`[Federation] ✅ 任务 ${actualTaskId} 状态已更新为 doing`);
        }
      } catch (updateErr) {
        console.error(`[Federation] ⚠️ 更新任务状态失败:`, updateErr.message);
        // 不阻止主流程
      }
      
      res.json({
        success: true,
        sessionId: `pending:${actualTaskId}`,
        status: 'assigned',
        message: `已通知 ${agentId}，它将自行启动 subagent 执行任务（subagent 数量将算在 ${agentId} 上）`
      });
      return;
    } else {
      const errorText = await messageResponse.text();
      console.error(`[Federation] ❌ 发送消息失败:`, errorText);
      res.status(500).json({
        success: false,
        error: `无法发送任务消息: ${errorText}`
      });
    }
    
  } catch (err) {
    console.error('[Federation] 启动子 Agent 失败:', err);
    
    // 返回错误，而不是假响应
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// POST /api/federation/broadcast - 广播消息给所有 Agent
router.post('/broadcast', async (req, res) => {
  const { message, excludeAgents } = req.body;
  
  if (!message) {
    return res.status(400).json({ 
      success: false, 
      error: '缺少 message' 
    });
  }
  
  const config = readConfig();
  const agents = config.localAgents
    .filter(a => a.enabled && (!excludeAgents || !excludeAgents.includes(a.id)));
  
  const results = [];
  
  for (const agent of agents) {
    try {
      // 模拟发送消息给每个 Agent
      results.push({
        agentId: agent.id,
        success: true,
        message: `消息已发送给 ${agent.name}`
      });
    } catch (err) {
      results.push({
        agentId: agent.id,
        success: false,
        error: err.message
      });
    }
  }
  
  res.json({
    success: true,
    broadcast: results,
    totalSent: results.filter(r => r.success).length,
    totalFailed: results.filter(r => !r.success).length
  });
});

module.exports = router;