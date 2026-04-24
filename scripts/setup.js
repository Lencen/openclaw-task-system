#!/usr/bin/env node
/**
 * 自动配置脚本 - 开源版
 * 
 * 自动读取本机 OpenClaw 配置，生成 .env 文件
 * 让用户一键部署，无需手动配置
 * 
 * 安全改进：不再提取和存储 API Key
 * 
 * 用法: node scripts/setup.js
 */

const fs = require('fs');
const path = require('path');

// ============ 配置发现 ============

function findOpenClawConfig() {
  const candidates = [
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.openclaw', 'openclaw.json'),
    path.join(process.cwd(), '.openclaw', 'openclaw.json'),
    path.join(process.cwd(), '..', '.openclaw', 'openclaw.json'),
    process.env.OPENCLAW_CONFIG,
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return { path: p, config: JSON.parse(fs.readFileSync(p, 'utf8')) };
    }
  }
  return null;
}

function discoverGateway(config) {
  const gateway = config.gateway || {};
  const auth = gateway.auth || {};
  
  return {
    port: gateway.port || 18789,
    token: auth.token || '',
    mode: gateway.mode || 'local',
    remoteUrl: gateway.remote?.url || `ws://127.0.0.1:${gateway.port || 18789}`,
  };
}

function discoverAgents(config) {
  const agents = config.agents || {};
  const entries = agents.entries || {};
  const defaults = agents.defaults || {};
  
  const agentIds = Object.keys(entries).length > 0 
    ? Object.keys(entries)
    : ['main', 'coder', 'deep', 'fast', 'chat', 'test', 'office'];
  
  return {
    ids: agentIds,
    defaultModel: defaults.model?.primary || '',
  };
}

// ============ 生成 .env ============

function generateEnv(gateway, agents, workspace) {
  const lines = [
    '# ==============================================',
    '# OpenClaw Task System 配置文件',
    '# 由 scripts/setup.js 自动生成',
    `# 生成时间: ${new Date().toISOString()}`,
    '# ==============================================',
    '',
    '# --- 服务器配置 ---',
    `PORT=8081`,
    `HOST=0.0.0.0`,
    `BASE_URL=http://localhost:8081`,
    `TASK_API_URL=http://localhost:8081`,
    '',
    '# --- OpenClaw Gateway 配置 (自动发现) ---',
    `GATEWAY_PORT=${gateway.port}`,
    `GATEWAY_TOKEN=${gateway.token}`,
    `GATEWAY_URL=${gateway.remoteUrl}`,
    `GATEWAY_MODE=${gateway.mode}`,
    '',
    '# --- Agent 配置 ---',
    `AGENT_LIST=${agents.ids.join(',')}`,
    `DEFAULT_MODEL=${agents.defaultModel}`,
    `INSTANCE_ID=${require('os').hostname()}`,
    '',
    '# --- JWT 认证 ---',
    `JWT_SECRET=${require('crypto').randomBytes(32).toString('hex')}`,
    '',
    '# --- 默认管理员账号 (首次登录使用) ---',
    `DEFAULT_ADMIN_EMAIL=admin@taskplatform.com`,
    `DEFAULT_ADMIN_PASSWORD=admin123`,
    '',
    '# --- AI 模型配置 ---',
    '# 注意：开源版不自动提取 API Key，请手动配置',
    '# 任务系统使用 Gateway 进行模型调用，不需要直接配置 API Key',
    '# 如需直接调用模型，请配置以下环境变量：',
    '# MINIMAX_API_KEY=sk-xxx',
    '# UNIONTECH_API_KEY=ut-xxx',
    '# NEWAPI_API_KEY=sk-xxx',
    '',
    '# --- 飞书集成 (可选) ---',
    '# FEISHU_APP_ID=',
    '# FEISHU_APP_SECRET=',
    '',
    '# --- Redis (可选) ---',
    '# REDIS_URL=redis://localhost:6379',
    '',
    '# --- 部署 AES 加密密钥 ---',
    `DEPLOY_AES_SECRET=${require('crypto').randomBytes(16).toString('hex')}`,
    '',
    '# --- 许可证 (可选) ---',
    '# LICENSE_KEY=',
    '# LICENSE_SECRET=',
    '',
    '# --- Agent IM 服务 ---',
    'AGENT_IM_URL=http://localhost:18793',
    'AGENT_WS_URL=ws://localhost:18793',
    '',
    '# --- 工作目录 ---',
    `WORKSPACE_DIR=${workspace}`,
  ];

  return lines.join('\n');
}

// ============ 主流程 ============

function main() {
  console.log('🔍 OpenClaw Task System 自动配置工具\n');

  const ocConfig = findOpenClawConfig();
  
  if (!ocConfig) {
    console.log('⚠️  未找到 OpenClaw 配置文件');
    console.log('   请确保已安装 OpenClaw 或手动配置 .env 文件');
    console.log('   配置文件路径: ~/.openclaw/openclaw.json\n');
    
    const defaultEnv = generateEnv(
      { port: 18789, token: '', mode: 'local', remoteUrl: 'ws://127.0.0.1:18789' },
      { ids: ['main', 'coder', 'deep', 'fast', 'chat'], defaultModel: '' },
      process.cwd()
    );
    
    const envPath = path.join(process.cwd(), '.env');
    fs.writeFileSync(envPath, defaultEnv);
    console.log(`✅ 已生成默认配置: ${envPath}`);
    console.log('   请手动编辑 .env 填入 Gateway Token');
    return;
  }

  console.log(`✅ 找到 OpenClaw 配置: ${ocConfig.path}\n`);

  const gateway = discoverGateway(ocConfig.config);
  const agents = discoverAgents(ocConfig.config);
  const workspace = path.resolve(process.cwd());

  console.log('📋 发现的配置:');
  console.log(`   Gateway 端口: ${gateway.port}`);
  console.log(`   Gateway 模式: ${gateway.mode}`);
  console.log(`   Gateway Token: ${gateway.token ? '已找到 ✅' : '未配置 ⚠️'}`);
  console.log(`   Agent 列表: ${agents.ids.join(', ')}`);
  if (agents.defaultModel) {
    console.log(`   默认模型: ${agents.defaultModel}`);
  }
  console.log('');

  const envContent = generateEnv(gateway, agents, workspace);
  const envPath = path.join(process.cwd(), '.env');
  fs.writeFileSync(envPath, envContent);
  
  console.log(`✅ 已生成配置文件: ${envPath}\n`);

  console.log('📦 初始化数据库...');
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const Database = require('better-sqlite3');
    const dbPath = path.join(dataDir, 'tasks.db');
    const db = new Database(dbPath);
    
    const migrationsDir = path.join(process.cwd(), 'src', 'db', 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const migrations = fs.readdirSync(migrationsDir).sort();
      for (const migration of migrations) {
        const sql = fs.readFileSync(path.join(migrationsDir, migration), 'utf8');
        db.exec(sql);
        console.log(`   ✅ 迁移: ${migration}`);
      }
    }
    db.close();
    console.log(`✅ 数据库已初始化: ${dbPath}\n`);
  } catch (err) {
    console.log(`⚠️  数据库初始化跳过: ${err.message}\n`);
  }

  console.log('🚀 下一步:');
  console.log('   1. 检查 .env 文件确认配置正确');
  console.log('   2. 安装依赖: npm install');
  console.log('   3. 启动服务: npm start');
  console.log('   4. 或 PM2 生产模式: pm2 start ecosystem.config.js');
  console.log(`   5. 访问面板: http://localhost:${gateway.port || 8081}/pages/tasks.html\n`);
  
  if (!gateway.token) {
    console.log('⚠️  警告: 未找到 Gateway Token');
    console.log('   请手动编辑 .env 文件，填入正确的 GATEWAY_TOKEN');
    console.log('   获取方式: 查看 ~/.openclaw/openclaw.json → gateway.auth.token\n');
  }
}

main();
