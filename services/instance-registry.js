/**
 * Agent Instance Registry Service
 * 
 * 功能:
 * 1. Agent 实例注册和管理
 * 2. 实例状态跟踪
 * 3. 实例认证
 * 
 * 身份模型: {instanceId}:{agentName}
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../data');
const INSTANCES_FILE = path.join(DATA_DIR, 'im-instances.json');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Agent 实例状态
 */
const InstanceStatus = {
    ACTIVE: 'active',       // 在线活跃
    IDLE: 'idle',           // 空闲
    OFFLINE: 'offline',     // 离线
    SUSPENDED: 'suspended'  // 暂停
};

/**
 * 实例注册表管理器
 */
class InstanceRegistry {
    constructor() {
        this.instances = this.loadInstances();
        this.connectionMap = new Map(); // 实例 -> WebSocket 连接
        this.startCleanupInterval();
    }

    /**
     * 加载实例数据
     */
    loadInstances() {
        try {
            if (!fs.existsSync(INSTANCES_FILE)) {
                return this.initDefaultInstances();
            }
            return JSON.parse(fs.readFileSync(INSTANCES_FILE, 'utf8'));
        } catch (error) {
            console.error('[Registry] 加载实例数据失败:', error.message);
            return this.initDefaultInstances();
        }
    }

    /**
     * 初始化默认实例
     */
    initDefaultInstances() {
        const defaultInstances = {
            instances: {
                'local': {
                    instanceId: 'local',
                    name: '本地实例',
                    description: '本地开发实例',
                    createdAt: new Date().toISOString(),
                    status: 'active',
                    agents: {}
                }
            },
            agents: {}
        };

        // 为本地实例添加已知 Agent
        const knownAgents = [
            { name: 'main', displayName: 'Main Agent', description: '主 Agent' },
            { name: 'coder', displayName: 'Coder Agent', description: '代码执行 Agent' },
            { name: 'deep', displayName: 'Deep Agent', description: '深度思考 Agent' },
            { name: 'fast', displayName: 'Fast Agent', description: '快速执行 Agent' },
            { name: 'chat', displayName: 'Chat Agent', description: '对话 Agent' },
            { name: 'test', displayName: 'Test Agent', description: '测试 Agent' },
            { name: 'office', displayName: 'Office Agent', description: '办公 Agent' },
            { name: 'office-1', displayName: 'Office-1 Agent', description: '办公 Agent 1' },
            { name: 'coder-1', displayName: 'Coder-1 Agent', description: '代码 Agent 1' },
            { name: 'coder-2', displayName: 'Coder-2 Agent', description: '代码 Agent 2' }
        ];

        for (const agent of knownAgents) {
            const fullAgentId = `local:${agent.name}`;
            defaultInstances.agents[fullAgentId] = {
                fullAgentId,
                instanceId: 'local',
                agentName: agent.name,
                displayName: agent.displayName,
                description: agent.description,
                status: InstanceStatus.OFFLINE,
                registeredAt: new Date().toISOString(),
                lastSeen: null,
                capabilities: []
            };
            defaultInstances.instances.local.agents[agent.name] = fullAgentId;
        }

        fs.writeFileSync(INSTANCES_FILE, JSON.stringify(defaultInstances, null, 2));
        console.log('[Registry] 初始化默认实例完成');
        return defaultInstances;
    }

    /**
     * 保存实例数据
     */
    saveInstances() {
        try {
            fs.writeFileSync(INSTANCES_FILE, JSON.stringify(this.instances, null, 2));
        } catch (error) {
            console.error('[Registry] 保存实例数据失败:', error.message);
        }
    }

    /**
     * 注册实例
     * @param {string} instanceId - 实例 ID
     * @param {object} metadata - 实例元数据
     * @returns {object} 注册结果
     */
    registerInstance(instanceId, metadata = {}) {
        if (this.instances.instances[instanceId]) {
            // 更新现有实例
            const existing = this.instances.instances[instanceId];
            existing.name = metadata.name || existing.name;
            existing.description = metadata.description || existing.description;
            existing.status = InstanceStatus.ACTIVE;
            existing.lastActive = new Date().toISOString();
            this.saveInstances();
            return { instanceId, isNew: false, instance: existing };
        }

        // 创建新实例
        const newInstance = {
            instanceId,
            name: metadata.name || instanceId,
            description: metadata.description || '',
            createdAt: new Date().toISOString(),
            status: InstanceStatus.ACTIVE,
            lastActive: new Date().toISOString(),
            agents: {},
            metadata
        };

        this.instances.instances[instanceId] = newInstance;
        this.saveInstances();

        console.log(`[Registry] 注册新实例: ${instanceId}`);
        return { instanceId, isNew: true, instance: newInstance };
    }

    /**
     * 注册 Agent
     * @param {string} instanceId - 实例 ID
     * @param {string} agentName - Agent 名称
     * @param {object} metadata - Agent 元数据
     * @returns {object} 注册结果
     */
    registerAgent(instanceId, agentName, metadata = {}) {
        const fullAgentId = `${instanceId}:${agentName}`;

        // 确保实例存在
        if (!this.instances.instances[instanceId]) {
            this.registerInstance(instanceId, { name: instanceId });
        }

        // 检查 Agent 是否已注册
        if (this.instances.agents[fullAgentId]) {
            // 更新现有 Agent
            const existing = this.instances.agents[fullAgentId];
            existing.status = InstanceStatus.ACTIVE;
            existing.lastSeen = new Date().toISOString();
            existing.displayName = metadata.displayName || existing.displayName;
            existing.description = metadata.description || existing.description;
            existing.capabilities = metadata.capabilities || existing.capabilities || [];

            this.instances.instances[instanceId].agents[agentName] = fullAgentId;
            this.instances.instances[instanceId].lastActive = new Date().toISOString();
            this.saveInstances();

            console.log(`[Registry] Agent 重新上线: ${fullAgentId}`);
            return { fullAgentId, isNew: false, agent: existing };
        }

        // 创建新 Agent
        const newAgent = {
            fullAgentId,
            instanceId,
            agentName,
            displayName: metadata.displayName || agentName,
            description: metadata.description || '',
            status: InstanceStatus.ACTIVE,
            registeredAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            capabilities: metadata.capabilities || []
        };

        this.instances.agents[fullAgentId] = newAgent;
        this.instances.instances[instanceId].agents[agentName] = fullAgentId;
        this.instances.instances[instanceId].lastActive = new Date().toISOString();
        this.saveInstances();

        console.log(`[Registry] 注册新 Agent: ${fullAgentId}`);
        return { fullAgentId, isNew: true, agent: newAgent };
    }

    /**
     * 获取 Agent 信息
     * @param {string} fullAgentId - 完整 Agent ID
     * @returns {object|null} Agent 信息
     */
    getAgent(fullAgentId) {
        return this.instances.agents[fullAgentId] || null;
    }

    /**
     * 通过实例和名称获取 Agent
     * @param {string} instanceId - 实例 ID
     * @param {string} agentName - Agent 名称
     * @returns {object|null} Agent 信息
     */
    getAgentByName(instanceId, agentName) {
        const fullAgentId = `${instanceId}:${agentName}`;
        return this.getAgent(fullAgentId);
    }

    /**
     * 获取实例所有 Agent
     * @param {string} instanceId - 实例 ID
     * @returns {Array} Agent 列表
     */
    getInstanceAgents(instanceId) {
        const instance = this.instances.instances[instanceId];
        if (!instance) return [];

        return Object.values(instance.agents)
            .map(fullAgentId => this.instances.agents[fullAgentId])
            .filter(Boolean);
    }

    /**
     * 获取所有在线 Agent
     * @returns {Array} 在线 Agent 列表
     */
    getOnlineAgents() {
        return Object.values(this.instances.agents)
            .filter(agent => agent.status === InstanceStatus.ACTIVE || agent.status === InstanceStatus.IDLE);
    }

    /**
     * 更新 Agent 状态
     * @param {string} fullAgentId - 完整 Agent ID
     * @param {string} status - 新状态
     * @param {object} metadata - 额外元数据
     */
    updateAgentStatus(fullAgentId, status, metadata = {}) {
        const agent = this.instances.agents[fullAgentId];
        if (!agent) {
            console.warn(`[Registry] Agent 不存在: ${fullAgentId}`);
            return false;
        }

        agent.status = status;
        agent.lastSeen = new Date().toISOString();
        Object.assign(agent, metadata);

        // 更新实例活跃时间
        if (this.instances.instances[agent.instanceId]) {
            this.instances.instances[agent.instanceId].lastActive = agent.lastSeen;
        }

        this.saveInstances();
        return true;
    }

    /**
     * 设置 Agent 连接
     * @param {string} fullAgentId - 完整 Agent ID
     * @param {WebSocket} ws - WebSocket 连接
     */
    setAgentConnection(fullAgentId, ws) {
        this.connectionMap.set(fullAgentId, ws);
        this.updateAgentStatus(fullAgentId, InstanceStatus.ACTIVE);
    }

    /**
     * 移除 Agent 连接
     * @param {string} fullAgentId - 完整 Agent ID
     */
    removeAgentConnection(fullAgentId) {
        this.connectionMap.delete(fullAgentId);
        this.updateAgentStatus(fullAgentId, InstanceStatus.OFFLINE);
    }

    /**
     * 获取 Agent 连接
     * @param {string} fullAgentId - 完整 Agent ID
     * @returns {WebSocket|null} WebSocket 连接
     */
    getAgentConnection(fullAgentId) {
        return this.connectionMap.get(fullAgentId);
    }

    /**
     * 获取实例信息
     * @param {string} instanceId - 实例 ID
     * @returns {object|null} 实例信息
     */
    getInstance(instanceId) {
        return this.instances.instances[instanceId] || null;
    }

    /**
     * 获取所有实例
     * @returns {Array} 实例列表
     */
    getAllInstances() {
        return Object.values(this.instances.instances);
    }

    /**
     * 验证实例
     * @param {string} instanceId - 实例 ID
     * @returns {boolean} 是否有效
     */
    validateInstance(instanceId) {
        return !!this.instances.instances[instanceId];
    }

    /**
     * 验证 Agent
     * @param {string} fullAgentId - 完整 Agent ID
     * @returns {{ valid: boolean, agent?: object, error?: string }}
     */
    validateAgent(fullAgentId) {
        const agent = this.instances.agents[fullAgentId];
        
        if (!agent) {
            return { valid: false, error: 'Agent 未注册' };
        }

        if (agent.status === InstanceStatus.SUSPENDED) {
            return { valid: false, error: 'Agent 已被暂停' };
        }

        return { valid: true, agent };
    }

    /**
     * 心跳更新
     * @param {string} fullAgentId - 完整 Agent ID
     */
    heartbeat(fullAgentId) {
        const agent = this.instances.agents[fullAgentId];
        if (agent) {
            agent.lastSeen = new Date().toISOString();
            if (agent.status === InstanceStatus.OFFLINE) {
                agent.status = InstanceStatus.ACTIVE;
            }
        }
    }

    /**
     * 定期清理离线 Agent
     */
    startCleanupInterval() {
        // 每 5 分钟检查一次
        setInterval(() => {
            const now = Date.now();
            const offlineThreshold = 5 * 60 * 1000; // 5 分钟无心跳视为离线

            Object.values(this.instances.agents).forEach(agent => {
                if (agent.status === InstanceStatus.ACTIVE || agent.status === InstanceStatus.IDLE) {
                    const lastSeen = new Date(agent.lastSeen).getTime();
                    if (now - lastSeen > offlineThreshold) {
                        this.updateAgentStatus(agent.fullAgentId, InstanceStatus.OFFLINE);
                        console.log(`[Registry] Agent 超时离线: ${agent.fullAgentId}`);
                    }
                }
            });
        }, 5 * 60 * 1000);
    }

    /**
     * 生成实例统计
     * @returns {object} 统计信息
     */
    getStats() {
        const agents = Object.values(this.instances.agents);
        return {
            totalInstances: Object.keys(this.instances.instances).length,
            totalAgents: agents.length,
            onlineAgents: agents.filter(a => a.status === InstanceStatus.ACTIVE).length,
            offlineAgents: agents.filter(a => a.status === InstanceStatus.OFFLINE).length,
            suspendedAgents: agents.filter(a => a.status === InstanceStatus.SUSPENDED).length,
            activeConnections: this.connectionMap.size
        };
    }
}

// 单例实例
let registryInstance = null;

/**
 * 获取注册表单例
 */
function getRegistry() {
    if (!registryInstance) {
        registryInstance = new InstanceRegistry();
    }
    return registryInstance;
}

/**
 * 导出
 */
module.exports = {
    InstanceRegistry,
    InstanceStatus,
    getRegistry
};