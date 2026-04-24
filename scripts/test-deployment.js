#!/usr/bin/env node
/**
 * 部署验证脚本
 * 
 * 验证任务系统部署后所有功能是否正常
 * 
 * 用法: node scripts/test-deployment.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TEST_URL || 'http://localhost:8082';

function request(method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('🧪 部署验证测试\n');
  console.log(`测试地址: ${BASE_URL}\n`);
  
  const results = [];
  
  // 1. 健康检查
  results.push(await test('健康检查 (/health)', async () => {
    const res = await request('GET', '/health');
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!res.data.status) throw new Error('无 status 字段');
  }));
  
  // 2. 任务列表
  results.push(await test('任务列表 (/api/tasks)', async () => {
    const res = await request('GET', '/api/tasks');
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!res.data.success) throw new Error('success=false');
  }));
  
  // 3. 创建任务
  let testTaskId = null;
  results.push(await test('创建任务 (POST /api/tasks)', async () => {
    const res = await request('POST', '/api/tasks', {
      title: '部署测试任务',
      description: '验证任务创建功能',
      priority: 'P2',
      assigned_agent: 'main'
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!res.data.success) throw new Error('创建失败');
    if (!res.data.task) throw new Error('无 task 字段');
    testTaskId = res.data.task.id; // 使用服务器返回的 ID
  }));
  
  // 4. 获取刚创建的任务
  results.push(await test('获取任务详情', async () => {
    const res = await request('GET', `/api/tasks/${testTaskId}`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!res.data.task) throw new Error('无 task 字段');
    if (res.data.task.title !== '部署测试任务') throw new Error('标题不匹配');
  }));
  
  // 5. 更新任务状态（pending → assigned → doing）
  results.push(await test('更新任务状态 (pending→assigned)', async () => {
    const res = await request('PUT', `/api/tasks/${testTaskId}`, {
      status: 'assigned'
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!res.data.success) throw new Error('更新失败');
  }));
  
  results.push(await test('更新任务状态 (assigned→doing)', async () => {
    const res = await request('PUT', `/api/tasks/${testTaskId}`, {
      status: 'doing'
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!res.data.success) throw new Error('更新失败');
  }));
  
  // 6. 完成任务（doing → completed → done）
  results.push(await test('完成任务 (doing→completed)', async () => {
    const res = await request('PUT', `/api/tasks/${testTaskId}`, {
      status: 'completed'
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!res.data.success) throw new Error('状态更新失败');
  }));
  
  // 设置反思内容（required for done）
  results.push(await test('设置任务反思', async () => {
    const res = await request('PUT', `/api/tasks/${testTaskId}`, {
      reflection: {
        content: '任务完成反思',
        thought: '执行顺利',
        status: 'completed'
      }
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  }));
  
  results.push(await test('完成任务 (completed→done)', async () => {
    const res = await request('PUT', `/api/tasks/${testTaskId}`, {
      status: 'done'
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!res.data.success) throw new Error('完成失败');
  }));
  
  // 7. 页面访问
  const pages = ['tasks.html', 'monitor.html', 'queue.html', 'task-detail.html'];
  for (const page of pages) {
    results.push(await test(`页面访问 (/${page})`, async () => {
      const res = await request('GET', `/${page}`);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      if (!res.data.includes('<html')) throw new Error('非 HTML 内容');
    }));
  }
  
  // 8. 静态资源
  const resources = ['css/frame.css', 'css/sidebar.css', 'js/sidebar.js'];
  for (const res of resources) {
    results.push(await test(`静态资源 (/${res})`, async () => {
      const response = await request('GET', `/${res}`);
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    }));
  }
  
  // 9. 配置检查
  results.push(await test('配置检查 (.env)', async () => {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) throw new Error('.env 不存在');
    
    const env = fs.readFileSync(envPath, 'utf8');
    if (!env.includes('GATEWAY_PORT')) throw new Error('无 GATEWAY_PORT');
    if (!env.includes('AGENT_LIST')) throw new Error('无 AGENT_LIST');
  }));
  
  // 10. 模型配置
  results.push(await test('模型配置检查', async () => {
    const envPath = path.join(process.cwd(), '.env');
    const env = fs.readFileSync(envPath, 'utf8');
    if (!env.includes('DEFAULT_MODEL')) throw new Error('无 DEFAULT_MODEL');
    
    const match = env.match(/DEFAULT_MODEL=(.+)/);
    if (!match) throw new Error('模型配置格式错误');
    console.log(`     模型: ${match[1]}`);
  }));
  
  // 总结
  console.log('\n================================');
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`测试结果: ${passed}/${total} 通过`);
  
  if (passed === total) {
    console.log('✅ 所有测试通过！部署成功！');
  } else {
    console.log('❌ 部分测试失败，请检查日志');
    process.exit(1);
  }
  console.log('================================');
}

main().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
