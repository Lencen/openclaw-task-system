/**
 * Agent心跳机制实现
 * 功能：接收Agent心跳，更新agents-status.json
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const { readPendingAssignmentsByAgent, updateAssignmentStatus } = require('./pending-assignment-observer');

// Agent心跳数据存储
const agentsStatusFile = path.join(__dirname, '../data/agents-status.json');
const openclawConfigFile = path.join(process.env.HOME, '.openclaw/openclaw.json');
const ASSIGNMENTS_FILE = path.join(__dirname, '../data/pending-assignments.jsonl');

// Gateway 配置
const GATEWAY_HOST = process.env.GATEWAY_HOST || 'localhost';
const GATEWAY_PORT = process.env.GATEWAY_PORT || 8081;

// 版本标识（用于调试）
const VERSION = 'v1.1.2'; // 添加了 agent- 前缀支持
console.log(`[Agent Heartbeat] Loaded: ${VERSION}`);

// 模型别名映射
const modelAliases = {
  'qwencoding/glm-5': 'GLM-5 (阿里云)',
  'qwencoding/glm-4.7': 'GLM-4.7 (阿里云)',
  'qwencoding/kimi-k2.5': 'Kimi-K2.5 (阿里云)',
  'qwencoding/MiniMax-M2.5': 'MiniMax-M2.5 (阿里云)',
  'qwencoding/qwen3-coder-next': 'Qwen3-Coder-Next',
  'qwencoding/qwen3-coder-plus': 'Qwen3-Coder-Plus',
  'qwencoding/qwen3.5-plus': 'Qwen3.5-Plus',
  'qwencoding/qwen3-max-2026-01-23': 'Qwen3-Max',
  'nvidia-1/qwen/qwen3.5-397b-a17b': 'Qwen3.5-397B',
  'nvidia-1/qwen/qwen3-coder-480b-a35b-instruct': 'Qwen3-Coder-480B',
  'nvidia-2/deepseek-ai/deepseek-v3.2': 'DeepSeek-V3.2',
  'nvidia-2/moonshotai/kimi-k2.5': 'Kimi-K2.5 (NVIDIA)',
  'nvidia-2/minimaxai/minimax-m2.5': 'MiniMax-M2.5 (NVIDIA)',
  'nvidia-2/z-ai/glm5': 'GLM-5 (NVIDIA)',
  'uos/GLM-4.7': 'GLM-4.7 (UOS)',
  'uos/GLM-5': 'GLM-5 (UOS)'
};

/**
 * 从 openclaw.json 获取 Agent 配置
 */
function getOpenclawAgentConfigs() {
  try {
    if (!fs.existsSync(openclawConfigFile)) {
      console.warn('[Agent Heartbeat] openclaw.json 不存在');
      return {};
    }
    const config = JSON.parse(fs.readFileSync(openclawConfigFile, 'utf8'));
    const agents = {};
    
    // 遍历所有 agent
    (config.agents?.list || []).forEach(agent => {
      const primaryModel = agent.model?.primary || 'unknown';
      const fallbackModels = agent.model?.fallbacks || [];
      const alias = modelAliases[primaryModel] || primaryModel.split('/').pop();
      
      agents[agent.id] = {
        name: agent.name || agent.id,
        model: primaryModel,
        modelAlias: alias,
        fallbacks: fallbackModels,
        fallbackAliases: fallbackModels.map(m => modelAliases[m] || m.split('/').pop()),
        agentDir: agent.agentDir
      };
    });
    
    return agents;
  } catch (error) {
    console.error('[Agent Heartbeat] 读取 openclaw.json 失败:', error.message);
    return {};
  }
}

/**
 * 获取模型别名
 */
function getModelAlias(modelId) {
  if (!modelId) return 'Unknown';
  return modelAliases[modelId] || modelId.split('/').pop();
}

/**
 * 通知指定 Agent 有新任务
 * 通过 Gateway HTTP API 调用 notify-agent 端点
 */
async function notifyAgentViaGateway(agentId, taskId, taskTitle, taskDescription) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      taskId: taskId,
      agentId: agentId,
      taskTitle: taskTitle,
      taskDescription: taskDescription
    });

    const options = {
      hostname: GATEWAY_HOST,
      port: GATEWAY_PORT,
      path: '/api/tasks/notify-agent',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          reject(new Error('解析响应失败: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * 处理Agent心跳请求
 */
function handleAgentHeartbeat(agentId, data) {
  try {
    // 读取现有状态
    let agents = [];
    if (fs.existsSync(agentsStatusFile)) {
      agents = JSON.parse(fs.readFileSync(agentsStatusFile, 'utf8'));
    }

    // 查找或创建Agent
    let agent = agents.find(a => a.id === agentId);
    if (!agent) {
      agent = {
        id: agentId,
        name: data.name || agentId,
        model: data.model || 'unknown',
        status: 'idle',
        currentTask: null,
        queueLength: 0,
        lastHeartbeat: new Date().toISOString()
      };
      agents.push(agent);
    }

    // 更新心跳信息
    agent.lastHeartbeat = new Date().toISOString();
    
    // 更新状态（如果提供）
    if (data.status) agent.status = data.status;
    if (data.currentTask !== undefined) agent.currentTask = data.currentTask;
    if (data.queueLength !== undefined) agent.queueLength = data.queueLength;
    if (data.model) agent.model = data.model;
    if (data.name) agent.name = data.name;

    // ========== 处理待分配任务 ==========
    const pendingAssignments = [];
    
    if (fs.existsSync(ASSIGNMENTS_FILE)) {
      // 使用 pending-assignment-observer 模块读取并分组
      const groups = readPendingAssignmentsByAgent();
      
      // 筛选发给此 agent 的待分配记录
      const agentGroups = groups[agentId] || [];
      pendingAssignments.push(...agentGroups);
    }
    
    // 有新任务分配给此 agent
    if (pendingAssignments.length > 0) {
      console.log(`[Agent Heartbeat] ${agentId} 有 ${pendingAssignments.length} 个待处理任务`);
      
      // 尝试通过 Gateway 通知 agent
      for (const assignment of pendingAssignments) {
        console.log(`[Agent Heartbeat] 通知 ${agentId}: ${assignment.taskTitle}`);
        
        // 异步调用 Gateway API 通知 agent
        notifyAgentViaGateway(
          assignment.agentId,
          assignment.taskId,
          assignment.taskTitle,
          assignment.taskDescription
        ).then(result => {
          if (result.success) {
            console.log(`[Agent Heartbeat] ✅ 通知 ${agentId} 成功: ${assignment.taskTitle}`);
            
            // 更新待分配记录状态
            updateAssignmentStatus(assignment.id, 'processed');
          } else {
            console.error(`[Agent Heartbeat] ❌ 通知 ${agentId} 失败: ${result.error}`);
          }
        }).catch(err => {
          console.error(`[Agent Heartbeat] ❌ 通知 ${agentId} 失败: ${err.message}`);
        });
      }
    }

    // 保存回文件
    fs.writeFileSync(agentsStatusFile, JSON.stringify(agents, null, 2));

    return {
      success: true,
      message: 'Heartbeat received',
      agent: agent,
      pendingTasks: pendingAssignments.length
    };
  } catch (error) {
    console.error('[Agent Heartbeat Error]', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 获取所有Agent状态（合并 openclaw.json 配置）
 * 
 * 状态定义：
 * - idle: 空闲中（Agent可用，没有执行任务）
 * - working: 工作中（Agent正在执行任务）
 * - offline: 离线（Agent完全失联/不可用）
 */
function getAgentsStatus() {
  try {
    // 从 openclaw.json 获取最新的 agent 配置
    const openclawConfigs = getOpenclawAgentConfigs();
    
    // 如果没有状态文件，直接从 openclaw.json 创建
    if (!fs.existsSync(agentsStatusFile)) {
      return Object.entries(openclawConfigs).map(([id, config]) => ({
        // 添加 agent- 前缀以保持一致性
        id: id.startsWith('agent-') ? id : `agent-${id}`,
        name: config.name,
        model: config.model,
        modelAlias: config.modelAlias,
        fallbacks: config.fallbacks,
        fallbackAliases: config.fallbackAliases,
        status: 'idle',  // 默认空闲中
        currentTask: null,
        queueLength: 0,
        lastHeartbeat: new Date().toISOString()
      }));
    }
    
    let agents = JSON.parse(fs.readFileSync(agentsStatusFile, 'utf8'));
    const now = new Date();
    
    // 处理每个 agent
    agents.forEach(agent => {
      // 添加 agent- 前缀（如果还没有）
      const normalizedId = agent.id.startsWith('agent-') ? agent.id : `agent-${agent.id}`;
      if (normalizedId !== agent.id) {
        console.log(`[Agent Heartbeat] Normalizing ${agent.id} -> ${normalizedId}`);
        agent.id = normalizedId;
      }
      
      // 确保 lastHeartbeat 字段存在，如果不存在或无效则使用当前时间
      if (!agent.lastHeartbeat) {
        console.log(`[Agent Heartbeat] Missing lastHeartbeat for ${agent.id}, setting to current time`);
        agent.lastHeartbeat = new Date().toISOString();
      } else {
        try {
          const heartbeatTime = new Date(agent.lastHeartbeat).getTime();
          if (isNaN(heartbeatTime)) {
            console.log(`[Agent Heartbeat] Invalid lastHeartbeat for ${agent.id}, resetting`);
            agent.lastHeartbeat = new Date().toISOString();
          }
        } catch (e) {
          console.log(`[Agent Heartbeat] Error parsing lastHeartbeat for ${agent.id}, resetting`);
          agent.lastHeartbeat = new Date().toISOString();
        }
      }
      
      // 从 openclaw.json 更新模型信息
      const config = openclawConfigs[agent.id] || openclawConfigs[agent.id.replace('agent-', '')];
      if (config) {
        agent.name = config.name;
        agent.model = config.model;
        agent.modelAlias = config.modelAlias;
        agent.fallbacks = config.fallbacks;
        agent.fallbackAliases = config.fallbackAliases;
        
        // 状态规范化：
        // working/busy -> working (工作中)
        // online/idle -> idle (空闲中)
        // offline/error -> offline (离线)
        if (agent.status === 'working' || agent.status === 'busy') {
          agent.status = 'working';
        } else if (agent.status === 'online' || agent.status === 'idle' || !agent.status) {
          // 如果有 currentTask，说明在工作
          if (agent.currentTask) {
            agent.status = 'working';
          } else {
            agent.status = 'idle';
          }
        }
        // offline 保持不变
      } else {
        // 不在 openclaw.json 中的 Agent，设为离线
        agent.status = 'offline';
      }
    });
    
    // 确保 agents 是副本，不影响原文件
    agents = JSON.parse(JSON.stringify(agents));
    
    // 添加 openclaw.json 中有但 agents-status.json 中没有的 agent
    Object.keys(openclawConfigs).forEach(id => {
      const config = openclawConfigs[id];
      const normalizedId = id.startsWith('agent-') ? id : `agent-${id}`;
      if (!agents.find(a => a.id === normalizedId)) {
        console.log(`[Agent Heartbeat] Adding missing agent: ${normalizedId}`);
        agents.push({
          id: normalizedId,
          name: config.name,
          model: config.model,
          modelAlias: config.modelAlias,
          fallbacks: config.fallbacks,
          fallbackAliases: config.fallbackAliases,
          status: 'idle',  // 新发现的 Agent 默认空闲中
          currentTask: null,
          queueLength: 0,
          lastHeartbeat: new Date().toISOString()
        });
      }
    });
    
    // 深度克隆以防止意外修改
    const result = JSON.parse(JSON.stringify(agents));
    console.log(`[Agent Heartbeat] Returning ${result.length} agents. First agent ID: ${result[0]?.id}`);
    return result;
  } catch (error) {
    console.error('[Agent Status Error]', error.message);
    return [];
  }
}

/**
 * 重置所有Agent状态为idle（用于系统启动或重置）
 */
function resetAgentsStatus() {
  try {
    const agents = JSON.parse(fs.readFileSync(agentsStatusFile, 'utf8'));
    agents.forEach(agent => {
      agent.status = 'idle';
      agent.currentTask = null;
      agent.queueLength = 0;
      agent.lastHeartbeat = new Date().toISOString();
    });
    fs.writeFileSync(agentsStatusFile, JSON.stringify(agents, null, 2));
    console.log('[Agent Status] ✅ 所有Agent状态已重置');
  } catch (error) {
    console.error('[Agent Status Reset Error]', error.message);
  }
}

module.exports = {
  handleAgentHeartbeat,
  getAgentsStatus,
  resetAgentsStatus
};
