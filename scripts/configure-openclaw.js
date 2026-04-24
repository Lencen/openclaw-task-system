#!/usr/bin/env node
/**
 * OpenClaw 配置同步脚本
 * 
 * 自动配置 OpenClaw 以集成任务系统
 * 添加 Webhook 配置到 openclaw.json
 * 
 * 用法: node scripts/configure-openclaw.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function findOpenClawConfig() {
  const candidates = [
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.openclaw', 'openclaw.json'),
    path.join(process.cwd(), '.openclaw', 'openclaw.json'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function main() {
  console.log('🔧 OpenClaw 任务系统集成配置\n');
  
  // 1. 查找 OpenClaw 配置
  const configPath = findOpenClawConfig();
  
  if (!configPath) {
    console.log('❌ 未找到 OpenClaw 配置文件');
    console.log('   请确保已安装 OpenClaw');
    console.log('   配置文件路径: ~/.openclaw/openclaw.json');
    process.exit(1);
  }
  
  console.log(`✅ 找到配置文件: ${configPath}`);
  
  // 2. 读取配置
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.log(`❌ 配置文件解析失败: ${err.message}`);
    process.exit(1);
  }
  
  // 3. 读取任务系统配置
  const envPath = path.join(process.cwd(), '.env');
  let envConfig = {};
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        envConfig[key.trim()] = value.trim();
      }
    });
  }
  
  const port = envConfig.PORT || '8081';
  const webhookToken = crypto.randomBytes(16).toString('hex');
  
  // 4. 配置任务系统集成
  if (!config.taskSystem) {
    config.taskSystem = {};
  }
  
  config.taskSystem = {
    ...config.taskSystem,
    enabled: true,
    url: `http://localhost:${port}`,
    webhookToken: webhookToken,
    autoCreateTasks: true,
    syncInterval: 30,
    webhookUrl: `http://localhost:${port}/api/webhook/openclaw`
  };
  
  // 5. 保存配置
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`✅ 已更新配置文件`);
  } catch (err) {
    console.log(`❌ 保存配置失败: ${err.message}`);
    process.exit(1);
  }
  
  // 6. 更新任务系统 .env
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // 添加或更新 WEBHOOK_TOKEN
    if (envContent.includes('WEBHOOK_TOKEN=')) {
      envContent = envContent.replace(/WEBHOOK_TOKEN=.*/, `WEBHOOK_TOKEN=${webhookToken}`);
    } else {
      envContent += `\n# Webhook Token (与 OpenClaw 共享)\nWEBHOOK_TOKEN=${webhookToken}\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log(`✅ 已更新 .env 文件`);
  }
  
  // 7. 输出配置信息
  console.log('\n================================');
  console.log('✅ 配置完成！');
  console.log('');
  console.log('📋 配置信息:');
  console.log(`   任务系统 URL: http://localhost:${port}`);
  console.log(`   Webhook URL: http://localhost:${port}/api/webhook/openclaw`);
  console.log(`   Webhook Token: ${webhookToken}`);
  console.log(`   自动创建任务: 是`);
  console.log(`   同步间隔: 30 秒`);
  console.log('');
  console.log('🔄 下一步:');
  console.log('   1. 重启 OpenClaw Gateway');
  console.log('   2. 重启任务系统');
  console.log('   3. 发送测试消息验证集成');
  console.log('================================');
}

main();
