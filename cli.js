#!/usr/bin/env node
/**
 * 任务系统统一 CLI 入口
 * 
 * 用法:
 *   node cli.js <command> [options]
 * 
 * 或者全局安装后:
 *   task-cli <command> [options]
 * 
 * 命令列表:
 *   setup           生成 .env 配置文件（自动读取 OpenClaw 配置）
 *   configure       配置 OpenClaw 集成（写入 openclaw.json）
 *   sync            同步知识/技能/文档索引
 *   test            测试部署是否正常
 *   start           启动服务
 *   pm2:start       PM2 启动服务
 *   pm2:stop        PM2 停止服务
 *   pm2:restart     PM2 重启服务
 *   pm2:logs        PM2 查看日志
 *   issue:scan      扫描问题并加入修复队列
 *   issue:create    自动创建问题
 *   issue:fix       自动修复问题
 *   check:task      检查任务完整性 <taskId>
 *   check:project   检查项目完整性 <projectId>
 *   evolution       运行自我进化流程
 *   help            显示帮助信息
 * 
 * 示例:
 *   node cli.js setup
 *   node cli.js configure
 *   node cli.js sync
 *   node cli.js issue:scan
 *   node cli.js check:task task-xxx
 */

const { execSync, spawn } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, 'scripts');

const COMMANDS = {
  // 部署运维
  'setup': {
    script: path.join(SCRIPTS_DIR, 'setup.js'),
    desc: '生成 .env 配置文件（自动读取 OpenClaw 配置）'
  },
  'configure': {
    script: path.join(SCRIPTS_DIR, 'configure-openclaw.js'),
    desc: '配置 OpenClaw 集成（写入 openclaw.json）'
  },
  'sync': {
    script: path.join(SCRIPTS_DIR, 'sync-index.js'),
    desc: '同步知识/技能/文档索引'
  },
  'test': {
    script: path.join(SCRIPTS_DIR, 'test-deployment.js'),
    desc: '测试部署是否正常'
  },
  'seed': {
    script: path.join(SCRIPTS_DIR, 'seed-demo-data.js'),
    desc: '填充演示数据（演示环境专用）'
  },
  // 问题管理
  'issue:scan': {
    script: path.join(SCRIPTS_DIR, 'issue-scanner.js'),
    args: ['scan'],
    desc: '扫描问题并加入修复队列'
  },
  'issue:create': {
    script: path.join(SCRIPTS_DIR, 'issue-auto-creator.js'),
    desc: '自动创建问题'
  },
  'issue:fix': {
    script: path.join(SCRIPTS_DIR, 'issue-auto-fixer.js'),
    desc: '自动修复问题'
  },
  'issue:analyze': {
    script: path.join(SCRIPTS_DIR, 'issue-auto-analyzer.js'),
    desc: '自动分析问题'
  },
  'issue:deep-analyze': {
    script: path.join(SCRIPTS_DIR, 'issue-deep-analyzer.js'),
    desc: '深度分析问题'
  },
  // 任务/项目检查
  'check:task': {
    script: path.join(SCRIPTS_DIR, 'task-checklist-check.js'),
    requiresArgs: true,
    desc: '检查任务完整性 <taskId>'
  },
  'check:project': {
    script: path.join(SCRIPTS_DIR, 'project-checklist-check.js'),
    requiresArgs: true,
    desc: '检查项目完整性 <projectId>'
  },
  // 自我进化
  'evolution': {
    script: path.join(SCRIPTS_DIR, 'self-evolution', 'self-evolution-runner.js'),
    desc: '运行自我进化流程'
  },
  'evolution:daily': {
    script: path.join(SCRIPTS_DIR, 'self-evolution', 'daily-review.js'),
    desc: '每日回顾'
  },
  'evolution:knowledge': {
    script: path.join(SCRIPTS_DIR, 'self-evolution', 'knowledge-extractor.js'),
    desc: '知识提取'
  },
  'evolution:workflow': {
    script: path.join(SCRIPTS_DIR, 'self-evolution', 'workflow-converter.js'),
    desc: '知识转化为工作流'
  },
  'evolution:reflection': {
    script: path.join(SCRIPTS_DIR, 'reflection-automation-flow.js'),
    desc: '反思自动化流程'
  },
};

const PM2_COMMANDS = {
  'pm2:start': { cmd: 'pm2 start ecosystem.config.js', desc: 'PM2 启动服务' },
  'pm2:stop': { cmd: 'pm2 stop all', desc: 'PM2 停止服务' },
  'pm2:restart': { cmd: 'pm2 restart ecosystem.config.js', desc: 'PM2 重启服务' },
  'pm2:logs': { cmd: 'pm2 logs', desc: 'PM2 查看日志' },
};

function printHelp() {
  console.log('\n🔧 OpenClaw Task System CLI\n');
  console.log('用法: node cli.js <command> [args]\n');
  
  console.log('📦 部署运维');
  console.log('  setup          生成 .env 配置文件');
  console.log('  configure      配置 OpenClaw 集成');
  console.log('  sync           同步知识/技能/文档索引');
  console.log('  test           测试部署');
  console.log('  seed           填充演示数据（演示环境专用）');
  console.log('  start          启动服务 (npm start)');
  
  console.log('\n⚡ PM2 管理');
  console.log('  pm2:start      启动所有服务');
  console.log('  pm2:stop       停止所有服务');
  console.log('  pm2:restart    重启所有服务');
  console.log('  pm2:logs       查看日志');
  
  console.log('\n🐛 问题管理');
  console.log('  issue:scan     扫描问题');
  console.log('  issue:create   自动创建问题');
  console.log('  issue:fix      自动修复问题');
  console.log('  issue:analyze  自动分析问题');
  
  console.log('\n✅ 检查工具');
  console.log('  check:task     检查任务完整性');
  console.log('  check:project  检查项目完整性');
  
  console.log('\n🔄 自我进化');
  console.log('  evolution      运行自我进化');
  console.log('  evolution:daily      每日回顾');
  console.log('  evolution:knowledge  知识提取');
  console.log('  evolution:workflow   知识转化为工作流');
  
  console.log('\n📖 示例:');
  console.log('  node cli.js setup');
  console.log('  node cli.js configure');
  console.log('  node cli.js sync');
  console.log('  node cli.js seed');
  console.log('  node cli.js check:task task-xxx');
  console.log('  node cli.js issue:scan');
  console.log();
}

function runCommand(name, args) {
  const command = COMMANDS[name];
  if (!command) {
    console.error(`❌ 未知命令: ${name}`);
    console.log('运行 node cli.js help 查看可用命令');
    process.exit(1);
  }
  
  if (command.requiresArgs && args.length === 0) {
    console.error(`❌ 命令 ${name} 需要参数`);
    console.log(`  用法: node cli.js ${name} <参数>`);
    process.exit(1);
  }
  
  const allArgs = [...(command.args || []), ...args];
  
  console.log(`🚀 执行: ${name} ${allArgs.join(' ')}\n`);
  
  const child = spawn('node', [command.script, ...allArgs], {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  child.on('close', (code) => {
    process.exit(code);
  });
}

function runPM2(name) {
  const command = PM2_COMMANDS[name];
  if (!command) return false;
  
  console.log(`🚀 执行: ${name}\n`);
  
  const child = spawn('sh', ['-c', command.cmd], {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  child.on('close', (code) => {
    process.exit(code);
  });
  
  return true;
}

// 主入口
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'help' || command === '-h' || command === '--help') {
  printHelp();
  process.exit(0);
}

// 先检查 PM2 命令
if (PM2_COMMANDS[command]) {
  runPM2(command);
}
// 再检查普通命令
else if (COMMANDS[command]) {
  runCommand(command, args.slice(1));
}
// 特殊处理 start
else if (command === 'start') {
  const child = spawn('node', ['src/server.js'], {
    stdio: 'inherit',
    cwd: __dirname
  });
  child.on('close', (code) => process.exit(code));
}
else {
  console.error(`❌ 未知命令: ${command}`);
  printHelp();
  process.exit(1);
}
