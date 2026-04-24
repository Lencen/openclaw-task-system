/**
 * 演示数据种子脚本 v2
 * 
 * 用途：为演示环境填充示例数据
 * 运行：node scripts/seed-demo-data.js
 * 
 * 通过 API 创建数据，自动适配数据库结构
 */

const http = require('http');
const path = require('path');

// 读取配置
const PORT = process.env.PORT || 8081;
const BASE_URL = `http://localhost:${PORT}`;

function apiRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
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
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function seed() {
  console.log('🌱 开始填充演示数据...\n');
  console.log(`📡 连接到: ${BASE_URL}\n`);

  // 检查服务是否可用
  try {
    const status = await apiRequest('GET', '/api/tasks');
    if (!status.success) {
      console.log('❌ 服务不可用，请先启动服务: npm start');
      process.exit(1);
    }
  } catch (e) {
    console.log('❌ 无法连接到服务，请先启动: npm start');
    console.log(`   错误: ${e.message}`);
    process.exit(1);
  }

  // ========== 1. 创建任务 ==========
  console.log('📋 创建示例任务...');

  const tasks = [
    // 已完成任务
    {
      title: '登录页面设计与实现',
      description: '开发任务管理系统的登录页面，支持用户名密码登录和记住我功能',
      priority: 'P1',
      quadrant: 1,
      status: 'done',
      assigned_agent: 'coder',
      completed_at: daysAgo(1),
      created_at: daysAgo(7),
      analysis: { thought: '这是一个前端开发任务，需要设计美观的登录界面，实现表单验证和登录逻辑。使用统一框架，不创建 Vue 应用。' },
      breakdown: { steps: [
        { id: 'step-1', title: '设计登录页布局', status: 'done', order: 1 },
        { id: 'step-2', title: '实现表单验证', status: 'done', order: 2 },
        { id: 'step-3', title: '对接登录 API', status: 'done', order: 3 },
        { id: 'step-4', title: '添加记住我功能', status: 'done', order: 4 }
      ]},
      reflection: { status: 'completed', content: '登录页面完成后发现统一框架的表单组件很好用，下次可以直接复用。' }
    },
    {
      title: 'Agent 通信系统优化',
      description: '优化 Agent 间的消息路由，减少延迟，提高消息投递成功率',
      priority: 'P1',
      quadrant: 1,
      status: 'done',
      assigned_agent: 'main',
      completed_at: daysAgo(3),
      created_at: daysAgo(10),
      analysis: { thought: 'Agent 通信是系统核心功能，当前消息投递成功率不够高，需要优化重试机制和消息队列。' },
      breakdown: { steps: [
        { id: 'step-1', title: '分析当前消息投递瓶颈', status: 'done', order: 1 },
        { id: 'step-2', title: '实现消息重试机制', status: 'done', order: 2 },
        { id: 'step-3', title: '优化 WebSocket 连接池', status: 'done', order: 3 }
      ]},
      reflection: { status: 'completed', content: '通过优化消息重试和连接池，消息投递率从 92% 提升到 99.5%。' }
    },
    {
      title: '飞书自动化报告功能',
      description: '实现定时向飞书发送任务状态报告，包含任务统计、Agent 状态和异常告警',
      priority: 'P2',
      quadrant: 2,
      status: 'done',
      assigned_agent: 'office',
      completed_at: daysAgo(5),
      created_at: daysAgo(14),
      analysis: { thought: '飞书报告功能可以让用户随时了解系统状态，不需要手动查看面板。' },
      reflection: { status: 'completed', content: '飞书卡片消息比纯文本美观很多，值得花时间适配。' }
    },
    // 进行中任务
    {
      title: '任务看板视图开发',
      description: '开发看板视图，支持拖拽卡片改变任务状态，直观展示任务流转',
      priority: 'P2',
      quadrant: 2,
      status: 'doing',
      assigned_agent: 'coder',
      created_at: daysAgo(3),
      analysis: { thought: '看板视图是任务管理的核心功能，需要实现流畅的拖拽体验。' },
      breakdown: { steps: [
        { id: 'step-1', title: '设计看板布局', status: 'done', order: 1 },
        { id: 'step-2', title: '实现拖拽功能', status: 'doing', order: 2 },
        { id: 'step-3', title: '状态变更同步', status: 'pending', order: 3 }
      ]}
    },
    {
      title: 'AI 模型路由优化',
      description: '根据任务类型自动选择最优模型，提高任务处理质量和速度',
      priority: 'P1',
      quadrant: 1,
      status: 'doing',
      assigned_agent: 'deep',
      created_at: daysAgo(2),
      analysis: { thought: '不同任务适合不同模型，开发任务用编码模型，分析任务用深度分析模型。' },
      breakdown: { steps: [
        { id: 'step-1', title: '分析各模型能力特点', status: 'done', order: 1 },
        { id: 'step-2', title: '建立路由规则引擎', status: 'doing', order: 2 },
        { id: 'step-3', title: '实现自动选择逻辑', status: 'pending', order: 3 }
      ]}
    },
    {
      title: '系统性能监控面板',
      description: '创建实时监控面板，展示 CPU、内存、磁盘、任务队列等关键指标',
      priority: 'P2',
      quadrant: 2,
      status: 'doing',
      assigned_agent: 'coder',
      created_at: daysAgo(4),
      analysis: { thought: '需要一个直观的监控面板来展示系统运行状态，帮助快速定位问题。' },
      breakdown: { steps: [
        { id: 'step-1', title: '采集系统指标', status: 'done', order: 1 },
        { id: 'step-2', title: '设计监控面板 UI', status: 'doing', order: 2 }
      ]}
    },
    // 待处理任务
    {
      title: '知识库搜索功能增强',
      description: '支持语义搜索、标签过滤、全文检索，提升知识检索效果',
      priority: 'P2',
      quadrant: 2,
      status: 'pending',
      assigned_agent: 'deep',
      created_at: daysAgo(1),
      analysis: { thought: '当前知识搜索只是简单匹配，需要升级到语义搜索。' }
    },
    {
      title: '任务模板系统',
      description: '创建常用任务模板，快速发起标准化任务，减少重复配置',
      priority: 'P3',
      quadrant: 4,
      status: 'pending',
      assigned_agent: 'coder',
      created_at: daysAgo(1),
      analysis: { thought: '很多任务类型重复出现，可以通过模板快速创建。' }
    },
    {
      title: '自动化工作流编排器',
      description: '可视化编排自动化工作流，支持条件分支、并行执行、错误处理',
      priority: 'P1',
      quadrant: 1,
      status: 'pending',
      assigned_agent: 'main',
      created_at: daysAgo(0),
      analysis: { thought: '需要一个可视化编排工具，让用户可以自定义自动化流程。' }
    },
    {
      title: 'Agent 技能市场',
      description: '建立技能市场，支持安装、更新、发布 Agent 技能，形成生态',
      priority: 'P2',
      quadrant: 2,
      status: 'pending',
      assigned_agent: 'office',
      created_at: daysAgo(0),
      analysis: { thought: '技能市场可以让用户发现和安装有用的技能，扩展 Agent 能力。' }
    },
    // 高优先级任务
    {
      title: '数据安全与备份',
      description: '实现数据库自动备份、恢复功能，保障数据安全',
      priority: 'P0',
      quadrant: 1,
      status: 'doing',
      assigned_agent: 'coder',
      created_at: daysAgo(2),
      analysis: { thought: '数据安全是基础，必须有自动备份和恢复机制。' },
      breakdown: { steps: [
        { id: 'step-1', title: '设计备份策略', status: 'done', order: 1 },
        { id: 'step-2', title: '实现定时备份', status: 'doing', order: 2 }
      ]}
    },
    // 失败任务
    {
      title: '文档自动生成',
      description: '根据代码变更自动生成 API 文档和更新日志',
      priority: 'P2',
      quadrant: 3,
      status: 'failed',
      assigned_agent: 'deep',
      created_at: daysAgo(6),
      failed_at: daysAgo(4),
      failed_reason: 'API 文档生成需要理解代码结构，当前 AI 模型对复杂代码的理解能力不足，需要等待模型升级。',
      analysis: { thought: '自动文档生成可以提高效率，但当前 AI 生成质量不稳定。' }
    }
  ];

  let createdTasks = 0;
  const statusCounts = { done: 0, doing: 0, pending: 0, failed: 0 };

  for (const task of tasks) {
    try {
      const result = await apiRequest('POST', '/api/tasks', task);
      if (result.success) {
        createdTasks++;
        statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
      }
    } catch (e) {
      console.log(`   ⚠️ 创建失败: ${task.title} - ${e.message}`);
    }
  }

  console.log(`   ✅ 创建了 ${createdTasks} 个任务`);
  console.log(`   📊 分布: done=${statusCounts.done} doing=${statusCounts.doing} pending=${statusCounts.pending} failed=${statusCounts.failed}`);

  // ========== 2. 测试 from-chat 接口 ==========
  console.log('\n💬 测试任务意图检测...');
  try {
    const result = await apiRequest('POST', '/api/tasks/from-chat', {
      message: '帮我做一个用户管理系统',
      sourceChannel: 'feishu'
    });
    console.log(`   ✅ from-chat 正常: isTask=${result.isTask}`);
  } catch (e) {
    console.log(`   ⚠️ from-chat: ${e.message}`);
  }

  // ========== 3. 创建问题 ==========
  console.log('\n🐛 创建示例问题...');
  const issues = [
    {
      title: 'Agent 通信偶发丢消息',
      description: '在高负载情况下，Agent 间通信偶尔会丢失消息',
      priority: 'P1',
      type: 'bug',
      status: 'open'
    },
    {
      title: '飞书卡片消息渲染异常',
      description: '当报告内容包含特殊字符时，飞书卡片消息渲染不完整',
      priority: 'P2',
      type: 'bug',
      status: 'open'
    },
    {
      title: '任务创建接口偶发超时',
      description: '当同时创建多个任务时，部分请求会超时',
      priority: 'P1',
      type: 'bug',
      status: 'open'
    }
  ];

  let createdIssues = 0;
  for (const issue of issues) {
    try {
      const result = await apiRequest('POST', '/api/issues', issue);
      if (result.success) createdIssues++;
    } catch (e) {
      // issues API might not exist
    }
  }
  if (createdIssues > 0) {
    console.log(`   ✅ 创建了 ${createdIssues} 个问题`);
  } else {
    console.log('   ℹ️ 问题 API 不可用（不影响演示）');
  }

  // ========== 4. 最终统计 ==========
  console.log('\n📊 数据统计:');
  try {
    const result = await apiRequest('GET', '/api/tasks');
    if (result.success && result.tasks) {
      const byStatus = {};
      result.tasks.forEach(t => {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      });
      console.log(`   总任务: ${result.tasks.length}`);
      Object.entries(byStatus).forEach(([s, c]) => console.log(`     ${s}: ${c}`));
    }
  } catch (e) {
    console.log(`   ⚠️ 无法获取统计: ${e.message}`);
  }

  console.log('\n✅ 演示数据填充完成！');
  console.log(`\n🌐 访问: ${BASE_URL}/pages/tasks.html`);
  console.log('   默认账号: admin@taskplatform.com / admin123\n');
}

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

// 执行
seed().catch(err => {
  console.error('❌ 演示数据填充失败:', err.message);
  process.exit(1);
});
