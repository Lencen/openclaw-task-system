/**
 * OpenClaw Agent启动器 v1.0
 * 功能：启动、管理、监控和恢复OpenClaw Agents
 *
 * 使用方法：
 * node agent-starter.js [command] [options]
 *
 * Commands:
 *   start --agent <id>          启动指定agent
 *   start-all                    启动所有agents
 *   status                       查看所有agents状态
 *   recover                      自动恢复离线agents
 *   test                         测试agent功能
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const AGENTS_DIR = path.join(__dirname, '../../../../agents');
const STATUS_FILE = path.join(__dirname, '../data/agent-startup-status.json');

// Agent配置
const AGENT_CONFIG = {
  main: {
    id: 'main',
    model: 'glm/GLM-4.7',
    role: 'general',
    description: '通用Agent，系统开发、深度分析'
  },
  chat: {
    id: 'chat',
    model: 'nvdia/qwen/qwen3.5-397b-a17b',
    role: 'communication',
    description: '对话和通信，日常交互'
  },
  fast: {
    id: 'fast',
    model: 'minimaxai/minimax-m2.5',
    role: 'quick-response',
    description: '快速响应，简单任务'
  },
  coder: {
    id: 'coder',
    model: 'nvdia/qwen/qwen3-coder-480b-a35b-instruct',
    role: 'coding',
    description: '代码审查、修复开发'
  },
  deep: {
    id: 'deep',
    model: 'deepseek-ai/deepseek-v3.2',
    role: 'deep-analysis',
    description: '深度分析，复杂问题'
  }
};

/**
 * 读取Agent会话信息
 */
function getAgentSession(agentId) {
  const sessionFile = path.join(AGENTS_DIR, agentId, 'sessions/sessions.json');

  if (!fs.existsSync(sessionFile)) {
    return null;
  }

  try {
    const sessionsObj = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    const sessions = Object.values(sessionsObj)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    if (sessions.length === 0) {
      return null;
    }

    const latest = sessions[0];
    const timeSince = Date.now() - new Date(latest.updatedAt).getTime();
    const minsAgo = Math.round(timeSince / 60000);

    let status = 'unknown';
    if (minsAgo < 10) {
      status = 'online';
    } else if (minsAgo < 60) {
      status = 'idle';
    } else {
      status = 'offline';
    }

    return {
      id: agentId,
      status,
      minsAgo,
      model: latest.model || 'unknown',
      sessionKey: latest.key,
      lastUpdate: latest.updatedAt
    };
  } catch (error) {
    return {
      id: agentId,
      status: 'error',
      error: error.message
    };
  }
}

/**
 * 获取所有Agents状态
 */
function getAllAgentsStatus() {
  const status = [];

  Object.keys(AGENT_CONFIG).forEach(agentId => {
    const sessionInfo = getAgentSession(agentId);
    const config = AGENT_CONFIG[agentId];

    status.push({
      ...config,
      ...sessionInfo
    });
  });

  return status;
}

/**
 * 启动指定Agent
 * 方法：创建一个新的session来激活agent
 */
async function startAgent(agentId) {
  const config = AGENT_CONFIG[agentId];

  if (!config) {
    return { success: false, error: `Unknown agent: ${agentId}` };
  }

  console.log(`\n🚀 启动 Agent: ${agentId} (${config.name || agentId})`);
  console.log(`   模型: ${config.model}`);
  console.log(`   角色: ${config.description}`);

  try {
    // 方法1：尝试通过openclaw agent命令激活
    console.log(`   方法1: 尝试通过命令行激活...`);
    try {
      execSync(`openclaw agent --agent ${agentId} --message "System: Agent startup activation." --local > /dev/null 2>&1`, {
        timeout: 10000,
        stdio: 'pipe'
      });
      console.log(`   ✅ 命令执行成功`);
    } catch (cmdError) {
      console.log(`   ⚠️  命令方法失败: ${cmdError.message.substring(0, 50)}`);
    }

    // 方法2：记录启动日志到agent目录
    const agentDir = path.join(AGENTS_DIR, agentId);
    const startupLogFile = path.join(agentDir, 'startup-log.json');

    const startupLog = {
      timestamp: new Date().toISOString(),
      action: 'startup',
      agentId,
      config,
      method: 'agent-starter'
    };

    fs.writeFileSync(startupLogFile, JSON.stringify([startupLog], null, 2));
    console.log(`   ✅ 启动日志已记录`);

    // 立即检查状态
    await new Promise(resolve => setTimeout(resolve, 1000));
    const sessionInfo = getAgentSession(agentId);

    return {
      success: true,
      agentId,
      previousStatus: sessionInfo.status,
      minsAgo: sessionInfo.minsAgo,
      note: 'Agent启动请求已发送，需要等待session更新'
    };
  } catch (error) {
    return {
      success: false,
      agentId,
      error: error.message
    };
  }
}

/**
 * 启动所有Agents
 */
async function startAllAgents() {
  console.log('\n🔄 启动所有Agents...\n');

  const results = [];
  const agentIds = Object.keys(AGENT_CONFIG);

  for (const agentId of agentIds) {
    const result = await startAgent(agentId);
    results.push(result);
  }

  console.log('\n📊 启动结果汇总:');
  const success = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`   ✅ 成功: ${success}`);
  console.log(`   ❌ 失败: ${failed}`);

  return results;
}

/**
 * 自动恢复离线Agents
 */
async function recoverOfflineAgents() {
  console.log('\n🔄 自动恢复离线Agents...\n');

  const allStatus = getAllAgentsStatus();
  const offlineAgents = allStatus.filter(a => a.status === 'offline' || a.status === 'unknown');

  console.log(`离线Agent数量: ${offlineAgents.length}`);

  if (offlineAgents.length === 0) {
    console.log('所有Agents都在线！');
    return { success: true, recovered: 0, message: 'All agents online' };
  }

  console.log('\n离线Agents:');
  offlineAgents.forEach(a => {
    console.log(`  🔴 ${a.id}: ${a.status} (${a.minsAgo}分钟前)`);
  });

  console.log('\n开始恢复...\n');

  const results = [];
  for (const agent of offlineAgents) {
    const result = await startAgent(agent.id);
    results.push(result);
  }

  const recovered = results.filter(r => r.success).length;

  return {
    success: true,
    recovered,
    total: offlineAgents.length,
    results
  };
}

/**
 * 显示Agent状态
 */
function showStatus() {
  const status = getAllAgentsStatus();

  console.log('\n🤖 OpenClaw Agents 状态\n');
  console.log('='.repeat(70));

  const statusIcon = {
    'online': '🟢',
    'idle': '🟡',
    'offline': '🔴',
    'unknown': '⚪',
    'error': '❌'
  };

  status.forEach(agent => {
    const icon = statusIcon[agent.status] || '⚪';
    const timeStr = agent.minsAgo === undefined ? 'N/A' :
                   agent.minsAgo === 999999 ? 'Never' : `${agent.minsAgo}分钟前`;
    const modelStr = agent.model ? agent.model.substring(0, 30) : 'Unknown';

    console.log(`${icon} ${agent.id.padEnd(10)} | ${agent.status.padEnd(8)} | ${modelStr.padEnd(30)} | ${timeStr}`);
  });

  const onlineCount = status.filter(a => a.status === 'online').length;
  const offlineCount = status.filter(a => a.status === 'offline').length;
  const totalCount = status.filter(a => a.status === 'online' || a.status === 'idle').length;

  console.log('='.repeat(70));
  console.log(`总计: ${status.length} agents`);
  console.log(`在线: ${onlineCount} | 空闲: ${status.filter(a => a.status === 'idle').length} | 离线: ${offlineCount}`);
  console.log(`活跃率: ${Math.round((totalCount / status.length) * 100)}%`);
}

/**
 * 测试Agent功能
 */
function testAgents() {
  console.log('\n🧪 测试Agent功能...\n');

  const status = getAllAgentsStatus();

  console.log('测试结果:\n');

  status.forEach(agent => {
    console.log(`${agent.id}:`);
    console.log(`  配置: ${AGENT_CONFIG[agent.id] ? '✅' : '❌'}`);
    console.log(`  Session: ${agent.sessionKey ? '✅' : '❌'}`);
    console.log(`  状态: ${agent.status === 'online' ? '✅' : '⚠️'}`);
    console.log('');
  });

  return {
    success: true,
    tested: status.length,
    online: status.filter(a => a.status === 'online').length
  };
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'start':
      const agentId = args.find(a => a.startsWith('--agent='))?.split('=')[1];
      if (agentId) {
        const result = await startAgent(agentId);
        console.log(`\n结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
        if (!result.success) {
          console.log(`错误: ${result.error}`);
        }
      } else {
        console.error('请指定agent: --agent=<id>');
        console.log('可用的agents:', Object.keys(AGENT_CONFIG).join(', '));
      }
      break;

    case 'start-all':
      await startAllAgents();
      break;

    case 'status':
      showStatus();
      break;

    case 'recover':
      const recoverResult = await recoverOfflineAgents();
      console.log(`\n恢复结果: ${recoverResult.recovered}/${recoverResult.total} agents`);
      break;

    case 'test':
      testAgents();
      break;

    default:
      console.log(`
OpenClaw Agent启动器 v1.0

使用方法:
  node agent-starter.js <command> [options]

Commands:
  start --agent=<id>     启动指定agent
  start-all              启动所有agents
  status                 查看所有agents状态
  recover                自动恢复离线agents
  test                   测试agent功能

可用agents:
  ${Object.keys(AGENT_CONFIG).join(', ')}

示例:
  node agent-starter.js status
  node agent-starter.js start --agent=chat
  node agent-starter.js recover
      `);
  }
}

// 如果直接运行，执行main函数
if (require.main === module) {
  main().catch(error => {
    console.error('[Error]', error.message);
    process.exit(1);
  });
}

module.exports = {
  AGENT_CONFIG,
  getAllAgentsStatus,
  startAgent,
  startAllAgents,
  recoverOfflineAgents,
  showStatus
};
