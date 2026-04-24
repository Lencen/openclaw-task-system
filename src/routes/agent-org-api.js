/**
 * Agent 组织架构 API
 * 提供组织结构数据和位置保存功能
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');
    console.log("[agent-org-api] db loaded, tasks:", db.tasks.list().filter(t => t.assigned_agent).length);

const DATA_DIR = path.join(__dirname, '..', 'data');
const ORG_FILE = path.join(DATA_DIR, 'agent-organization.json');

// 引入 agent-heartbeat 模块获取实时状态
let agentHeartbeat;
try {
  agentHeartbeat = require('../../scripts/agent-heartbeat');
} catch (e) {
  console.warn('[agent-org-api] 无法加载 agent-heartbeat 模块:', e.message);
}

/**
 * 读取任务数据（用于查找任务标题）
 */
function readTasksData() {
  try {
    const tasks = db.tasks.list();
    return tasks || [];
  } catch (error) {
    console.error('[agent-org-api] 读取任务数据失败:', error.message);
    return [];
  }
}

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 默认组织结构 - 树形层级
// main (总控)
// ├── chat (对话)
// ├── fast (快速响应)
// ├── deep (深度分析)
// ├── office (办公) → office-1
// ├── coder (编码) → coder-1, coder-2
// └── test (测试)
const DEFAULT_ORG = {
  agents: [
    // L1: 总控
    {
      id: 'main',
      name: 'Main',
      status: 'idle',
      position: { x: 400, y: 60 },
      allowAgents: ['chat', 'fast', 'deep', 'office', 'coder', 'test'],
      model: { primary: 'qwencoding/glm-5' },
      level: 1,
      role: '总控'
    },
    // L2: 专家/独立
    {
      id: 'chat',
      name: 'Chat',
      status: 'idle',
      position: { x: 80, y: 200 },
      allowAgents: [],
      model: { primary: 'uos/GLM-4.7' },
      level: 2,
      role: '对话'
    },
    {
      id: 'fast',
      name: 'Fast',
      status: 'idle',
      position: { x: 200, y: 200 },
      allowAgents: [],
      model: { primary: 'qwencoding/kimi-k2.5' },
      level: 2,
      role: '快速响应'
    },
    {
      id: 'deep',
      name: 'Deep',
      status: 'idle',
      position: { x: 400, y: 200 },
      allowAgents: [],
      model: { primary: 'nvidia-2/deepseek-ai/deepseek-v3.2' },
      level: 2,
      role: '深度分析'
    },
    {
      id: 'test',
      name: 'Test',
      status: 'idle',
      position: { x: 720, y: 200 },
      allowAgents: [],
      model: { primary: 'qwencoding/MiniMax-M2.5' },
      level: 2,
      role: '测试'
    },
    // L2 专家 + L3 助手
    {
      id: 'office',
      name: 'Office',
      status: 'idle',
      position: { x: 540, y: 200 },
      allowAgents: ['office-1'],
      model: { primary: 'qwencoding/MiniMax-M2.5' },
      level: 2,
      role: '办公'
    },
    {
      id: 'office-1',
      name: 'Office-1',
      status: 'idle',
      position: { x: 540, y: 340 },
      allowAgents: [],
      model: { primary: 'nvidia-1/qwen/qwen3.5-397b-a17b' },
      level: 3,
      role: '办公助手'
    },
    {
      id: 'coder',
      name: 'Coder',
      status: 'idle',
      position: { x: 860, y: 200 },
      allowAgents: ['coder-1', 'coder-2'],
      model: { primary: 'qwencoding/qwen3-coder-next' },
      level: 2,
      role: '编码'
    },
    {
      id: 'coder-1',
      name: 'Coder-1',
      status: 'idle',
      position: { x: 800, y: 340 },
      allowAgents: [],
      model: { primary: 'qwencoding/qwen3-coder-plus' },
      level: 3,
      role: '编码助手'
    },
    {
      id: 'coder-2',
      name: 'Coder-2',
      status: 'idle',
      position: { x: 940, y: 340 },
      allowAgents: [],
      model: { primary: 'qwencoding/qwen3-coder-next' },
      level: 3,
      role: '编码助手'
    }
  ]
};

/**
 * 读取组织数据
 */
function readOrgData() {
  try {
    if (fs.existsSync(ORG_FILE)) {
      const data = fs.readFileSync(ORG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('读取组织数据失败:', error);
  }
  return DEFAULT_ORG;
}

/**
 * 保存组织数据
 */
function saveOrgData(data) {
  try {
    fs.writeFileSync(ORG_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('保存组织数据失败:', error);
    return false;
  }
}

/**
 * GET /api/agents/status
 * 获取所有 Agent 状态和组织结构
 * 
 * 返回格式：
 * {
 *   success: true,
 *   agents: [
 *     {
 *       id: "agent-main",
 *       name: "Main Agent",
 *       status: "idle",
 *       model: "...",
 *       lastHeartbeat: "2026-03-27T..."
 *       ...
 *     }
 *   ]
 * }
 */
router.get('/status', (req, res) => {
  console.log('[agent-org-api] GET /status called');
  try {
    // 直接从 agent-heartbeat 获取 Agent 状态
    const heartbeatStatus = agentHeartbeat ? agentHeartbeat.getAgentsStatus() : [];
    console.log('[agent-org-api] heartbeatStatus count:', heartbeatStatus.length);
    
    // 从数据库获取已分配的任务，填充 currentTask
    let agentTasks = {};
    try {
      const db = require('../db');
      const allTasks = db.tasks.list();
      console.log('[agent-org-api] allTasks count:', allTasks.length, 'with assigned_agent:', allTasks.filter(t => t.assigned_agent).length);
      
      allTasks.forEach(task => {
        if (task.assigned_agent && task.status !== 'completed') {
          const agentId = task.assigned_agent;
          // 支持两种格式: "test" 和 "agent-test"
          const normalizedId = agentId.startsWith('agent-') ? agentId : `agent-${agentId}`;
          if (!agentTasks[normalizedId]) {
            agentTasks[normalizedId] = [];
          }
          agentTasks[normalizedId].push(task.title);
        }
      });
      
      console.log('[agent-org-api] agentTasks:', Object.keys(agentTasks));
    } catch (dbErr) {
      console.error('[agent-org-api] 获取任务数据失败:', dbErr.message);
    }
    
    // 读取组织结构数据
    const orgData = readOrgData();
    
    // 创建组织数据映射
    const orgMap = {};
    (orgData.agents || []).forEach(agent => {
      orgMap[agent.id] = agent;
    });
    
    // 合并 heartbeat 数据和组织数据
    const agents = heartbeatStatus.map(agent => {
      const org = orgMap[agent.id] || {};
      
      // 确保 lastHeartbeat 存在且不是过期数据
      // 如果 lastHeartbeat 超过 5 分钟未更新，认为是离线状态，但显示当前时间
      let lastHeartbeat = agent.lastHeartbeat || new Date().toISOString();
      try {
        const heartbeatTime = new Date(lastHeartbeat).getTime();
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (now - heartbeatTime > fiveMinutes) {
          // 心跳超时，显示最新心跳时间（但状态为 offline）
          console.log(`[agent-org-api] Agent ${agent.id} heartbeat timeout: ${lastHeartbeat}`);
        }
      } catch (e) {
        lastHeartbeat = new Date().toISOString();
      }
      
      // 从数据库填充 currentTask
      let currentTask = agent.currentTask;
      let queueLength = agent.queueLength;
      if (agentTasks[agent.id] && agentTasks[agent.id].length > 0) {
        currentTask = agentTasks[agent.id][0];
        queueLength = agentTasks[agent.id].length;
      }
      
      return {
        id: agent.id,
        name: agent.name || agent.id,
        status: agent.status || 'idle',
        model: agent.model,
        modelAlias: agent.modelAlias,
        fallbacks: agent.fallbacks || [],
        fallbackAliases: agent.fallbackAliases || [],
        currentTask: currentTask,
        queueLength: queueLength,
        lastHeartbeat: lastHeartbeat,
        lastUpdate: agent.lastUpdate,
        
        // 组织结构数据（可选）
        position: org.position,
        allowAgents: org.allowAgents,
        level: org.level,
        role: org.role,
        enabled: org.enabled
      };
    });
    
    // 添加有任务但不在心跳列表中的 agent
    const existingIds = new Set(agents.map(a => a.id));
    for (const [agentId, tasks] of Object.entries(agentTasks)) {
      if (!existingIds.has(agentId)) {
        agents.push({
          id: agentId,
          name: agentId.replace('agent-', ''),
          status: 'busy',
          currentTask: tasks[0],
          queueLength: tasks.length,
          model: 'default',
          lastHeartbeat: null
        });
      }
    }
    
    res.json({
      success: true,
      agents,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[agent-org-api] 获取 Agent 状态失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/agents/position
 * 保存 Agent 位置
 */
router.post('/position', (req, res) => {
  const { agentId, position } = req.body;
  
  if (!agentId || !position) {
    return res.status(400).json({ success: false, error: '缺少参数' });
  }
  
  const orgData = readOrgData();
  const agent = orgData.agents.find(a => a.id === agentId);
  
  if (agent) {
    agent.position = position;
    saveOrgData(orgData);
    res.json({ success: true, message: '位置已保存' });
  } else {
    res.status(404).json({ success: false, error: 'Agent 不存在' });
  }
});

/**
 * POST /api/agents/organization
 * 保存整个组织结构
 */
router.post('/organization', (req, res) => {
  const { agents } = req.body;
  
  if (!agents || !Array.isArray(agents)) {
    return res.status(400).json({ success: false, error: '无效的数据格式' });
  }
  
  const orgData = { agents };
  
  if (saveOrgData(orgData)) {
    res.json({ success: true, message: '组织结构已保存' });
  } else {
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

/**
 * GET /api/agents/organization
 * 获取组织结构配置
 */
router.get('/organization', (req, res) => {
  const orgData = readOrgData();
  res.json({
    success: true,
    ...orgData
  });
});

/**
 * POST /api/agents/add
 * 添加新 Agent
 */
router.post('/add', (req, res) => {
  const { id, name, role, model, position } = req.body;
  
  if (!id) {
    return res.status(400).json({ success: false, error: '缺少 Agent ID' });
  }
  
  const orgData = readOrgData();
  
  // 检查是否已存在
  if (orgData.agents.find(a => a.id === id)) {
    return res.status(400).json({ success: false, error: 'Agent ID 已存在' });
  }
  
  // 添加新 Agent
  orgData.agents.push({
    id,
    name: name || id,
    status: 'idle',
    position: position || { x: 400, y: 400 },
    model: { primary: model || 'qwencoding/glm-5' },
    allowAgents: []
  });
  
  saveOrgData(orgData);
  res.json({ success: true, message: 'Agent 已添加' });
});

/**
 * DELETE /api/agents/:id
 * 删除 Agent
 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  
  const orgData = readOrgData();
  const index = orgData.agents.findIndex(a => a.id === id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Agent 不存在' });
  }
  
  orgData.agents.splice(index, 1);
  saveOrgData(orgData);
  res.json({ success: true, message: 'Agent 已删除' });
});

/**
 * PUT /api/agents/:id
 * 更新 Agent 配置
 */
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  const orgData = readOrgData();
  const agent = orgData.agents.find(a => a.id === id);
  
  if (!agent) {
    return res.status(404).json({ success: false, error: 'Agent 不存在' });
  }
  
  // 更新字段
  Object.keys(updates).forEach(key => {
    if (['name', 'position', 'allowAgents', 'model'].includes(key)) {
      agent[key] = updates[key];
    }
  });
  
  saveOrgData(orgData);
  res.json({ success: true, message: 'Agent 已更新', agent });
});

module.exports = router;