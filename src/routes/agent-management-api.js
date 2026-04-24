/**
 * Agent管理API
 * 提供agents的增删改查、启用/禁用功能
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

const router = express.Router();
const AGENT_CONFIG_FILE = path.join(__dirname, '../data/agent-management.json');
const agentRegistry = require('../../scripts/agent-registry-sync');

/**
 * 读取配置文件
 */
function readConfig() {
  try {
    if (!fs.existsSync(AGENT_CONFIG_FILE)) {
      return { agents: {}, availableModels: {}, version: '1.0', lastUpdated: null };
    }
    const data = fs.readFileSync(AGENT_CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[Agent Management API] Error reading config:', error);
    return { agents: {}, availableModels: {}, version: '1.0', lastUpdated: null };
  }
}

/**
 * 保存配置文件
 */
function saveConfig(config) {
  try {
    fs.writeFileSync(AGENT_CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('[Agent Management API] Error saving config:', error);
    return false;
  }
}

/**
 * 同步配置到agents-status.json（需要重启gateway）
 */
function syncToAgentsStatus(config) {
  try {
    const agentsStatusPath = path.join(__dirname, '../data/agents-status.json');
    const agentsStatus = [];

    for (const [id, agent] of Object.entries(config.agents)) {
      agentsStatus.push({
        id,
        name: agent.name,
        model: agent.model,
        status: agent.enabled ? 'online' : 'offline',
        enabled: agent.enabled,
        currentTask: null,
        queueLength: 0,
        lastHeartbeat: null,
        lastUpdate: new Date().toISOString()
      });
    }

    fs.writeFileSync(agentsStatusPath, JSON.stringify(agentsStatus, null, 2));
    console.log('[Agent Management API] Synced to agents-status.json');
  } catch (error) {
    console.error('[Agent Management API] Error syncing to agents-status.json:', error);
  }
}

/**
 * GET /api/agent-management/agents
 * 获取所有agents
 */
router.get('/agents', (req, res) => {
  const config = readConfig();
  const agents = Object.values(config.agents);

  res.json({
    success: true,
    agents,
    availableModels: config.availableModels,
    total: agents.length,
    enabled: agents.filter(a => a.enabled).length
  });
});

/**
 * GET /api/agent-management/agents-status
 * 获取agents的runtime状态（从data/agents-status.json）
 */
router.get('/agents-status', (req, res) => {
  const agentsStatusPath = path.join(__dirname, '../data/agents-status.json');

  try {
    if (!fs.existsSync(agentsStatusPath)) {
      return res.json({
        success: true,
        agents: []
      });
    }

    const data = fs.readFileSync(agentsStatusPath, 'utf8');
    const parsedData = JSON.parse(data);
    const allAgents = Array.isArray(parsedData) ? parsedData : (parsedData.agents || []);
    
    // 过滤掉没有id的元素（第一个元素通常是汇总信息）
    const agents = allAgents.filter(agent => agent.id && typeof agent.id === 'string');

    res.json({
      success: true,
      agents,
      total: agents.length
    });
  } catch (error) {
    console.error('[Agent Management API] Error reading agents-status.json:', error);
    res.json({
      success: true,
      agents: []
    });
  }
});

/**
 * POST /api/agent-management/agents
 * 添加新agent
 */
router.post('/agents', (req, res) => {
  const { id, name, role, model, description = '' } = req.body;

  if (!id || !name || !role || !model) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: id, name, role, model'
    });
  }

  const config = readConfig();

  if (config.agents[id]) {
    return res.status(400).json({
      success: false,
      error: 'Agent already exists'
    });
  }

  config.agents[id] = {
    id,
    name,
    role,
    model,
    enabled: true,
    protected: false,
    description
  };

  if (saveConfig(config)) {
    syncToAgentsStatus(config);
    res.json({
      success: true,
      agent: config.agents[id]
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Failed to save agent'
    });
  }
});

/**
 * PUT /api/agent-management/agents/:id/enable
 * 启用agent
 */
router.put('/agents/:id/enable', (req, res) => {
  const { id } = req.params;
  const config = readConfig();

  if (!config.agents[id]) {
    return res.status(404).json({ success: false, error: 'Agent not found' });
  }

  if (config.agents[id].protected) {
    return res.status(403).json({ success: false, error: 'Cannot disable protected agent' });
  }

  config.agents[id].enabled = true;
  config.lastUpdated = new Date().toISOString();

  if (saveConfig(config)) {
    syncToAgentsStatus(config);
    res.json({ success: true, agent: config.agents[id] });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save config' });
  }
});

/**
 * PUT /api/agent-management/agents/:id/disable
 * 禁用agent
 */
router.put('/agents/:id/disable', (req, res) => {
  const { id } = req.params;
  const config = readConfig();

  if (!config.agents[id]) {
    return res.status(404).json({ success: false, error: 'Agent not found' });
  }

  if (config.agents[id].protected) {
    return res.status(403).json({ success: false, error: 'Cannot disable protected agent' });
  }

  config.agents[id].enabled = false;
  config.lastUpdated = new Date().toISOString();

  if (saveConfig(config)) {
    syncToAgentsStatus(config);
    res.json({ success: true, agent: config.agents[id] });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save config' });
  }
});

/**
 * PUT /api/agent-management/agents/:id/model
 * 更新agent的模型
 */
router.put('/agents/:id/model', (req, res) => {
  const { id } = req.params;
  const { model } = req.body;

  if (!model) {
    return res.status(400).json({ success: false, error: 'Model is required' });
  }

  const config = readConfig();

  if (!config.agents[id]) {
    return res.status(404).json({ success: false, error: 'Agent not found' });
  }

  config.agents[id].model = model;
  config.lastUpdated = new Date().toISOString();

  if (saveConfig(config)) {
    res.json({ success: true, agent: config.agents[id] });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save config' });
  }
});

/**
 * DELETE /api/agent-management/agents/:id
 * 删除agent
 */
router.delete('/agents/:id', (req, res) => {
  const { id } = req.params;
  const config = readConfig();

  if (!config.agents[id]) {
    return res.status(404).json({ success: false, error: 'Agent not found' });
  }

  if (config.agents[id].protected) {
    return res.status(403).json({ success: false, error: 'Cannot delete protected agent' });
  }

  delete config.agents[id];
  config.lastUpdated = new Date().toISOString();

  if (saveConfig(config)) {
    syncToAgentsStatus(config);
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save config' });
  }
});

/**
 * GET /api/agent-management/status
 * 获取系统状态
 */
router.get('/status', (req, res) => {
  const config = readConfig();
  const agents = Object.values(config.agents);

  const status = {
    totalAgents: agents.length,
    enabledAgents: agents.filter(a => a.enabled).length,
    disabledAgents: agents.filter(a => !a.enabled).length,
    protectedAgents: agents.filter(a => a.protected).length,
    lastUpdated: config.lastUpdated,
    version: config.version
  };

  res.json({ success: true, status });
});

module.exports = router;
