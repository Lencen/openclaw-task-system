/**
 * 任务系统 Server - 最小化版本
 * 包含：任务 CRUD + notify-agent API
 * 
 * 2026-04-06 更新：使用数据库存储，与 auto-task-assigner 统一
 * 2026-04-08 更新：集成 Reflection 自动化流程
 */

const express = require('express');
require('dotenv').config({ path: __dirname + '/../.env' });
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

// 引入数据库模块
const db = require('./db');

// 引入任务完成 Hook
const TaskCompletionHook = require('./hooks/task-completion-hook');

/**
 * NOTE: 反思数据目前存储在任务对象的 reflection 字段中，而不是单独的表中
 * 因为我们使用了数据库抽象层，无法直接执行 SQL 查询
 */


const taskCompletionHook = new TaskCompletionHook();

const app = express();
const PORT = process.env.PORT || 8081;
const DATA_DIR = path.join(__dirname, 'data');
const PENDING_ASSIGNMENTS_FILE = path.join(DATA_DIR, 'pending-assignments.jsonl');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// 启用 keep-alive
app.use((req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=60, max=100');
  next();
});

// 静态文件服务（public 目录）
app.use(express.static(path.join(__dirname, '..', 'pages')));
app.use('/pages', express.static(path.join(__dirname, '..', 'pages')));

// 根路由 → index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'pages', 'tasks.html'));
});

// 辅助函数（仅用于非任务数据）
const readJSON = (file, defaultVal) => {
  if (!fs.existsSync(file)) return defaultVal;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return defaultVal; }
};
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

app.use(cors());
app.use(bodyParser.json());

// --- Federation API ---
const federationChannelApi = require('./routes/federation-channel-api');
app.use('/api/federation', federationChannelApi);

// --- OpenClaw Webhook API ---
const webhookApi = require('./routes/webhook-api');
app.use('/api/webhook', webhookApi);



// --- Issue API ---
const issueApi = require('./routes/issue-api');
app.use('/api/issue', issueApi);

const issuesApi = require('./routes/issues-api');
app.use('/api/issues', issuesApi);

// --- Auth API ---
const authApi = require('./routes/auth-api');
app.use('/api/auth', authApi);

// // 加载完整路由 (disabled - module path issues)（知识、技能、项目、自动化、监控等）
// const fullRoutes = require("./routes/index");
// fullRoutes(app);

// --- 任务 API ---

// GET /api/tasks - 获取任务列表
app.get('/api/tasks', async (req, res) => {
  try {
    // 使用数据库查询
    let tasks = await db.tasks.list({});
    
    // 默认过滤掉 completed/archived
    const includeCompleted = req.query.includeCompleted === 'true';
    if (!includeCompleted) {
      tasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'archived');
    }
    
    res.json({ success: true, tasks });
  } catch (error) {
    console.error('[TaskSystem] 获取任务列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tasks - 创建任务
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, priority, assigned_agent } = req.body;
    const task = {
      id: `task-${uuidv4()}`,
      title,
      description: description || '',
      priority: priority || 'P2',
      status: 'pending',
      assigned_agent: assigned_agent || null,
      created_at: new Date().toISOString()
    };
    
    // 使用数据库创建任务
    await db.tasks.create(task);
    
    res.json({ success: true, task });
  } catch (error) {
    console.error('[TaskSystem] 创建任务失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/tasks/:id - 获取任务详情
// 从聊天消息自动创建任务（必须在 /:id 路由之前）
const tasksFromChatSQLiteRouter = require('./routes/tasks-from-chat-sqlite');
app.use('/api/tasks/from-chat', tasksFromChatSQLiteRouter);
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const task = await db.tasks.get(id);
    
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    
    res.json({ success: true, task });
  } catch (error) {
    console.error('[TaskSystem] 获取任务详情失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/tasks/:id - 更新任务
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // 从数据库获取任务
    const task = await db.tasks.get(id);
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    
    const oldStatus = task.status;
    const newStatus = updates.status;
    
    // 检查是否尝试将任务标记为 'done'，但在完成反思之前
    if (newStatus === 'done') {
      // 从数据库检查任务反思状态
      // 从任务本身的 reflection 字段获取反思状态
      const reflection = task.reflection;
      
      // 如果任务没有反思记录，或者反思未完成，则拒绝设置为 done
      if (!reflection || reflection.status !== 'completed') {
        return res.status(400).json({ 
          success: false, 
          error: '任务必须完成反思后才能标记为 done',
          reason: '任务需要先完成反思流程',
          suggestion: '请先完成任务的反思，然后再将任务标记为 done',
          reflection_status: reflection ? reflection.status : 'none'
        });
      }
    }
    
    // 使用数据库更新任务
    await db.tasks.update(id, updates);
    
    // 检查任务状态变更是否需要特殊处理
    if (oldStatus !== newStatus) {
      console.log(`[TaskSystem] 任务 ${id} 状态变更: ${oldStatus} → ${newStatus}`);
      
      // 检查是否为任务完成状态变更
      if (oldStatus !== 'completed' && oldStatus !== 'reflection_pending' && newStatus === 'completed') {
        // 使用任务完成 Hook 处理完成逻辑
        const hookResult = await taskCompletionHook.onTaskCompleted(id, task, updates);
        
        if (hookResult.hookTriggered && hookResult.reflectionStarted) {
          console.log(`[TaskSystem] 任务 ${id} 反思流程已启动`);
          
          // 将任务状态临时设为 reflection_pending，直到反思完成
          await db.tasks.update(id, {
            status: 'reflection_pending',
            reflection_pending_at: new Date().toISOString()
          });
        } else {
          console.log(`[TaskSystem] 任务 ${id} 反思流程未启动:`, hookResult.reason || hookResult.error);
          
          // 如果反思未启动，但仍需完成任务，则直接设为完成
          await db.tasks.update(id, { 
            status: 'completed',
            completed_at: new Date().toISOString()
          });
        }
      }
    }
    
    // 检查是否刚刚进入 reflection_pending 状态
    const currentTask = await db.tasks.get(id);
    if (oldStatus !== 'reflection_pending' && currentTask.status === 'reflection_pending') {
      triggerReflectionAgent(id, currentTask);
    }
    
    res.json({ success: true, task: currentTask });
  } catch (error) {
    console.error('[TaskSystem] 更新任务失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Reflection 触发器 ====================

/**
 * 触发 Agent 做反思
 * 写入 pending_assignments，Heartbeat 会检测到并启动 subagent
 */
function triggerReflectionAgent(taskId, task) {
  try {
    const assignment = {
      id: `ref-${Date.now()}`,
      taskId: taskId,
      agentId: 'main',  // 让 main agent 做反思
      taskTitle: `【反思】${task.title}`,
      taskDescription: `分析任务 "${task.title}" (${taskId}) 的执行情况，填写反思内容。\n\n任务信息：\n- 描述：${task.description || '无'}\n- 执行日志：${JSON.stringify(task.execution_log || [])}\n- 错误记录：${JSON.stringify(task.errors || [])}\n- 步骤：${JSON.stringify(task.steps || [])}\n\n请分析以上信息，填写反思内容。`,
      priority: task.priority || 'P2',
      type: 'reflection',  // 标记为反思任务
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    
    // 追加到 pending-assignments.jsonl
    fs.appendFileSync(PENDING_ASSIGNMENTS_FILE, JSON.stringify(assignment) + '\n');
    
    console.log(`[Reflection] ✅ 已触发 Agent 做反思: ${taskId}`);
    return true;
  } catch (error) {
    console.error(`[Reflection] ❌ 触发反思失败: ${error.message}`);
    return false;
  }
}

// 生成反思模板
function generateReflectionTemplate(task) {
  return {
    title: task.title,
    taskId: task.id,
    status: task.status,
    completedAt: task.completed_at,
    questions: [
      { id: 'q1', category: '任务目标', content: '本次任务的核心目标是什么？是否达成？', answer: '' },
      { id: 'q2', category: '执行过程', content: '执行过程中遇到了哪些问题？是如何解决的？', answer: '' },
      { id: 'q3', category: '结果评估', content: '任务结果是否符合预期？有哪些可以改进的地方？', answer: '' },
      { id: 'q4', category: '经验总结', content: '本次任务中学到了什么？有哪些最佳实践可以复用？', answer: '' },
      { id: 'q5', category: '未来计划', content: '针对本次任务的反思，未来有哪些改进计划？', answer: '' }
    ],
    createdAt: new Date().toISOString()
  };
}

// GET /api/reflection/pending - 获取待反思任务列表
app.get('/api/reflection/pending', async (req, res) => {
  try {
    // 从数据库获取任务
    const allTasks = await db.tasks.list({});
    
    const pendingTasks = allTasks.filter(t => {
      // 从任务本身的 reflection 字段获取反思状态
      const reflection = t.reflection;
      return t.status === 'completed' && (!reflection || reflection.status === 'pending');
    }).map(t => ({
      id: t.id,
      title: t.title,
      reflection_status: 'pending',
      status: t.status,
      created_at: t.created_at
    }));
    
    res.json({ success: true, data: { total: pendingTasks.length, tasks: pendingTasks } });
  } catch (error) {
    console.error('[Reflection] 获取待反思任务列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/reflection/task/:taskId - 获取任务反思
app.get('/api/reflection/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // 从数据库获取任务
    const task = await db.tasks.get(taskId);
    
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    
    // 从任务本身的 reflection 字段获取反思
    const reflection = task.reflection;
    
    if (!reflection) {
      const template = generateReflectionTemplate(task);
      res.json({ success: true, data: { template, isNew: true } });
      return;
    }
    
    res.json({ success: true, data: reflection });
  } catch (error) {
    console.error('[Reflection] 获取任务反思失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/reflection/task/:taskId - 创建或更新反思
app.post('/api/reflection/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { content, status = 'in_progress', template, skippedReason, autoComplete = true } = req.body;
    
    // 从数据库获取任务
    const task = await db.tasks.get(taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    
    const now = new Date().toISOString();
    
    // 从任务本身的 reflection 字段检查是否存在反思记录
    const existingReflection = task.reflection ? { id: task.id } : null;
    
    // 直接更新任务的 reflection 字段，而不是操作独立的 task_reflections 表
    const reflection = {
      id: task.reflection?.id || `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: status,
      content: content,
      template: template,
      triggered_at: task.reflection?.triggered_at || now,
      updated_at: now,
      skipped_reason: skippedReason
    };
    
    // 更新任务的 reflection 和 reflection_status 字段
    const reflectionStatus = status === 'completed' || status === 'skipped' ? status : 'in_progress';
    await db.tasks.update(taskId, { 
      reflection: reflection,
      reflection_status: reflectionStatus 
    });
    
    // 如果 reflection 完成且 autoComplete 为 true，自动将任务设为 done
    if (status === 'completed' && autoComplete) {
      await db.tasks.update(taskId, { status: 'done' });
      console.log(`[Reflection API] ✅ 任务 ${taskId} 的 reflection 完成，自动设为 done`);
    }
    
    console.log(`[Reflection API] 任务 ${taskId} 的 reflection 已更新: ${status}`);
    
    // 获取更新后的任务（反思数据已存储在任务中）
    const updatedTask = await db.tasks.get(taskId);
    const updatedReflection = updatedTask.reflection;
    
    res.json({ success: true, task: updatedTask, data: updatedReflection });
  } catch (error) {
    console.error('[Reflection] 更新反思失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/reflection/task/:taskId/status - 获取任务反思状态
app.get('/api/reflection/task/:taskId/status', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // 从数据库获取任务
    const task = await db.tasks.get(taskId);
    
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    
    // 从任务本身的 reflection 字段获取反思
    const reflection = task.reflection;
    
    res.json({ success: true, data: {
      taskId,
      reflectionStatus: task.reflection_status || 'none',
      reflection: reflection || null
    }});
  } catch (error) {
    console.error('[Reflection] 获取反思状态失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 加载任务反思API路由
const taskReflectionApi = require('./routes/task-reflection-api');
app.use('/api/tasks', taskReflectionApi);

// --- 通知 Agent API (第 1 层 Federation) ---
app.post('/api/tasks/notify-agent', async (req, res) => {
  try {
    const { taskId, agentId, taskTitle, taskDescription } = req.body;
    
    if (!taskId || !agentId || !taskTitle) {
      return res.status(400).json({ success: false, error: '缺少必填字段' });
    }
    
    console.log(`[Notify] 通知 ${agentId} 有新任务：${taskTitle}`);
    
    // ✅ 通过 agent-im-server 的 /api/message 发送 Federation 消息
    // agent-im-server 会转发给目标 Agent，如果离线则自动启动
    const postData = JSON.stringify({
      to: `agent:${agentId}`,
      type: 'task_assignment',
      task: {
        id: taskId,
        title: taskTitle,
        description: taskDescription || '无'
      }
    });
    
    const options = {
      hostname: 'localhost',
      port: 18790,  // agent-im-server 端口
      path: '/api/message',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    return new Promise((resolve) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            console.log(`[Notify] 结果：`, result);
            resolve({ success: true, message: '通知已发送', data: result });
          } catch (e) {
            console.log(`[Notify] 解析失败：`, e.message);
            resolve(res.json({ success: true, message: '通知已记录' }));
          }
        });
      });
      req.on('error', (e) => {
        console.log(`[Notify] 请求失败：`, e.message);
        resolve(res.json({ success: false, error: e.message }));
      });
      req.setTimeout(10000, () => {
        req.destroy();
        resolve(res.json({ success: false, error: 'Timeout' }));
      });
      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.error('[Notify] 通知失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Agent 任务队列 API - agent-listener 轮询此 API 获取分配的任务
app.get('/api/agents/:agentId/queue', async (req, res) => {
  const { agentId } = req.params;
  
  try {
    // 从 pending_assignments 获取分配给该 Agent 的任务
    const tasks = db.pendingAssignments.listByAgent(agentId);
    
    // 兼容 pollQueue 期望的格式：hasTask + current
    const currentTask = tasks.length > 0 ? tasks[0] : null;
    
    res.json({
      success: true,
      hasTask: !!currentTask,
      current: currentTask ? {
        id: currentTask.id,
        taskId: currentTask.taskId,
        title: currentTask.taskTitle,
        description: currentTask.taskDescription,
        status: currentTask.status,
        createdAt: currentTask.createdAt
      } : null,
      count: tasks.length,
      tasks: tasks  // 保留完整列表
    });
    
  } catch (error) {
    console.error(`[Queue API] 错误:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 标记任务已处理（从队列中取出）
app.post('/api/agents/:agentId/queue/:assignmentId/process', async (req, res) => {
  const { agentId, assignmentId } = req.params;
  
  try {
    // 更新状态为 processing
    db.pendingAssignments.updateStatus(assignmentId, 'processing', new Date().toISOString());
    
    res.json({ success: true, message: '任务已标记为处理中' });
    
  } catch (error) {
    console.error(`[Queue Process API] 错误:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// 启动服务

// ========== Demo Stub APIs ==========

// GET /api/agents/status - Agent 状态
app.get('/api/agents/status', (req, res) => {
  res.json({ success: true, agents: [
    { id: 'agent-main', name: '总控 Agent', icon: '🤖', role: '总控', status: 'online', model: 'qwen-coding/qwen3.6-plus', tasks_completed: 156, last_active: new Date().toISOString() },
    { id: 'agent-coder', name: '编码 Agent', icon: '💻', role: '编码', status: 'online', model: 'qwen-coding/qwen3-coder-next', tasks_completed: 89, last_active: new Date().toISOString() },
    { id: 'agent-deep', name: '深度分析 Agent', icon: '🧠', role: '深度分析', status: 'online', model: 'qwen-coding/qwen3-coder-plus', tasks_completed: 42, last_active: new Date().toISOString() },
    { id: 'agent-fast', name: '快速响应 Agent', icon: '⚡', role: '快速响应', status: 'idle', model: 'qwen-coding/qwen3.6-plus', tasks_completed: 203, last_active: new Date().toISOString() },
    { id: 'agent-chat', name: '对话 Agent', icon: '💬', role: '对话', status: 'online', model: 'qwen-coding/qwen3.6-plus', tasks_completed: 78, last_active: new Date().toISOString() },
    { id: 'agent-office', name: '办公 Agent', icon: '📊', role: '办公', status: 'offline', model: 'qwen-coding/qwen3.6-plus', tasks_completed: 34, last_active: new Date(Date.now() - 2*24*3600*1000).toISOString() }
  ]});
});

// GET /api/agents/list
app.get('/api/agents/list', (req, res) => {
  res.json({ success: true, agents: [
    { id: 'main', name: '总控 Agent', icon: '🤖', status: 'online' },
    { id: 'coder', name: '编码 Agent', icon: '💻', status: 'online' },
    { id: 'deep', name: '深度分析 Agent', icon: '🧠', status: 'online' },
    { id: 'fast', name: '快速响应 Agent', icon: '⚡', status: 'idle' },
    { id: 'chat', name: '对话 Agent', icon: '💬', status: 'online' },
    { id: 'office', name: '办公 Agent', icon: '📊', status: 'offline' }
  ]});
});

// GET /api/system/stats
app.get('/api/system/stats', (req, res) => {
  res.json({
    cpu_usage: 23.5,
    memory_usage: 42.1,
    disk_usage: 18,
    uptime: 86400,
    tasks_total: 14,
    tasks_active: 5,
    agents_online: 4,
    uptime_human: '1 天'
  });
});

// GET /api/monitor/token-usage
app.get('/api/monitor/token-usage', (req, res) => {
  res.json({ success: true, total_tokens: 1250000, daily_usage: [
    { date: new Date(Date.now()-5*86400000).toISOString().slice(0,10), tokens: 180000 },
    { date: new Date(Date.now()-4*86400000).toISOString().slice(0,10), tokens: 220000 },
    { date: new Date(Date.now()-3*86400000).toISOString().slice(0,10), tokens: 195000 },
    { date: new Date(Date.now()-2*86400000).toISOString().slice(0,10), tokens: 310000 },
    { date: new Date(Date.now()-86400000).toISOString().slice(0,10), tokens: 280000 },
    { date: new Date().toISOString().slice(0,10), tokens: 65000 }
  ]});
});

// GET /api/scenarios
app.get('/api/scenarios', (req, res) => {
  res.json({ success: true, scenarios: [
    { id: 'sc-1', name: '任务管理系统', description: 'OpenClaw AI Agent 任务管理平台', status: 'active', tasks: 14 },
    { id: 'sc-2', name: '知识库系统', description: '三层架构知识库管理', status: 'active', tasks: 8 },
    { id: 'sc-3', name: '飞书集成', description: '消息通知、文档同步、自动化报告', status: 'active', tasks: 6 }
  ]});
});

// GET /api/projects
app.get('/api/projects', (req, res) => {
  res.json({ success: true, projects: [
    { id: 'proj-1', name: 'OpenClaw 任务系统 V2', description: '任务管理系统开源版本', status: 'active', progress: 85, total_tasks: 45, completed_tasks: 38, owner: '顾良晨', created_at: new Date(Date.now()-30*86400000).toISOString() },
    { id: 'proj-2', name: '知识库系统', description: 'HOT/WARM/COLD三层知识库', status: 'active', progress: 72, total_tasks: 28, completed_tasks: 20, owner: '顾良晨', created_at: new Date(Date.now()-20*86400000).toISOString() },
    { id: 'proj-3', name: '飞书自动化集成', description: '飞书消息通知与自动化报告', status: 'active', progress: 60, total_tasks: 15, completed_tasks: 9, owner: '顾良晨', created_at: new Date(Date.now()-15*86400000).toISOString() }
  ]});
});

// GET /api/knowledge/stats
app.get('/api/knowledge/stats', (req, res) => {
  res.json({ success: true, stats: {
    total: 156, hot: 23, warm: 67, cold: 66,
    categories: ['技术文档', '产品需求', '运维指南', '开发规范', 'API文档']
  }});
});

// GET /api/knowledge/warm/list
app.get('/api/knowledge/warm/list', (req, res) => {
  res.json({ success: true, folders: [
    { name: 'Agent 通信', count: 12, updated: '2026-04-22' },
    { name: '任务系统', count: 18, updated: '2026-04-23' },
    { name: '飞书集成', count: 8, updated: '2026-04-21' },
    { name: '部署运维', count: 15, updated: '2026-04-24' },
    { name: 'API 文档', count: 10, updated: '2026-04-20' },
    { name: '自我进化', count: 4, updated: '2026-04-19' }
  ]});
});

// GET /api/knowledge/hot/list
app.get('/api/knowledge/hot/list', (req, res) => {
  res.json({ success: true, items: [
    { title: '任务意图检测规则', category: '技术文档', views: 245, updated: '2026-04-24' },
    { title: 'OpenClaw 集成指南', category: 'API文档', views: 189, updated: '2026-04-23' },
    { title: 'Agent 联邦通信协议', category: '技术文档', views: 156, updated: '2026-04-22' },
    { title: '修复队列联动机制', category: '运维指南', views: 134, updated: '2026-04-24' },
    { title: '反思自动化流程', category: '开发规范', views: 98, updated: '2026-04-21' }
  ]});
});

// GET /api/memory/list
app.get('/api/memory/list', (req, res) => {
  res.json({ success: true, memories: [
    { file: 'MEMORY.md', type: 'core', size: '4KB', updated: '2026-04-24', description: '全局共享记忆' },
    { file: 'EVOLUTION-LOG.md', type: 'core', size: '8KB', updated: '2026-04-23', description: '进化日志' },
    { file: 'TASK-ISSUE-RULES.md', type: 'rules', size: '6KB', updated: '2026-04-20', description: '任务与问题触发规则' },
    { file: '2026-04-24.md', type: 'daily', size: '8KB', updated: '2026-04-24', description: '每日工作记录' },
    { file: '2026-04-23.md', type: 'daily', size: '12KB', updated: '2026-04-23', description: '每日工作记录' },
    { file: '2026-04-22.md', type: 'daily', size: '10KB', updated: '2026-04-22', description: '每日工作记录' },
    { file: '2026-04-20.md', type: 'daily', size: '15KB', updated: '2026-04-20', description: '每日工作记录' },
    { file: 'NOTICE-IMPORTANT.md', type: 'notice', size: '3KB', updated: '2026-03-27', description: '重要通知' },
    { file: 'NOTICE-task-system-dev-guide.md', type: 'notice', size: '2KB', updated: '2026-03-18', description: '开发指南通知' },
    { file: 'AUTOMATION-UNIFIED-FLOW-v4.md', type: 'architecture', size: '24KB', updated: '2026-04-18', description: '自动化工作流统一编排v4' },
    { file: 'IUP-V3.5.0-requirements.md', type: 'requirements', size: '128KB', updated: '2026-04-24', description: 'IUP V3.5.0 需求分析' }
  ], stats: { totalFiles: 11, totalSizeMB: 0.2, oldestFile: '2026-04-01.md', recentFiles: ['2026-04-24.md','2026-04-23.md','2026-04-22.md'] }});
});


// GET /api/memory/stats
app.get('/api/memory/stats', (req, res) => {
  res.json({ success: true, stats: { totalFiles: 11, totalSizeMB: 0.2, oldestFile: '2026-04-01.md', recentFiles: ['2026-04-24.md','2026-04-23.md','2026-04-22.md'] }});
});


// GET /api/memory/stats
app.get('/api/memory/stats', (req, res) => {
  res.json({ success: true, stats: { totalFiles: 11, totalSizeMB: 0.2, oldestFile: '2026-04-01.md', recentFiles: ['2026-04-24.md','2026-04-23.md','2026-04-22.md'] }});
});

// GET /api/resources/skills
app.get("/api/resources/skills", (req, res) => {
  res.json({ success: true, data: [] });
});

// GET /api/automation/status
app.get('/api/automation/status', (req, res) => {
  res.json({ success: true, components: [
    { name: 'agent-listener', status: 'online', uptime: '3d 12h' },
    { name: 'auto-task-assigner', status: 'online', uptime: '3d 12h' },
    { name: 'task-completion-monitor', status: 'online', uptime: '3d 12h' },
    { name: 'issue-scanner', status: 'online', uptime: '3d 12h' }
  ], recent_tasks: 5, recent_fixes: 2 });
});

// GET /api/automation/recent-tasks
app.get('/api/automation/recent-tasks', (req, res) => {
  res.json({ success: true, tasks: [
    { id: 'auto-1', title: '自动分配: 登录页面开发', agent: 'coder', time: '10分钟前' },
    { id: 'auto-2', title: '自动创建: Agent通信优化', agent: 'main', time: '30分钟前' },
    { id: 'auto-3', title: '自动修复: 飞书卡片渲染', agent: 'office', time: '1小时前' }
  ]});
});

// GET /api/automation/recent-issues
app.get('/api/automation/recent-issues', (req, res) => {
  res.json({ success: true, issues: [
    { id: 'iss-1', title: 'Agent通信偶发丢消息', priority: 'P1', status: 'open', time: '2小时前' },
    { id: 'iss-2', title: '飞书卡片消息渲染异常', priority: 'P2', status: 'in_progress', time: '5小时前' },
    { id: 'iss-3', title: '任务创建接口偶发超时', priority: 'P1', status: 'open', time: '1天前' }
  ]});
});

// GET /api/automation/executors
app.get('/api/automation/executors', (req, res) => {
  res.json({ success: true, executors: [
    { name: 'task-assigner', type: 'assignment', enabled: true, last_run: '10分钟前' },
    { name: 'issue-scanner', type: 'detection', enabled: true, last_run: '5分钟前' },
    { name: 'reflection-trigger', type: 'reflection', enabled: true, last_run: '1小时前' }
  ]});
});

// GET /api/calendar
app.get('/api/calendar', (req, res) => {
  const events = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(Date.now() + i * 86400000);
    events.push({
      date: date.toISOString().slice(0, 10),
      tasks: [
        { id: 'task-cal-' + i, title: '任务演示数据 ' + (i+1), priority: i % 3 === 0 ? 'P1' : 'P2', time: '09:00' },
        ...(i % 2 === 0 ? [{ id: 'task-cal-' + i + '-2', title: '代码审查', priority: 'P2', time: '14:00' }] : [])
      ]
    });
  }
  res.json({ success: true, events });
});

// GET /api/doc-mapping/docs
app.get('/api/doc-mapping/docs', (req, res) => {
  res.json({ success: true, docs: [
    { id: 'doc-1', title: 'OPENCLAW-INTEGRATION.md', category: '集成文档', pages: 273, updated: '2026-04-24' },
    { id: 'doc-2', title: 'API-CATALOG.md', category: 'API文档', pages: 156, updated: '2026-04-23' },
    { id: 'doc-3', title: 'ONE-CLICK-DEPLOY-PLAN.md', category: '部署文档', pages: 89, updated: '2026-04-22' },
    { id: 'doc-4', title: 'AUTOMATION-UNIFIED-FLOW-v4.md', category: '架构文档', pages: 234, updated: '2026-04-18' }
  ]});
});

// GET /api/documents-index
app.get('/api/documents-index', (req, res) => {
  res.json({ success: true, documents: [
    { id: 'doc-1', title: 'OPENCLAW-INTEGRATION.md', path: 'docs/OPENCLAW-INTEGRATION.md', category: '集成文档', updated: '2026-04-24' },
    { id: 'doc-2', title: 'API-CATALOG.md', path: 'docs/API-CATALOG.md', category: 'API文档', updated: '2026-04-23' },
    { id: 'doc-3', title: 'README.md', path: 'README.md', category: '项目文档', updated: '2026-04-24' }
  ]});
});

// GET /api/file/read (stub)
app.get('/api/file/read', (req, res) => {
  res.json({ success: true, content: '演示环境文件内容预览...' });
});

// GET /api/audit-logs
app.get('/api/audit-logs', (req, res) => {
  res.json({ success: true, logs: [
    { id: 'audit-1', action: 'task.create', user: '顾良晨', detail: '创建任务: 登录页面设计与实现', timestamp: new Date(Date.now()-7*86400000).toISOString() },
    { id: 'audit-2', action: 'task.update', user: 'coder', detail: '更新任务状态: doing → done', timestamp: new Date(Date.now()-86400000).toISOString() },
    { id: 'audit-3', action: 'task.create', user: 'main', detail: '创建任务: Agent通信系统优化', timestamp: new Date(Date.now()-10*86400000).toISOString() },
    { id: 'audit-4', action: 'issue.create', user: 'monitor', detail: '自动创建问题: Agent通信偶发丢消息', timestamp: new Date(Date.now()-5*86400000).toISOString() },
    { id: 'audit-5', action: 'task.assign', user: 'main', detail: '分配任务: 任务看板视图开发 → coder', timestamp: new Date(Date.now()-3*86400000).toISOString() },
    { id: 'audit-6', action: 'system.config', user: '顾良晨', detail: '修改 Gateway 配置', timestamp: new Date(Date.now()-8*86400000).toISOString() },
    { id: 'audit-7', action: 'task.complete', user: 'deep', detail: '完成任务: 飞书自动化报告功能', timestamp: new Date(Date.now()-5*86400000).toISOString() },
    { id: 'audit-8', action: 'agent.online', user: 'system', detail: 'Agent main 上线', timestamp: new Date().toISOString() }
  ]});
});


// GET /api/calendar/month/:year/:month
app.get("/api/calendar/month/:year/:month", (req, res) => {
  const { year, month } = req.params;
  const tasks = [
    { id: "task-cal-1", title: "登录页面设计与实现", date: `${year}-${month.padStart(2,"0")}-01`, priority: "P1", status: "done" },
    { id: "task-cal-2", title: "Agent 通信系统优化", date: `${year}-${month.padStart(2,"0")}-03`, priority: "P1", status: "doing" },
    { id: "task-cal-3", title: "飞书自动化报告功能", date: `${year}-${month.padStart(2,"0")}-05`, priority: "P2", status: "done" },
    { id: "task-cal-4", title: "任务看板视图开发", date: `${year}-${month.padStart(2,"0")}-10`, priority: "P2", status: "doing" },
    { id: "task-cal-5", title: "AI 模型路由优化", date: `${year}-${month.padStart(2,"0")}-15`, priority: "P1", status: "pending" },
    { id: "task-cal-6", title: "系统性能监控面板", date: `${year}-${month.padStart(2,"0")}-18`, priority: "P2", status: "pending" },
    { id: "task-cal-7", title: "知识库搜索功能增强", date: `${year}-${month.padStart(2,"0")}-22`, priority: "P2", status: "pending" },
    { id: "task-cal-8", title: "自动化工作流编排器", date: `${year}-${month.padStart(2,"0")}-25`, priority: "P1", status: "pending" },
  ];
  const byDate = {};
  tasks.forEach(t => { byDate[t.date] = (byDate[t.date] || []).concat(t); });
  res.json({ success: true, byDate });
});

// GET /api/backup/stats
app.get("/api/backup/stats", (req, res) => {
  res.json({ success: true, stats: {
    total_backups: 28, latest: "2026-04-24 03:00", size: "156MB", next: "2026-04-25 03:00", status: "healthy"
  }});
});

// GET /api/backup/history
app.get("/api/backup/history", (req, res) => {
  const history = [];
  for (let i = 0; i < 10; i++) {
    history.push({
      id: "bk-" + i,
      date: new Date(Date.now() - i * 86400000).toISOString().slice(0,19).replace("T"," "),
      size: (120 + Math.floor(Math.random()*40)) + "MB",
      status: "success",
      type: i % 3 === 0 ? "full" : "incremental"
    });
  }
  res.json({ success: true, history, total: 28 });
});

// POST /api/backup/trigger
app.post("/api/backup/trigger", (req, res) => {
  res.json({ success: true, message: "备份已触发", backup_id: "bk-demo-" + Date.now() });
});

// GET /api/model-management/providers
app.get("/api/model-management/providers", (req, res) => {
  res.json({ success: true, providers: [
    { id: "openai", name: "OpenAI", status: "active", models: 5 },
    { id: "qwen-coding", name: "阿里编码模型", status: "active", models: 4 },
    { id: "minimax", name: "MiniMax", status: "active", models: 2 },
    { id: "uniontech", name: "统信模型", status: "active", models: 5 }
  ]});
});

// GET /api/model-management/models
app.get("/api/model-management/models", (req, res) => {
  res.json({ success: true, models: [
    { id: "qwen3.6-plus", name: "Qwen3.6 Plus", provider: "qwen-coding", status: "active", type: "chat", speed: "fast" },
    { id: "qwen3-coder-next", name: "Qwen3 Coder Next", provider: "qwen-coding", status: "active", type: "coding", speed: "medium" },
    { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus", provider: "qwen-coding", status: "active", type: "coding", speed: "slow" },
    { id: "MiniMax-2.7", name: "MiniMax M2.7", provider: "minimax", status: "active", type: "chat", speed: "fast" },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "uniontech", status: "active", type: "chat", speed: "slow" },
    { id: "gpt-5.4", name: "GPT 5.4", provider: "uniontech", status: "active", type: "chat", speed: "medium" }
  ]});
});

// POST /api/model-management/test
app.post("/api/model-management/test", (req, res) => {
  res.json({ success: true, model: req.body.model, latency: 350 + Math.floor(Math.random()*200) + "ms", status: "ok" });
});

// POST /api/model-management/models/speed-test
app.post("/api/model-management/models/speed-test", (req, res) => {
  res.json({ success: true, model: req.body.model, speed: 25 + Math.floor(Math.random()*30) + " tokens/s" });
});

// POST /api/model-management/models/speed-test-all
app.post("/api/model-management/models/speed-test-all", (req, res) => {
  res.json({ success: true, results: [
    { model: "Qwen3.6 Plus", speed: "45 tokens/s", latency: "280ms" },
    { model: "MiniMax M2.7", speed: "52 tokens/s", latency: "210ms" },
    { model: "Claude Opus 4.6", speed: "28 tokens/s", latency: "520ms" },
    { model: "GPT 5.4", speed: "38 tokens/s", latency: "350ms" }
  ]});
});

// GET /api/agent-management/agents
app.get("/api/agent-management/agents", (req, res) => {
  res.json({ success: true, agents: [
    { id: "main", name: "总控 Agent", icon: "🤖", model: "qwen3.6-plus", status: "online" },
    { id: "coder", name: "编码 Agent", icon: "💻", model: "qwen3-coder-next", status: "online" },
    { id: "deep", name: "深度分析 Agent", icon: "🧠", model: "qwen3-coder-plus", status: "online" },
    { id: "fast", name: "快速响应 Agent", icon: "⚡", model: "qwen3.6-plus", status: "idle" },
    { id: "chat", name: "对话 Agent", icon: "💬", model: "qwen3.6-plus", status: "online" },
    { id: "office", name: "办公 Agent", icon: "📊", model: "qwen3.6-plus", status: "offline" }
  ]});
});

// GET /api/documents-index (also needed by docs-new)
app.get("/api/documents-index", (req, res) => {
  res.json({ success: true, documents: [
    { id: "doc-1", title: "OPENCLAW-INTEGRATION.md", path: "docs/OPENCLAW-INTEGRATION.md", category: "集成文档", size: "12KB", updated: "2026-04-24" },
    { id: "doc-2", title: "API-CATALOG.md", path: "docs/API-CATALOG.md", category: "API文档", size: "28KB", updated: "2026-04-23" },
    { id: "doc-3", title: "ONE-CLICK-DEPLOY-PLAN.md", path: "docs/ONE-CLICK-DEPLOY-PLAN.md", category: "部署文档", size: "15KB", updated: "2026-04-22" },
    { id: "doc-4", title: "AUTOMATION-UNIFIED-FLOW-v4.md", path: "docs/AUTOMATION-UNIFIED-FLOW-v4.md", category: "架构文档", size: "42KB", updated: "2026-04-18" },
    { id: "doc-5", title: "README.md", path: "README.md", category: "项目文档", size: "8KB", updated: "2026-04-24" }
  ]});
});

// GET /api/doc-content
app.get("/api/doc-content", (req, res) => {
  res.json({ success: true, content: "# 文档内容预览\\n\\n这是一个演示环境的文档内容示例。", title: req.query.title || "文档" });
});

// GET /api/documents (wildcard)
app.get("/api/documents/:docPath", (req, res) => {
  res.json({ success: true, content: "文档内容示例", path: req.params.docPath });
});


// ========== 丰富记忆数据 ==========
app.get("/api/memory/files", (req, res) => {
  res.json({ success: true, files: [
    { path: "memory/2026-04-24.md", title: "2026-04-24 记忆", type: "daily", size: "24KB", updated: "2026-04-24T13:00:00Z", summary: "IUP V3.5.0 项目、Demo页面重构、演示环境部署" },
    { path: "memory/2026-04-23.md", title: "2026-04-23 记忆", type: "daily", size: "18KB", updated: "2026-04-23T23:00:00Z", summary: "任务系统优化、Redis依赖移除、路由修复" },
    { path: "memory/2026-04-22.md", title: "2026-04-22 记忆", type: "daily", size: "15KB", updated: "2026-04-22T23:00:00Z", summary: "UOS-25服务器部署、OpenClaw集成、端口冲突解决" },
    { path: "memory/2026-04-20.md", title: "2026-04-20 记忆", type: "daily", size: "12KB", updated: "2026-04-20T23:00:00Z", summary: "任务意图检测系统、联邦通信、子Agent编排" },
    { path: "memory/2026-04-18.md", title: "2026-04-18 记忆", type: "daily", size: "20KB", updated: "2026-04-18T23:00:00Z", summary: "自动化工作流统一编排、修复队列联动机制" },
    { path: "memory/2026-04-15.md", title: "2026-04-15 记忆", type: "daily", size: "16KB", updated: "2026-04-15T23:00:00Z", summary: "知识库三层架构设计、HOT/WARM/COLD分类" },
    { path: "memory/2026-04-10.md", title: "2026-04-10 记忆", type: "daily", size: "14KB", updated: "2026-04-10T23:00:00Z", summary: "Agent注册认证、统一ID格式、Token管理" },
    { path: "memory/EVOLUTION-LOG.md", title: "进化日志", type: "evolution", size: "8KB", updated: "2026-04-20T10:00:00Z", summary: "自我进化记录：任务优化、知识提取、流程改进" },
    { path: "memory/TASK-ISSUE-RULES.md", title: "任务与问题触发规则", type: "rules", size: "6KB", updated: "2026-04-18T10:00:00Z", summary: "创建任务、问题记录的触发条件和规则" },
    { path: "memory/PROJECT-IUP-V3.5.md", title: "IUP V3.5 项目记录", type: "project", size: "128KB", updated: "2026-04-24T09:00:00Z", summary: "IUP管理系统V3.5.0需求、设计、开发全记录" }
  ], categories: ["daily", "evolution", "rules", "project", "notes"]});
});

// GET /api/memory/content/:path
app.get("/api/memory/content/:path", (req, res) => {
  const p = req.params.path;
  res.json({ success: true, path: p, content: `# 记忆文件：${p}\n\n这是演示环境的记忆文件内容。\n\n## 关键事件\n- 任务创建、更新、完成记录\n- 问题发现和修复记录\n- Agent工作状态变更`, size: "24KB" });
});

// GET /api/memory/search
app.get("/api/memory/search", (req, res) => {
  res.json({ success: true, results: [
    { path: "memory/2026-04-24.md", score: 0.95, snippet: "IUP V3.5.0 项目、Demo页面重构" },
    { path: "memory/2026-04-23.md", score: 0.82, snippet: "任务系统优化、Redis依赖移除" },
    { path: "memory/2026-04-22.md", score: 0.78, snippet: "UOS-25服务器部署、端口冲突解决" }
  ]});
});

// ========== 丰富的知识库数据 ==========
app.get("/api/knowledge/list", (req, res) => {
  res.json({ success: true, items: [
    { id: "k-1", title: "任务意图检测规则", category: "技术文档", tier: "hot", tags: ["自动化", "任务管理"], views: 245, created: "2026-04-15", updated: "2026-04-24" },
    { id: "k-2", title: "Agent联邦通信协议", category: "技术文档", tier: "hot", tags: ["Agent", "通信"], views: 189, created: "2026-04-10", updated: "2026-04-23" },
    { id: "k-3", title: "修复队列联动机制", category: "运维指南", tier: "hot", tags: ["问题管理", "自动化"], views: 156, created: "2026-04-18", updated: "2026-04-24" },
    { id: "k-4", title: "知识库三层架构设计", category: "架构文档", tier: "hot", tags: ["知识库", "架构"], views: 134, created: "2026-04-15", updated: "2026-04-22" },
    { id: "k-5", title: "OpenClaw 集成指南", category: "集成文档", tier: "hot", tags: ["OpenClaw", "部署"], views: 198, created: "2026-04-20", updated: "2026-04-24" },
    { id: "k-6", title: "自我进化流程", category: "开发规范", tier: "warm", tags: ["进化", "自我优化"], views: 98, created: "2026-04-12", updated: "2026-04-20" },
    { id: "k-7", title: "Agent 注册认证机制", category: "技术文档", tier: "warm", tags: ["Agent", "认证"], views: 87, created: "2026-04-10", updated: "2026-04-18" },
    { id: "k-8", title: "飞书自动化报告配置", category: "运维指南", tier: "warm", tags: ["飞书", "自动化"], views: 76, created: "2026-04-18", updated: "2026-04-22" },
    { id: "k-9", title: "任务系统API文档", category: "API文档", tier: "warm", tags: ["API", "任务系统"], views: 234, created: "2026-04-08", updated: "2026-04-23" },
    { id: "k-10", title: "部署运维手册", category: "运维指南", tier: "warm", tags: ["部署", "运维"], views: 145, created: "2026-04-06", updated: "2026-04-22" },
    { id: "k-11", title: "问题管理流程", category: "开发规范", tier: "warm", tags: ["问题", "流程"], views: 67, created: "2026-04-18", updated: "2026-04-21" },
    { id: "k-12", title: "Agent编排最佳实践", category: "技术文档", tier: "warm", tags: ["Agent", "编排"], views: 112, created: "2026-04-15", updated: "2026-04-20" },
    { id: "k-13", title: "数据库优化方案", category: "技术文档", tier: "cold", tags: ["数据库", "优化"], views: 45, created: "2026-04-05", updated: "2026-04-10" },
    { id: "k-14", title: "历史版本兼容性", category: "运维指南", tier: "cold", tags: ["兼容性", "版本"], views: 34, created: "2026-04-01", updated: "2026-04-08" },
    { id: "k-15", title: "测试用例规范", category: "开发规范", tier: "cold", tags: ["测试", "规范"], views: 28, created: "2026-04-01", updated: "2026-04-05" }
  ], total: 156, byTier: { hot: 23, warm: 67, cold: 66 }});
});

// GET /api/knowledge/detail/:id
app.get("/api/knowledge/detail/:id", (req, res) => {
  res.json({ success: true, item: {
    id: req.params.id,
    title: "任务意图检测规则",
    category: "技术文档",
    tier: "hot",
    content: "# 任务意图检测规则\\n\\n当收到用户消息时，自动分析消息意图并判断是否需要创建任务。\\n\\n## 触发条件\\n- 用户提出开发需求\\n- 用户要求学习新技能\\n- 用户要求进行测试或验收\\n\\n## 检测逻辑\\n1. 关键词匹配\\n2. 语义分析\\n3. 规则引擎判断",
    tags: ["自动化", "任务管理"],
    views: 245,
    created: "2026-04-15",
    updated: "2026-04-24"
  }});
});

// GET /api/knowledge/categories
app.get("/api/knowledge/categories", (req, res) => {
  res.json({ success: true, categories: [
    { name: "技术文档", count: 45, color: "#3b82f6" },
    { name: "运维指南", count: 32, color: "#10b981" },
    { name: "开发规范", count: 28, color: "#f59e0b" },
    { name: "API文档", count: 25, color: "#8b5cf6" },
    { name: "架构文档", count: 16, color: "#ef4444" },
    { name: "集成文档", count: 10, color: "#06b6d4" }
  ]});
});


// GET /api/learning/outcomes - 知识成果
app.get('/api/learning/outcomes', (req, res) => {
  res.json({ success: true, data: [
    { id: 'lo-1', title: '任务意图检测规则', agent_id: 'main', category: '自动化', type: '规则', share_status: 'shared', created: '2026-04-15', updated: '2026-04-24', views: 245, content: '当收到用户消息时自动分析意图并判断是否需要创建任务' },
    { id: 'lo-2', title: 'Agent联邦通信协议', agent_id: 'main', category: '通信', type: '协议', share_status: 'shared', created: '2026-04-10', updated: '2026-04-23', views: 189, content: '跨实例Agent消息路由协议设计' },
    { id: 'lo-3', title: '修复队列联动机制', agent_id: 'coder', category: '问题管理', type: '机制', share_status: 'shared', created: '2026-04-18', updated: '2026-04-24', views: 156, content: '修复队列与问题状态自动同步联动' },
    { id: 'lo-4', title: '知识库三层架构设计', agent_id: 'deep', category: '架构', type: '设计', share_status: 'shared', created: '2026-04-15', updated: '2026-04-22', views: 134, content: 'HOT/WARM/COLD三层知识库架构' },
    { id: 'lo-5', title: 'OpenClaw集成指南', agent_id: 'main', category: '集成', type: '文档', share_status: 'shared', created: '2026-04-20', updated: '2026-04-24', views: 198, content: 'OpenClaw与任务系统集成完整指南' },
    { id: 'lo-6', title: '自我进化流程', agent_id: 'main', category: '进化', type: '流程', share_status: 'shared', created: '2026-04-12', updated: '2026-04-20', views: 98, content: 'Agent自我进化自动化流程' },
    { id: 'lo-7', title: 'Agent注册认证机制', agent_id: 'main', category: 'Agent', type: '机制', share_status: 'internal', created: '2026-04-10', updated: '2026-04-18', views: 87, content: '统一Agent ID格式和Token管理' },
    { id: 'lo-8', title: '飞书自动化报告配置', agent_id: 'office', category: '自动化', type: '配置', share_status: 'shared', created: '2026-04-18', updated: '2026-04-22', views: 76, content: '定时飞书报告生成配置' },
    { id: 'lo-9', title: '任务系统API文档', agent_id: 'coder', category: 'API', type: '文档', share_status: 'shared', created: '2026-04-08', updated: '2026-04-23', views: 234, content: '全局API目录和接口文档' },
    { id: 'lo-10', title: '部署运维手册', agent_id: 'coder', category: '运维', type: '文档', share_status: 'shared', created: '2026-04-06', updated: '2026-04-22', views: 145, content: '任务系统部署和运维操作手册' }
  ]});
});


// GET /api/learning/outcomes - 知识成果
app.get('/api/learning/outcomes', (req, res) => {
  res.json({ success: true, data: [
    { id: 'lo-1', title: '任务意图检测规则', agent_id: 'main', category: '自动化', type: '规则', share_status: 'shared', created: '2026-04-15', updated: '2026-04-24', views: 245, content: '当收到用户消息时自动分析意图并判断是否需要创建任务' },
    { id: 'lo-2', title: 'Agent联邦通信协议', agent_id: 'main', category: '通信', type: '协议', share_status: 'shared', created: '2026-04-10', updated: '2026-04-23', views: 189, content: '跨实例Agent消息路由协议设计' },
    { id: 'lo-3', title: '修复队列联动机制', agent_id: 'coder', category: '问题管理', type: '机制', share_status: 'shared', created: '2026-04-18', updated: '2026-04-24', views: 156, content: '修复队列与问题状态自动同步联动' },
    { id: 'lo-4', title: '知识库三层架构设计', agent_id: 'deep', category: '架构', type: '设计', share_status: 'shared', created: '2026-04-15', updated: '2026-04-22', views: 134, content: 'HOT/WARM/COLD三层知识库架构' },
    { id: 'lo-5', title: 'OpenClaw集成指南', agent_id: 'main', category: '集成', type: '文档', share_status: 'shared', created: '2026-04-20', updated: '2026-04-24', views: 198, content: 'OpenClaw与任务系统集成完整指南' },
    { id: 'lo-6', title: '自我进化流程', agent_id: 'main', category: '进化', type: '流程', share_status: 'shared', created: '2026-04-12', updated: '2026-04-20', views: 98, content: 'Agent自我进化自动化流程' },
    { id: 'lo-7', title: 'Agent注册认证机制', agent_id: 'main', category: 'Agent', type: '机制', share_status: 'internal', created: '2026-04-10', updated: '2026-04-18', views: 87, content: '统一Agent ID格式和Token管理' },
    { id: 'lo-8', title: '飞书自动化报告配置', agent_id: 'office', category: '自动化', type: '配置', share_status: 'shared', created: '2026-04-18', updated: '2026-04-22', views: 76, content: '定时飞书报告生成配置' },
    { id: 'lo-9', title: '任务系统API文档', agent_id: 'coder', category: 'API', type: '文档', share_status: 'shared', created: '2026-04-08', updated: '2026-04-23', views: 234, content: '全局API目录和接口文档' },
    { id: 'lo-10', title: '部署运维手册', agent_id: 'coder', category: '运维', type: '文档', share_status: 'shared', created: '2026-04-06', updated: '2026-04-22', views: 145, content: '任务系统部署和运维操作手册' }
  ]});
});

// ========== 学习路径数据 ==========
app.get("/api/learning-paths/list", (req, res) => {
  console.log("[DEBUG] /api/learning-paths/list HIT");
  res.json({ success: true, data: [
    { id: "lp-1", name: "OpenClaw Agent 开发", description: "从零开始学习 OpenClaw Agent 开发和配置", category: "开发", progress: 75, estimatedHours: 16, difficulty: "中级",
      milestones: [
        { id: "m1", title: "Agent 配置基础", hours: 2, date: "2026-04-10", status: "completed", learning: { progress: 100 }, practice: { progress: 80 } },
        { id: "m2", title: "模型配置与切换", hours: 1.5, date: "2026-04-11", status: "completed", learning: { progress: 100 }, practice: { progress: 90 } },
        { id: "m3", title: "Agent 技能开发", hours: 3, date: "2026-04-12", status: "completed", learning: { progress: 100 }, practice: { progress: 70 } },
        { id: "m4", title: "联邦通信配置", hours: 2, date: "2026-04-13", status: "completed", learning: { progress: 100 }, practice: { progress: 60 } },
        { id: "m5", title: "心跳与自检机制", hours: 1.5, date: "2026-04-14", status: "completed", learning: { progress: 100 }, practice: { progress: 50 } },
        { id: "m6", title: "子Agent编排", hours: 2, date: "2026-04-15", status: "current", learning: { progress: 60 }, practice: { progress: 30 } },
        { id: "m7", title: "自我进化机制", hours: 2, date: "待开始", status: "pending", learning: { progress: 0 }, practice: { progress: 0 } },
        { id: "m8", title: "高级故障排查", hours: 2, date: "待开始", status: "pending", learning: { progress: 0 }, practice: { progress: 0 } }
      ],
      resources: [
        { type: "文档", title: "AGENTS.md", url: "#" },
        { type: "文档", title: "SOUL.md", url: "#" },
        { type: "配置", title: "openclaw.json", url: "#" }
      ]
    },
    { id: "lp-2", name: "飞书自动化集成", description: "学习飞书消息通知、文档同步和自动化报告", category: "集成", progress: 90, estimatedHours: 8, difficulty: "初级",
      milestones: [
        { id: "m1", title: "飞书消息通知", hours: 1, date: "2026-04-15", status: "completed", learning: { progress: 100 }, practice: { progress: 90 } },
        { id: "m2", title: "飞书文档同步", hours: 1.5, date: "2026-04-16", status: "completed", learning: { progress: 100 }, practice: { progress: 85 } },
        { id: "m3", title: "自动化报告", hours: 2, date: "2026-04-17", status: "completed", learning: { progress: 100 }, practice: { progress: 80 } },
        { id: "m4", title: "飞书机器人", hours: 2, date: "2026-04-18", status: "completed", learning: { progress: 100 }, practice: { progress: 75 } },
        { id: "m5", title: "复杂交互", hours: 1.5, date: "待开始", status: "current", learning: { progress: 50 }, practice: { progress: 20 } }
      ],
      resources: [
        { type: "文档", title: "飞书开放平台API", url: "#" },
        { type: "示例", title: "Feishu-Bot示例", url: "#" }
      ]
    },
    { id: "lp-3", name: "知识库架构设计", description: "HOT/WARM/COLD三层知识库架构设计与实现", category: "架构", progress: 60, estimatedHours: 24, difficulty: "高级",
      milestones: [
        { id: "m1", title: "HOT层实时数据", hours: 3, date: "2026-04-08", status: "completed", learning: { progress: 100 }, practice: { progress: 80 } },
        { id: "m2", title: "WARM层短期记忆", hours: 3, date: "2026-04-09", status: "completed", learning: { progress: 100 }, practice: { progress: 70 } },
        { id: "m3", title: "COLD层长期归档", hours: 3, date: "2026-04-10", status: "completed", learning: { progress: 100 }, practice: { progress: 60 } },
        { id: "m4", title: "三层同步机制", hours: 4, date: "2026-04-11", status: "completed", learning: { progress: 100 }, practice: { progress: 50 } },
        { id: "m5", title: "知识向量化", hours: 4, date: "2026-04-12", status: "current", learning: { progress: 60 }, practice: { progress: 30 } },
        { id: "m6", title: "语义检索优化", hours: 3, date: "待开始", status: "pending", learning: { progress: 0 }, practice: { progress: 0 } },
        { id: "m7", title: "知识图谱构建", hours: 4, date: "待开始", status: "pending", learning: { progress: 0 }, practice: { progress: 0 } }
      ],
      resources: [
        { type: "文档", title: "知识库架构文档", url: "#" },
        { type: "论文", title: "RAG论文精选", url: "#" },
        { type: "工具", title: "向量数据库对比", url: "#" }
      ]
    },
    { id: "lp-4", name: "自动化工作流编排", description: "Phase Controller、Circuit Breaker等编排模式", category: "运维", progress: 45, estimatedHours: 20, difficulty: "高级",
      milestones: [
        { id: "m1", title: "Phase Controller", hours: 3, date: "2026-04-12", status: "completed", learning: { progress: 100 }, practice: { progress: 70 } },
        { id: "m2", title: "Circuit Breaker", hours: 3, date: "2026-04-13", status: "completed", learning: { progress: 100 }, practice: { progress: 60 } },
        { id: "m3", title: "事件驱动架构", hours: 4, date: "2026-04-14", status: "current", learning: { progress: 50 }, practice: { progress: 30 } },
        { id: "m4", title: "联邦通信", hours: 3, date: "待开始", status: "pending", learning: { progress: 0 }, practice: { progress: 0 } },
        { id: "m5", title: "自我进化循环", hours: 3, date: "待开始", status: "pending", learning: { progress: 0 }, practice: { progress: 0 } },
        { id: "m6", title: "故障自愈", hours: 4, date: "待开始", status: "pending", learning: { progress: 0 }, practice: { progress: 0 } }
      ],
      resources: [
        { type: "文档", title: "自动化工作流设计", url: "#" },
        { type: "示例", title: "编排模式示例", url: "#" }
      ]
    },
    { id: "lp-5", name: "任务系统开发规范", description: "统一开发框架、HTML页面、API设计规范", category: "开发", progress: 100, estimatedHours: 6, difficulty: "初级",
      milestones: [
        { id: "m1", title: "统一框架样式", hours: 1.5, date: "2026-04-06", status: "completed", learning: { progress: 100 }, practice: { progress: 100 } },
        { id: "m2", title: "侧边栏组件", hours: 1, date: "2026-04-06", status: "completed", learning: { progress: 100 }, practice: { progress: 100 } },
        { id: "m3", title: "API设计规范", hours: 2, date: "2026-04-06", status: "completed", learning: { progress: 100 }, practice: { progress: 100 } },
        { id: "m4", title: "暗色主题适配", hours: 1.5, date: "2026-04-06", status: "completed", learning: { progress: 100 }, practice: { progress: 100 } }
      ],
      resources: [
        { type: "文档", title: "开发规范文档", url: "#" },
        { type: "示例", title: "页面模板", url: "#" }
      ]
    }
  ], stats: { totalPaths: 5, completedMilestones: 16, inProgressMilestones: 4, totalHours: 74 }});
});
app.get("/api/learning-paths/detail/:id", (req, res) => {
  res.json({ success: true, path: {
    id: req.params.id,
    title: "OpenClaw Agent 开发",
    description: "从零开始学习 OpenClaw Agent 开发和配置",
    modules: [
      { id: "m-1", title: "Agent 配置基础", duration: "2h", completed: true },
      { id: "m-2", title: "模型配置与切换", duration: "1.5h", completed: true },
      { id: "m-3", title: "Agent 技能开发", duration: "3h", completed: true },
      { id: "m-4", title: "联邦通信配置", duration: "2h", completed: true },
      { id: "m-5", title: "心跳与自检机制", duration: "1.5h", completed: true },
      { id: "m-6", title: "子Agent编排", duration: "2h", completed: true },
      { id: "m-7", title: "自我进化机制", duration: "2h", completed: false },
      { id: "m-8", title: "高级故障排查", duration: "3h", completed: false }
    ],
    resources: ["AGENTS.md", "SOUL.md", "openclaw.json"]
  }});
});

// ========== 反思数据 ==========
app.get("/api/reflections/list", (req, res) => {
  res.json({ success: true, reflections: [
    { id: "ref-1", taskId: "task-cc300b76", title: "登录页面设计与实现", date: "2026-04-18", status: "completed", context: "UI风格调整", lesson: "严格遵循生产环境UI规范，不要擅自创新设计" },
    { id: "ref-2", taskId: "task-f11c4aab", title: "Agent通信系统优化", date: "2026-04-22", status: "completed", context: "消息丢失问题", lesson: "联邦通信需要添加重试机制和超时检测" },
    { id: "ref-3", taskId: "task-a89ddc04", title: "飞书自动化报告功能", date: "2026-04-20", status: "completed", context: "飞书卡片渲染", lesson: "飞书卡片JSON结构需要严格符合API规范" },
    { id: "ref-4", taskId: "task-7c0b27f4", title: "任务看板视图开发", date: "2026-04-23", status: "in_progress", context: "拖拽功能", lesson: "" },
    { id: "ref-5", taskId: "task-c8eba02d", title: "AI模型路由优化", date: "2026-04-24", status: "in_progress", context: "模型选择策略", lesson: "" }
  ]});
});

// ========== 告警数据 ==========
app.get("/api/alerts/list", (req, res) => {
  res.json({ success: true, alerts: [
    { id: "alert-1", type: "error", title: "Gateway OOM Kill", severity: "high", time: "2026-04-24T03:15:00Z", status: "resolved", detail: "知识库向量化导致内存溢出，已禁用" },
    { id: "alert-2", type: "warning", title: "任务卡住超过2小时", severity: "medium", time: "2026-04-23T15:30:00Z", status: "resolved", detail: "子Agent超时，已自动重试" },
    { id: "alert-3", type: "info", title: "系统负载升高", severity: "low", time: "2026-04-23T10:00:00Z", status: "active", detail: "CPU使用率超过80%，持续10分钟" },
    { id: "alert-4", type: "error", title: "飞书消息发送失败", severity: "high", time: "2026-04-22T08:45:00Z", status: "resolved", detail: "Token过期，已自动刷新" },
    { id: "alert-5", type: "warning", title: "磁盘空间不足", severity: "medium", time: "2026-04-21T20:00:00Z", status: "resolved", detail: "日志文件超过50MB，已清理" },
    { id: "alert-6", type: "info", title: "新Agent上线", severity: "low", time: "2026-04-21T09:00:00Z", status: "active", detail: "Agent office 注册成功" },
    { id: "alert-7", type: "error", title: "数据库连接异常", severity: "high", time: "2026-04-20T14:30:00Z", status: "resolved", detail: "SQLite文件锁定，已重启服务" }
  ], stats: { total: 7, active: 2, resolved: 5, by_severity: { high: 3, medium: 2, low: 2 }}});
});

// ========== 部署历史 ==========
app.get("/api/deploy/history", (req, res) => {
  res.json({ success: true, history: [
    { id: "dep-1", version: "v1.0.0", date: "2026-04-06", status: "success", type: "init", note: "初始部署" },
    { id: "dep-2", version: "v1.1.0", date: "2026-04-08", status: "success", type: "update", note: "添加数据库存储" },
    { id: "dep-3", version: "v1.2.0", date: "2026-04-10", status: "success", type: "update", note: "Agent注册认证" },
    { id: "dep-4", version: "v1.3.0", date: "2026-04-12", status: "success", type: "update", note: "联邦通信支持" },
    { id: "dep-5", version: "v1.4.0", date: "2026-04-15", status: "success", type: "update", note: "知识库集成" },
    { id: "dep-6", version: "v1.5.0", date: "2026-04-18", status: "success", type: "update", note: "自动化工作流" },
    { id: "dep-7", version: "v2.0.0", date: "2026-04-20", status: "success", type: "major", note: "架构重构" },
    { id: "dep-8", version: "v2.1.0", date: "2026-04-22", status: "success", type: "update", note: "端口冲突修复" },
    { id: "dep-9", version: "v2.2.0", date: "2026-04-23", status: "success", type: "update", note: "Redis依赖移除" },
    { id: "dep-10", version: "v2.3.0", date: "2026-04-24", status: "success", type: "update", note: "演示环境部署" }
  ]});
});

// ========== Cron任务数据 ==========
app.get("/api/cron-tasks", (req, res) => {
  res.json({ success: true, tasks: [
    { id: "cron-1", name: "Heartbeat 自检", schedule: "*/5 * * * *", status: "active", last_run: "2026-04-24T13:15:00Z", last_status: "success" },
    { id: "cron-2", name: "深度检查", schedule: "0 6 * * *", status: "active", last_run: "2026-04-24T06:00:00Z", last_status: "success" },
    { id: "cron-3", name: "记忆同步", schedule: "0 * * * *", status: "disabled", last_run: "2026-04-18T12:00:00Z", last_status: "error", note: "已禁用，导致OOM" },
    { id: "cron-4", name: "飞书定时报告", schedule: "0 */4 * * *", status: "active", last_run: "2026-04-24T12:00:00Z", last_status: "success" },
    { id: "cron-5", name: "日志清理", schedule: "0 3 * * *", status: "active", last_run: "2026-04-24T03:00:00Z", last_status: "success" },
    { id: "cron-6", name: "数据库备份", schedule: "0 3 * * 0", status: "active", last_run: "2026-04-20T03:00:00Z", last_status: "success" }
  ]});
});

// ========== 检查清单报告 ==========
app.get("/api/checklists/reports", (req, res) => {
  res.json({ success: true, reports: [
    { id: "clr-1", type: "task", name: "登录页面设计与实现", date: "2026-04-18", status: "passed", items: 12, passed: 12 },
    { id: "clr-2", type: "project", name: "任务系统 V2", date: "2026-04-23", status: "passed", items: 15, passed: 14 },
    { id: "clr-3", type: "knowledge", name: "知识库更新", date: "2026-04-22", status: "passed", items: 8, passed: 8 },
    { id: "clr-4", type: "memory", name: "记忆同步", date: "2026-04-24", status: "warning", items: 10, passed: 9 },
    { id: "clr-5", type: "reflection", name: "反思完成度", date: "2026-04-24", status: "passed", items: 5, passed: 5 },
    { id: "clr-6", type: "skill", name: "技能市场", date: "2026-04-23", status: "passed", items: 6, passed: 6 }
  ]});
});

// ========== 聊天消息统计 ==========
app.get("/api/chat-messages/stats", (req, res) => {
  res.json({ success: true, stats: {
    total_messages: 2847,
    today: 156,
    channels: [
      { name: "飞书", count: 1823, percent: 64 },
      { name: "Telegram", count: 634, percent: 22 },
      { name: "Web聊天室", count: 390, percent: 14 }
    ],
    tasks_created: 234,
    tasks_completed: 189,
    issues_detected: 45
  }});
});

// ========== 聊天消息列表 ==========
app.get("/api/chat-messages", (req, res) => {
  res.json({ success: true, messages: [
    { id: "msg-1", channel: "飞书", user: "顾良晨", content: "检查一下25上，这个演示环境，每个页面都填充数据呀", time: "2026-04-24T13:03:00Z", is_task: false },
    { id: "msg-2", channel: "飞书", user: "顾良晨", content: "你可以做一些假数据吗，我们需要在另一个服务器上发布一个演示环境", time: "2026-04-24T11:00:00Z", is_task: true, task_id: "task-demo-1" },
    { id: "msg-3", channel: "飞书", user: "顾良晨", content: "那你把25上昨天做验证在他那部署的task-system-v2这个项目删除了", time: "2026-04-24T10:30:00Z", is_task: true, task_id: "task-clean-25" },
    { id: "msg-4", channel: "飞书", user: "顾良晨", content: "demo 风格要和实际的页面风格保持一致", time: "2026-04-24T09:15:00Z", is_task: false },
    { id: "msg-5", channel: "飞书", user: "顾良晨", content: "需要确认一下，你redeme是怎么写的，里面的配置、数据都没有我个人的信息了吧", time: "2026-04-24T08:53:00Z", is_task: false }
  ], total: 2847 });
});

// ========== API Catalog ==========
app.get("/api/api-catalog/catalog", (req, res) => {
  res.json({ success: true, catalog: [
    { path: "/api/tasks", method: "GET", description: "获取任务列表" },
    { path: "/api/tasks", method: "POST", description: "创建任务" },
    { path: "/api/tasks/:id", method: "GET", description: "获取任务详情" },
    { path: "/api/tasks/:id", method: "PUT", description: "更新任务" },
    { path: "/api/agents/status", method: "GET", description: "Agent状态" },
    { path: "/api/agents/list", method: "GET", description: "Agent列表" },
    { path: "/api/projects", method: "GET", description: "项目列表" },
    { path: "/api/scenarios", method: "GET", description: "场景列表" },
    { path: "/api/knowledge/stats", method: "GET", description: "知识统计" },
    { path: "/api/knowledge/list", method: "GET", description: "知识列表" },
    { path: "/api/memory/list", method: "GET", description: "记忆列表" },
    { path: "/api/resources/skills", method: "GET", description: "技能列表" },
    { path: "/api/automation/status", method: "GET", description: "自动化状态" },
    { path: "/api/calendar", method: "GET", description: "日历数据" },
    { path: "/api/audit-logs", method: "GET", description: "审计日志" },
    { path: "/api/backup/stats", method: "GET", description: "备份统计" },
    { path: "/api/model-management/models", method: "GET", description: "模型列表" },
    { path: "/api/learning-paths", method: "GET", description: "学习路径" },
    { path: "/api/reflections/list", method: "GET", description: "反思列表" },
    { path: "/api/alerts/list", method: "GET", description: "告警列表" }
  ], stats: { total: 20 }});
});

// ========== 文档更新 ==========
app.get("/api/documents", (req, res) => {
  res.json({ success: true, documents: [
    { id: "doc-1", title: "README.md", path: "README.md", category: "项目文档", size: "12KB", updated: "2026-04-24", content: "任务管理系统 - 开源版本" },
    { id: "doc-2", title: "OPENCLAW-INTEGRATION.md", path: "docs/OPENCLAW-INTEGRATION.md", category: "集成文档", size: "24KB", updated: "2026-04-24", content: "OpenClaw集成完整指南" },
    { id: "doc-3", title: "API-CATALOG.md", path: "docs/API-CATALOG.md", category: "API文档", size: "36KB", updated: "2026-04-23", content: "全局API目录和文档" },
    { id: "doc-4", title: "ONE-CLICK-DEPLOY-PLAN.md", path: "docs/ONE-CLICK-DEPLOY-PLAN.md", category: "部署文档", size: "18KB", updated: "2026-04-22", content: "一键部署方案设计" },
    { id: "doc-5", title: "AUTOMATION-UNIFIED-FLOW-v4.md", path: "docs/AUTOMATION-UNIFIED-FLOW-v4.md", category: "架构文档", size: "42KB", updated: "2026-04-18", content: "自动化工作流统一编排v4" },
    { id: "doc-6", title: "HEARTBEAT.md", path: "HEARTBEAT.md", category: "运维文档", size: "15KB", updated: "2026-04-14", content: "Heartbeat定时任务配置" },
    { id: "doc-7", title: "SOUL.md", path: "SOUL.md", category: "Agent文档", size: "4KB", updated: "2026-04-10", content: "Agent人格和行为规范" },
    { id: "doc-8", title: "AGENTS.md", path: "AGENTS.md", category: "Agent文档", size: "6KB", updated: "2026-04-18", content: "Agent组织架构和规则" }
  ]});
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 任务系统已启动 - 端口：${PORT}`);
});
