/**
 * Agent注册中心 - 统一管理Agent的注册、注销和状态同步
 *
 * 功能：
 * 1. 将agent注册到多个位置（agents-status.json, agent-roles-registry.json）
 * 2. 从多个位置注销agent
 * 3. 更新agent的启用/禁用状态
 * 4. 提供统一的agent配置访问接口
 *
 * 使用方法：
 * const agentRegistry = require('./agent-registry-sync');
 * await agentRegistry.registerAgent(agentConfig);
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const AGENTS_STATUS_FILE = path.join(DATA_DIR, 'agents-status.json');
const AGENT_ROLES_REGISTRY_FILE = path.join(DATA_DIR, 'agent-roles-registry.json');
const AGENT_CONFIG_FILE = path.join(DATA_DIR, 'agent-management.json');

/**
 * Agent角色和能力映射
 */
const ROLE_CAPABILITIES = {
  primary: [
    'coding', 'analysis', 'documentation', 'planning', 'debugging', 'coordination', 'decision-making'
  ],
  coding: [
    'coding', 'debugging', 'implementation', 'testing', 'code-review', 'bugfix', 'development'
  ],
  communication: [
    'chat', 'response', 'conversation', 'summarization', 'communication', 'interaction', 'dialog'
  ],
  quick: [
    'quick-response', 'simple-task', 'data-processing', 'routing', 'routine', 'quick', 'simple'
  ],
  analysis: [
    'deep-analysis', 'research', 'documentation', 'problem-solving', 'architecture', 'debug', 'analysis'
  ]
};

/**
 * Agent优先级映射
 */
const ROLE_PRIORITY = {
  primary: 10,
  coding: 8,
  analysis: 8,
  communication: 5,
  quick: 3
};

/**
 * Agent最大队列长度
 */
const ROLE_MAX_QUEUE = {
  primary: 3,
  coding: 5,
  analysis: 2,
  communication: 5,
  quick: 10
};

/**
 * 读取agents-status.json
 */
function getAgentsStatus() {
  try {
    if (!fs.existsSync(AGENTS_STATUS_FILE)) {
      return [];
    }
    return JSON.parse(fs.readFileSync(AGENTS_STATUS_FILE, 'utf8'));
  } catch (error) {
    console.error('[Agent Registry] 读取agents-status.json失败:', error.message);
    return [];
  }
}

/**
 * 保存agents-status.json
 */
function saveAgentsStatus(agents) {
  try {
    fs.writeFileSync(AGENTS_STATUS_FILE, JSON.stringify(agents, null, 2));
    return { success: true };
  } catch (error) {
    console.error('[Agent Registry] 保存agents-status.json失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 读取agent-roles-registry.json
 */
function getAgentRolesRegistry() {
  try {
    if (!fs.existsSync(AGENT_ROLES_REGISTRY_FILE)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(AGENT_ROLES_REGISTRY_FILE, 'utf8'));
  } catch (error) {
    console.error('[Agent Registry] 读取agent-roles-registry.json失败:', error.message);
    return {};
  }
}

/**
 * 保存agent-roles-registry.json
 */
function saveAgentRolesRegistry(registry) {
  try {
    fs.writeFileSync(AGENT_ROLES_REGISTRY_FILE, JSON.stringify(registry, null, 2));
    return { success: true };
  } catch (error) {
    console.error('[Agent Registry] 保存agent-roles-registry.json失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 注册Agent到所有系统
 *
 * @param {Object} agent - agent配置
 * @param {string} agent.id - agent id
 * @param {string} agent.name - agent名称
 * @param {string} agent.role - agent角色
 * @param {string} agent.model - agent模型
 * @param {string} agent.description - agent描述
 * @returns {Object} 注册结果
 */
function registerAgent(agent) {
  console.log(`[Agent Registry] 注册Agent: ${agent.id}`);

  const results = {
    success: true,
    operations: []
  };

  // 1. 添加到agents-status.json
  const statusResult = registerToAgentsStatus(agent);
  results.operations.push({ target: 'agents-status.json', result: statusResult });

  // 2. 添加到agent-roles-registry.json
  const rolesResult = registerToAgentRolesRegistry(agent);
  results.operations.push({ target: 'agent-roles-registry.json', result: rolesResult });

  // 检查是否有失败
  if (statusResult.error || rolesResult.error) {
    results.success = false;
  }

  return results;
}

/**
 * 注册到agents-status.json
 */
function registerToAgentsStatus(agent) {
  try {
    const agents = getAgentsStatus();

    // 检查是否已存在
    if (agents.some(a => a.id === agent.id)) {
      return { success: true, message: 'Agent已存在', updated: false };
    }

    // 创建agent状态记录
    const statusEntry = {
      id: agent.id,
      name: agent.name,
      model: agent.model,
      status: 'online',  // 新注册的默认online
      currentTask: null,
      queueLength: 0,
      lastHeartbeat: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      config: {
        id: agent.id,
        name: agent.name,
        workspace: path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw/workspace'),
        model: agent.model,
        enabled: true
      }
    };

    agents.push(statusEntry);

    const saved = saveAgentsStatus(agents);
    if (!saved.success) {
      return saved;
    }

    console.log(`[Agent Registry] ✅ 已添加到agents-status.json: ${agent.id}`);
    return { success: true, updated: true };
  } catch (error) {
    console.error('[Agent Registry] 注册到agents-status.json失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 注册到agent-roles-registry.json
 */
function registerToAgentRolesRegistry(agent) {
  try {
    const registry = getAgentRolesRegistry();

    // 检查是否已存在
    if (registry[agent.id]) {
      return { success: true, message: 'Agent已存在', updated: false };
    }

    // 获取角色的能力和优先级
    const capabilities = ROLE_CAPABILITIES[agent.role] || ['general'];
    const priority = ROLE_PRIORITY[agent.role] || 5;
    const maxQueueLength = ROLE_MAX_QUEUE[agent.role] || 5;

    // 创建agent角色注册表记录
    const roleEntry = {
      id: agent.id,
      name: `${agent.name} ${agent.id}`,
      role: agent.role,
      capabilities: capabilities,
      maxQueueLength: maxQueueLength,
      priority: priority,
      models: [agent.model],
      primaryModel: agent.model,
      description: agent.description || `${agent.name} - ${agent.role}`
    };

    registry[agent.id] = roleEntry;

    const saved = saveAgentRolesRegistry(registry);
    if (!saved.success) {
      return saved;
    }

    console.log(`[Agent Registry] ✅ 已添加到agent-roles-registry.json: ${agent.id}`);
    return { success: true, updated: true };
  } catch (error) {
    console.error('[Agent Registry] 注册到agent-roles-registry.json失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 注销Agent从所有系统
 *
 * @param {string} agentId - agent id
 * @returns {Object} 注销结果
 */
function deregisterAgent(agentId) {
  console.log(`[Agent Registry] 注销Agent: ${agentId}`);

  const results = {
    success: true,
    operations: []
  };

  // 1. 从agents-status.json删除
  const statusResult = deregisterFromAgentsStatus(agentId);
  results.operations.push({ target: 'agents-status.json', result: statusResult });

  // 2. 从agent-roles-registry.json删除
  const rolesResult = deregisterFromAgentRolesRegistry(agentId);
  results.operations.push({ target: 'agent-roles-registry.json', result: rolesResult });

  // 检查是否有失败
  if (statusResult.error || rolesResult.error) {
    results.success = false;
  }

  return results;
}

/**
 * 从agents-status.json删除
 */
function deregisterFromAgentsStatus(agentId) {
  try {
    const agents = getAgentsStatus();

    // 查找agent
    const index = agents.findIndex(a => a.id === agentId);
    if (index === -1) {
      return { success: true, message: 'Agent不存在', deleted: false };
    }

    // 删除agent
    const removed = agents.splice(index, 1)[0];

    const saved = saveAgentsStatus(agents);
    if (!saved.success) {
      return saved;
    }

    console.log(`[Agent Registry] ✅ 已从agents-status.json删除: ${agentId}`);
    return { success: true, deleted: true, removed };
  } catch (error) {
    console.error('[Agent Registry] 从agents-status.json删除失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 从agent-roles-registry.json删除
 */
function deregisterFromAgentRolesRegistry(agentId) {
  try {
    const registry = getAgentRolesRegistry();

    // 检查是否存在
    if (!registry[agentId]) {
      return { success: true, message: 'Agent不存在', deleted: false };
    }

    // 删除agent
    const removed = registry[agentId];
    delete registry[agentId];

    const saved = saveAgentRolesRegistry(registry);
    if (!saved.success) {
      return saved;
    }

    console.log(`[Agent Registry] ✅ 已从agent-roles-registry.json删除: ${agentId}`);
    return { success: true, deleted: true, removed };
  } catch (error) {
    console.error('[Agent Registry] 从agent-roles-registry.json删除失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 更新Agent的启用/禁用状态
 *
 * @param {string} agentId - agent id
 * @param {boolean} enabled - 是否启用
 * @returns {Object} 更新结果
 */
function updateAgentEnabledStatus(agentId, enabled) {
  console.log(`[Agent Registry] 更新Agent状态: ${agentId} -> ${enabled ? 'enabled' : 'disabled'}`);

  const results = {
    success: true,
    operations: []
  };

  // 1. 更新agents-status.json中的状态
  const statusResult = updateAgentsStatusEnabled(agentId, enabled);
  results.operations.push({ target: 'agents-status.json', result: statusResult });

  // 2. 更新agent-roles-registry.json中的状态（通过重新注册来更新）
  if (enabled && statusResult.exists) {
    const rolesResult = reregisterToAgentRolesRegistry(agentId);
    results.operations.push({ target: 'agent-roles-registry.json', result: rolesResult });
  }

  // 检查是否有失败
  if (statusResult.error) {
    results.success = false;
  }

  return results;
}

/**
 * 更新agents-status.json中的启用/禁用状态
 */
function updateAgentsStatusEnabled(agentId, enabled) {
  try {
    const agents = getAgentsStatus();

    // 查找agent
    const index = agents.findIndex(a => a.id === agentId);
    if (index === -1) {
      return { success: true, message: 'Agent不存在', updated: false, exists: false };
    }

    // 更新enabled状态
    agents[index].enabled = enabled;
    agents[index].enabledAt = enabled ? new Date().toISOString() : null;
    agents[index].disabledAt = !enabled ? new Date().toISOString() : null;

    // 如果禁用，标记为offline
    if (!enabled) {
      agents[index].status = 'offline';
    } else {
      // 如果启用，设置为online（如果没有其他状态）
      if (agents[index].status === 'offline') {
        agents[index].status = 'online';
      }
    }

    const saved = saveAgentsStatus(agents);
    if (!saved.success) {
      return saved;
    }

    console.log(`[Agent Registry] ✅ 已更新agents-status.json中的状态: ${agentId} -> ${enabled ? 'enabled' : 'disabled'}`);
    return { success: true, updated: true, exists: true };
  } catch (error) {
    console.error('[Agent Registry] 更新状态失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 重新注册到agent-roles-registry.json（用于更新配置）
 */
function reregisterToAgentRolesRegistry(agentId) {
  try {
    const agents = getAgentsStatus();
    const agent = agents.find(a => a.id === agentId);

    if (!agent) {
      return { success: true, message: 'Agent不存在', updated: false };
    }

    // 从agent-roles-registry.json删除旧记录
    const registry = getAgentRolesRegistry();
    if (registry[agentId]) {
      // 保留旧的role，因为agent-config可能没有role
      const oldRole = registry[agentId].role || analysisRole(agent);
      delete registry[agentId];

      // 重新创建角色注册表记录
      const capabilities = ROLE_CAPABILITIES[oldRole] || ['general'];
      const priority = ROLE_PRIORITY[oldRole] || 5;
      const maxQueueLength = ROLE_MAX_QUEUE[oldRole] || 5;

      const roleEntry = {
        id: agent.id,
        name: `${agent.name} ${agent.id}`,
        role: oldRole,
        capabilities: capabilities,
        maxQueueLength: maxQueueLength,
        priority: priority,
        models: [agent.model],
        primaryModel: agent.model,
        description: agent.description || `${agent.name} - ${oldRole}`
      };

      registry[agentId] = roleEntry;

      const saved = saveAgentRolesRegistry(registry);
      if (saved.success) {
        console.log(`[Agent Registry] ✅ 已重新注册到agent-roles-registry.json: ${agentId}`);
        return { success: true, updated: true };
      }
      return saved;
    }

    return { success: true, message: 'Agent不存在', updated: false };
  } catch (error) {
    console.error('[Agent Registry] 重新注册失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 更新Agent的模型
 *
 * @param {string} agentId - agent id
 * @param {string} model - 新模型
 * @returns {Object} 更新结果
 */
function updateAgentModel(agentId, model) {
  console.log(`[Agent Registry] 更新Agent模型: ${agentId} -> ${model}`);

  const results = {
    success: true,
    operations: []
  };

  // 1. 更新agents-status.json中的模型
  const statusResult = updateAgentsStatusModel(agentId, model);
  results.operations.push({ target: 'agents-status.json', result: statusResult });

  // 2. 更新agent-roles-registry.json中的模型
  const rolesResult = updateAgentRolesRegistryModel(agentId, model);
  results.operations.push({ target: 'agent-roles-registry.json', result: rolesResult });

  // 检查是否有失败
  if (statusResult.error || rolesResult.error) {
    results.success = false;
  }

  return results;
}

/**
 * 更新agents-status.json中的模型
 */
function updateAgentsStatusModel(agentId, model) {
  try {
    const agents = getAgentsStatus();

    // 查找agent
    const index = agents.findIndex(a => a.id === agentId);
    if (index === -1) {
      return { success: true, message: 'Agent不存在', updated: false };
    }

    // 更新模型
    agents[index].model = model;
    agents[index].lastUpdate = new Date().toISOString();

    const saved = saveAgentsStatus(agents);
    if (!saved.success) {
      return saved;
    }

    console.log(`[Agent Registry] ✅ 已更新agents-status.json中的模型: ${agentId}`);
    return { success: true, updated: true };
  } catch (error) {
    console.error('[Agent Registry] 更新模型失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 更新agent-roles-registry.json中的模型
 */
function updateAgentRolesRegistryModel(agentId, model) {
  try {
    const registry = getAgentRolesRegistry();

    // 检查是否存在
    if (!registry[agentId]) {
      return { success: true, message: 'Agent不存在', updated: false };
    }

    // 更新模型
    registry[agentId].models = [model];
    registry[agentId].primaryModel = model;

    const saved = saveAgentRolesRegistry(registry);
    if (!saved.success) {
      return saved;
    }

    console.log(`[Agent Registry] ✅ 已更新agent-roles-registry.json中的模型: ${agentId}`);
    return { success: true, updated: true };
  } catch (error) {
    console.error('[Agent Registry] 更新模型失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 获取agent的完整配置
 *
 * @param {string} agentId - agent id
 * @returns {Object|null} agent配置
 */
function getAgentConfig(agentId) {
  const agentsStatus = getAgentsStatus();
  const agent = agentsStatus.find(a => a.id === agentId);

  if (!agent) {
    return null;
  }

  const registry = getAgentRolesRegistry();
  const roleInfo = registry[agentId];

  return {
    ...agent,
    roleInfo: roleInfo || {}
  };
}

/**
 * 获取所有可用的agents（启用的）
 *
 * @returns {Array} agents列表
 */
function getAvailableAgents() {
  const agentsStatus = getAgentsStatus();
  const registry = getAgentRolesRegistry();

  // 只返回启用的agents
  const availableAgents = agentsStatus
    .filter(a => a.enabled !== false)  // enabled为undefined或true都是启用
    .map(agent => ({
      ...agent,
      roleInfo: registry[agent.id] || {}
    }));

  return availableAgents;
}

/**
 * 同步所有注册信息（从agent-management.json同步到其他文件）
 *
 * @returns {Object} 同步结果
 */
function syncAllRegistrations() {
  console.log('[Agent Registry] 开始同步所有注册信息...');

  try {
    // 读取agent-management.json
    if (!fs.existsSync(AGENT_CONFIG_FILE)) {
      return { success: false, error: 'agent-management.json不存在' };
    }

    const config = JSON.parse(fs.readFileSync(AGENT_CONFIG_FILE, 'utf8'));
    const managementAgents = Object.values(config.agents);

    const results = {
      success: true,
      registered: 0,
      updated: 0,
      deleted: 0,
      errors: []
    };

    // 获取当前所有已注册的agents
    const registeredStatus = getAgentsStatus().map(a => a.id);
    const registeredRoles = Object.keys(getAgentRolesRegistry());

    // 处理agent-management.json中的每个agent
    managementAgents.forEach(agent => {
      try {
        if (!agent.enabled) {
          // 禁用的agent - 从注册表中移除
          if (registeredStatus.includes(agent.id)) {
            const deregisterResults = deregisterAgent(agent.id);
            if (deregisterResults.success) {
              results.deleted++;
            }
          }
        } else {
          // 启用的agent - 注册或更新
          const config = getAgentConfig(agent.id);

          if (!config) {
            // 新agent
            const registerResults = registerAgent(agent);
            if (registerResults.success) {
              results.registered++;
            } else {
              results.errors.push({ agent: agent.id, error: registerResults.error });
            }
          } else {
            // 已存在的agent - 更新模型
            if (config.model !== agent.model) {
              const updateResults = updateAgentModel(agent.id, agent.model);
              if (updateResults.success) {
                results.updated++;
              }
            }
          }
        }
      } catch (error) {
        console.error(`[Agent Registry] 同步agent ${agent.id} 失败:`, error.message);
        results.errors.push({ agent: agent.id, error: error.message });
      }
    });

    console.log(`[Agent Registry] ✅ 同步完成: 注册${results.registered}, 更新${results.updated}, 删除${results.deleted}`);
    return results;
  } catch (error) {
    console.error('[Agent Registry] 同步失败:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  // 注册和注销
  registerAgent,
  deregisterAgent,
  updateAgentEnabledStatus,
  updateAgentModel,

  // 查询
  getAgentConfig,
  getAvailableAgents,

  // 同步
  syncAllRegistrations,

  // 内部函数（供测试使用）
  ROLE_CAPABILITIES,
  ROLE_PRIORITY,
  ROLE_MAX_QUEUE
};
