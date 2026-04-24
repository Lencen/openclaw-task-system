/**
 * AutoTaskAssigner v4.0 - 任务分配器(仅分配,不执行)
 *
 * 架构变更:
 * - 第3版:直接调用 Gateway HTTP API
 * - 第4版:分离职责 - 只负责分配,不启动 Subagent
 *
 * 新职责:
 * - 分配任务给 Agent
 * - 记录分配日志
 * - 更新任务状态
 * - 写入 pending_assignments 表
 *
 * 不再负责:
 * - ❌ 启动 Subagent(由执行模块负责)
 * - ❌ 监控任务状态(由监控模块负责)
 * - ❌ 处理任务完成(由状态更新器负责)
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../src/db');
const http = require('http');
const redis = require('../src/utils/redis');

const DATA_DIR = path.join(__dirname, '../data');

// 内存缓存（替代 Redis 记录分配日志）
const assignLogCache = new Map();

// ========== 配置 ==========
const FEDERATION_ENABLED = true;  // 禁用联邦通信(由执行模块负责)

// ========== 防重复处理 ==========
const processedTaskIds = new Set();
const MAX_PROCESSED_TRACKING = 1000;
const GATEWAY_HOST = 'localhost';
const GATEWAY_PORT = 8081;  // 任务系统 API 端口
const GATEWAY_TOKEN = 'b47aeb9ce48976322ea3564aae177db8cc7a0ce81f524945';

// Redis 队列配置 - 保留用于任务队列
const REDIS_QUEUE_ENABLED = true;

/**
 * Agent 池配置
 */
const AGENT_POOL = {
  'coder': ['coder', 'coder-1', 'coder-2'],
  'test': ['test'],
  'office': ['office', 'office-1'],
  'deep': ['deep'],
  'chat': ['chat'],
  'fast': ['fast']
};

// 任务类型关键词映射
const AGENT_RULES = {
  'coder': ['实现', '开发', '编码', '代码', '编写', '修复', 'fix', 'bug', '问题', '解决', 'debug', 'API', '后端', '前端', '组件'],
  'test': ['测试', '验证', 'check', 'validate', 'test', '验收'],
  'office': ['文档', '编写', 'write', 'doc', '说明', 'README', '汇报', '周报', '飞书', '表格'],
  'deep': ['分析', '调研', '研究', 'research', 'analysis', '评估', '规划', '设计', '架构'],
  'chat': ['对话', '聊天', '回复', '回答', 'chat', 'message', '沟通'],
  'fast': []
};

/**
 * 获取 Agent 当前任务数
 */
function getAgentTaskCount(agentId) {
  try {
    const tasks = db.tasks.list();
    return tasks.filter(t => t.status === 'doing' && t.assigned_agent === agentId).length;
  } catch (e) {
    return 0;
  }
}

/**
 * 从 Agent 池中选择负载最低的 Agent
 */
function selectAgentFromPool(poolType) {
  const pool = AGENT_POOL[poolType] || AGENT_POOL['fast'];
  if (pool.length === 1) return pool[0];

  const loads = pool.map(agentId => ({
    agentId,
    count: getAgentTaskCount(agentId)
  }));

  loads.sort((a, b) => a.count - b.count);
  console.log(`[Assigner] Agent池 ${poolType} 负载:`, loads.map(l => `${l.agentId}:${l.count}`).join(', '));

  return loads[0].agentId;
}

/**
 * 选择合适的 Agent 类型
 */
function selectAgentType(task) {
  const title = (task.title || '').toLowerCase();
  const description = (task.description || task.user_description || '').toLowerCase();
  const combined = title + ' ' + description;

  for (const [agentType, keywords] of Object.entries(AGENT_RULES)) {
    if (keywords.length === 0) continue;

    for (const keyword of keywords) {
      if (combined.includes(keyword.toLowerCase())) {
        console.log(`[Assigner] 匹配: ${keyword} -> ${agentType}池`);
        return agentType;
      }
    }
  }

  return 'fast';
}

/**
 * 选择合适的 Agent(负载均衡版)
 */
function selectAgent(task) {
  const agentType = selectAgentType(task);
  return selectAgentFromPool(agentType);
}

/**
 * 获取待分配任务
 */
function getPendingTasks() {
  try {
    const tasks = db.tasks.list();
    const pendingTasks = tasks.filter(t =>
      t.status === 'pending' &&
      !t.assigned_agent
    );
    console.log(`[Assigner] [DEBUG] 总任务数: ${tasks.length}, 待分配任务数: ${pendingTasks.length}`);
    return pendingTasks;
  } catch (err) {
    console.error('[Assigner] 读取任务失败:', err.message);
    return [];
  }
}

/**
 * 通过 Redis 队列写入待分配记录(支持三层兜底)
 */
async function writePendingAssignmentRedis(task, agentType) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[Assigner] [REDIS] 尝试 ${attempt}/${maxAttempts} - 写入 Redis 队列`);

      const queueTask = {
        id: task.id,
        agentType: agentType,
        priority: task.priority || 'P2',
        title: task.title,
        description: task.description || task.user_description || '',
        user_description: task.user_description
      };

      const queueItem = await redis.TaskQueue.TaskQueue.push(queueTask);

      console.log(`[Assigner] [REDIS] ✅ 任务已写入队列: ${queueItem.id}`);

      logAssignmentToRedis(task, agentType, queueItem.id);

      return {
        success: true,
        queueId: queueItem.id,
        mode: 'redis',
        duplicate: false
      };
    } catch (redisError) {
      console.warn(`[Assigner] [REDIS] 尝试 ${attempt}/${maxAttempts} 失败:`, redisError.message);

      if (attempt >= maxAttempts) {
        console.log(`[Assigner] [REDIS] 达到最大重试次数,使用文件兜底`);
        return await writePendingAssignmentFile(task, agentType);
      }
    }

    await sleep(1000 * attempt);
  }

  return { success: false, error: 'All attempts failed' };
}

/**
 * 通过文件轮询写入待分配记录(兜底模式)
 */
async function writePendingAssignmentFile(task, agentType) {
  try {
    const ASSIGNMENTS_FILE = path.join(DATA_DIR, 'pending-assignments.jsonl');

    console.log(`[Assigner] [FILE] 检查任务 ${task.id} 是否已存在待分配记录`);

    if (fs.existsSync(ASSIGNMENTS_FILE)) {
      const content = fs.readFileSync(ASSIGNMENTS_FILE, 'utf8').trim();
      if (content) {
        const existingLines = content.split('\n');
        for (const line of existingLines) {
          try {
            const existing = JSON.parse(line);
            if (existing.taskId === task.id && existing.status === 'pending') {
              console.log(`[Assigner] [FILE] ⚠️ 任务 ${task.id} 已有待分配记录,跳过`);
              return { success: true, duplicate: true, mode: 'file' };
            }
          } catch (e) {
            // 解析失败,忽略
          }
        }
      }
    }

    const assignment = {
      id: uuidv4(),
      taskId: task.id,
      agentType: agentType,
      taskTitle: task.title,
      taskDescription: task.description || task.user_description || '',
      createdAt: new Date().toISOString(),
      status: 'pending',
      error: null
    };

    fs.appendFileSync(ASSIGNMENTS_FILE, JSON.stringify(assignment) + '\n', 'utf8');

    console.log(`[Assigner] [FILE] ✅ 写入待分配记录: ${assignment.id}`);
    return { success: true, queueId: assignment.id, mode: 'file', duplicate: false };
  } catch (err) {
    console.error(`[Assigner] [FILE] ❌ 写入待分配记录失败: ${err.message}`);
    return { success: false, error: err.message, mode: 'file' };
  }
}

/**
 * 记录分配到 Redis 日志队列
 */
async function logAssignmentToRedis(task, agentType, queueId) {
  try {
    // 改用内存缓存记录分配日志（替代 Redis）
    const logKey = `task:assign:log:${task.id}`;
    const logEntry = {
      taskId: task.id,
      agentType: agentType,
      queueId: queueId,
      assignedAt: Date.now(),
      mode: 'memory'
    };
    
    // 写入内存缓存
    assignLogCache.set(logKey, logEntry);
    
    // 定期清理过期缓存
    if (assignLogCache.size > 1000) {
      const now = Date.now();
      for (const [key, val] of assignLogCache) {
        if (now - val.assignedAt > 300000) assignLogCache.delete(key);
      }
    }
  } catch (error) {
    console.warn(`[Assigner] [CACHE] 记录分配日志失败:`, error.message);
  }
}

/**
 * 写入 pending_assignments 表
 * ✅ 新增：检查是否已存在，避免重复分配
 */
async function writePendingAssignmentTable(task, agentId, agentType) {
  try {
    const pendingDal = require('../src/db/pending-assignments-dal');
    
    // ✅ 检查任务当前状态（必须是 pending）
    const currentTask = db.tasks.get(task.id);
    if (!currentTask || currentTask.status !== 'pending') {
      console.log(`[Assigner] ⚠️ 任务 ${task.id} 状态不是 pending (当前: ${currentTask?.status}), 跳过分配`);
      return { success: true, skipped: true, reason: 'not pending' };
    }

    // ✅ 检查是否已存在该任务的 pending/processing 记录
    const existingRecords = pendingDal.getRecordsByTaskId(task.id);
    const activeRecord = existingRecords.find(r => 
      r && (r.status === 'pending' || r.status === 'processing')
    );
    
    if (activeRecord) {
      console.log(`[Assigner] ⚠️ 任务 ${task.id} 已有活跃记录 (${activeRecord.id}), 状态: ${activeRecord.status}, 跳过`);
      return { success: true, duplicate: true, recordId: activeRecord.id };
    }
    
    // ✅ 再次检查任务状态（防止竞态条件）
    const currentTaskCheck = db.tasks.get(task.id);
    if (!currentTaskCheck || currentTaskCheck.status !== 'pending') {
      console.log(`[Assigner] ⚠️ 任务 ${task.id} 状态不是 pending (当前: ${currentTaskCheck?.status}), 跳过分配`);
      return { success: true, skipped: true, reason: 'not pending' };
    }
    
    const recordId = `assignment-${agentId}-${task.id}-${Date.now()}`;
    pendingDal.addRecord({
      id: recordId,
      taskId: task.id,
      agentId: agentId,
      taskTitle: task.title,
      taskDescription: task.description || task.user_description || '',
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    console.log(`[Assigner] ✅ 已写入 pending_assignments 表 (ID: ${recordId})`);
    return { success: true, recordId, duplicate: false };
  } catch (assignErr) {
    console.error(`[Assigner] ❌ 写入 pending_assignments 表失败:`, assignErr.message);
    return { success: false, error: assignErr.message };
  }
}

/**
 * 更新任务分配状态
 */
function updateTaskForAssignment(task, agentId) {
  try {
    // ✅ 检查任务当前状态，确保只能分配 pending 任务
    const currentTask = db.tasks.get(task.id);
    if (currentTask && currentTask.status !== 'pending') {
      console.log(`[Assigner] ⚠️ 跳过任务 ${task.id}: 当前状态 ${currentTask.status}，只能分配 pending 状态的任务`);
      return;
    }
    
    db.tasks.update(task.id, {
      assigned_agent: agentId,
      assigned_at: new Date().toISOString(),
      status: 'assigned'  // ✅ 改为 'assigned'，等 Subagent 启动后再改为 'doing'
    });
    console.log(`[Assigner] 📝 已更新任务 assigned_agent = ${agentId}, status = assigned`);
  } catch (e) {
    console.error(`[Assigner] ⚠️ 更新任务状态失败:`, e.message);
  }
}

/**
 * 分配任务(仅分配,不启动 Subagent)
 *
 * 流程:
 * 1. 选择合适的 Agent
 * 2. 写入 pending_assignments 表
 * 3. 更新任务状态
 *
 * 不再负责:
 * - ❌ 启动 Subagent
 * - ❌ 监控任务状态
 */
async function assignTask(task) {
  const maxRetries = 3;
  let retryCount = 0;

  // ✅ 防重复处理：检查是否已处理过
  if (processedTaskIds.has(task.id)) {
    console.log(`[Assigner] ⚠️ 任务 ${task.id} 已处理过，跳过`);
    return { success: true, skipped: true, reason: 'already processed' };
  }

  while (retryCount < maxRetries) {
    try {
      console.log(`\n[${new Date().toISOString()}] 分配任务 (尝试 ${retryCount + 1}/${maxRetries})`);
      console.log(`  任务: ${task.title}`);
      console.log(`  ID: ${task.id}`);

      // 选择 Agent 类型
      const agentType = selectAgentType(task);
      const agentId = selectAgentFromPool(agentType);

      console.log(`  分配给: ${agentId} (${agentType}池)`);

      // 写入 pending_assignments 表
      const tableResult = await writePendingAssignmentTable(task, agentId, agentType);

      if (!tableResult.success) {
        console.log(`[Assigner] ❌ 写入 pending_assignments 表失败,终止分配`);
        return {
          success: false,
          taskId: task.id,
          error: 'Failed to write pending_assignments record'
        };
      }

      // 降级路径:Redis 队列
      if (REDIS_QUEUE_ENABLED) {
        const queueResult = await writePendingAssignmentRedis(task, agentType);

        if (!queueResult.success) {
          console.log(`[Assigner] ⚠️ Redis 队列失败,使用文件轮询`);
        }
      }

      // 更新任务状态
      updateTaskForAssignment(task, agentId);

      // ✅ 标记为已处理
      processedTaskIds.add(task.id);
      if (processedTaskIds.size > MAX_PROCESSED_TRACKING) {
        const arr = Array.from(processedTaskIds);
        processedTaskIds.clear();
        arr.slice(500).forEach(id => processedTaskIds.add(id));
      }

  // ✅ 通过 Federation 发送 task_assigned 消息给 Agent
  // 由 Agent 的 listener 收到消息后启动 Subagent
  const messageResult = await sendTaskAssignedMessage(agentId, task);
  if (!messageResult.success) {
    console.log(`[Assigner] ⚠️ 发送 task_assigned 消息失败，但任务已分配`);
  }


    } catch (err) {
      retryCount++;
      console.error(`[Assigner] ❌ 分配失败 (尝试 ${retryCount}/${maxRetries}):`, err.message);

      if (retryCount >= maxRetries) {
        console.error(`[Assigner] 🚫 达到最大重试次数`);
        return {
          success: false,
          taskId: task.id,
          error: err.message,
          retryCount: maxRetries
        };
      }

      await sleep(2000 * retryCount);
    }
  }
}

/**
 * Sleep 工具函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 自动分配器主循环(仅分配,不启动 Subagent)
 */
class AutoTaskAssigner {
  constructor(options = {}) {
    this.running = false;
    this.checkInterval = options.checkInterval || 30000; // 30秒
    this.intervalId = null;
  }

  /**
   * 启动分配器
   */
  start() {
    if (this.running) {
      console.log('[Assigner] 分配器已在运行');
      return;
    }

    this.running = true;
    console.log(`[Assigner] 启动任务分配器 v4.0`);
    console.log(`  检查间隔: ${this.checkInterval / 1000}秒`);

    // 立即执行一次
    this.checkAndAssign();

    // 设置定时轮询
    this.intervalId = setInterval(() => {
      this.checkAndAssign();
    }, this.checkInterval);

    console.log('[Assigner] 定时轮询已启动');
  }

  /**
   * 停止分配器
   */
  stop() {
    if (!this.running) {
      console.log('[Assigner] 分配器未运行');
      return;
    }

    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('[Assigner] 分配器已停止');
  }

  /**
   * 检查并分配任务
   */
  async checkAndAssign() {
    console.log(`\n[${new Date().toISOString()}] ========== 开始检查任务 ==========`);

    try {
      const pendingTasks = this.getPendingTasks();

      if (pendingTasks.length === 0) {
        console.log('[Assigner] 没有待分配的任务');
        return;
      }

      console.log(`[Assigner] 发现 ${pendingTasks.length} 个待分配任务`);

      // 遍历任务并分配
      for (const task of pendingTasks) {
        const result = await this.assignTask(task);

        // 记录分配结果
        if (result.success) {
          console.log(`[Assigner] ✅ 任务 ${task.id} 已分配给 ${result.agentId}`);
        } else {
          console.log(`[Assigner] ⚠️ 任务 ${task.id} 分配失败: ${result.error}`);
        }
      }

    } catch (err) {
      console.error('[Assigner] 检查任务时出错:', err.message);
    }
  }

  /**
   * 获取待分配任务
   */
  getPendingTasks() {
    return getPendingTasks();
  }

  /**
   * 分配任务
   */
  async assignTask(task) {
    return await assignTask(task);
  }

  /**
   * 根据任务选择 Agent
   */
  selectAgent(task) {
    return selectAgent(task);
  }
}

/**
 * 创建分配器实例
 */
function createAssigner(options = {}) {
  return new AutoTaskAssigner(options);
}

/**
 * 通过 Federation 发送 task_assigned 消息给指定 Agent
 * 单播模式：只发送给目标 Agent
 */
async function sendTaskAssignedMessage(agentId, task) {
  if (!FEDERATION_ENABLED) {
    console.log(`[Assigner] ⚠️ Federation 禁用，跳过发送 task_assigned 消息`);
    return { success: false, error: 'Federation disabled' };
  }

  try {
    console.log(`[Assigner] 📤 通过 Federation 发送 task_assigned 消息给 ${agentId}`);
    
    // 构建 postData
    const postData = JSON.stringify({
      taskId: task.id,
      agentId: agentId,
      taskTitle: task.title,
      taskDescription: task.description || task.user_description || '无',
      type: 'new_task'
    });

    const options = {
      hostname: GATEWAY_HOST,
      port: GATEWAY_PORT,
      path: '/api/tasks/notify-agent',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            if (result.success || result.code === 200) {
              console.log(`[Assigner] ✅ task_assigned 消息已发送给 ${agentId}`);
              resolve({ success: true });
            } else {
              console.error(`[Assigner] ❌ 发送失败:`, result);
              resolve({ success: false, error: result.message || 'Failed to send' });
            }
          } catch (e) {
            console.error(`[Assigner] ❌ JSON 解析错误:`, e.message, 'Body:', body);
            resolve({ success: false, error: `Parse error: ${e.message}` });
          }
        });
      });
      req.on('error', (e) => {
        console.error(`[Assigner] ❌ 请求失败:`, e.message);
        resolve({ success: false, error: e.message });
      });
      req.setTimeout(5000, () => {
        req.destroy();
        resolve({ success: false, error: 'Timeout' });
      });
      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.error(`[Assigner] ❌ sendTaskAssignedMessage 异常:`, error.message);
    console.error(`[Assigner] ❌ 错误堆栈:`, error.stack);
    return { success: false, error: error.message };
  }
}

module.exports = {
  AutoTaskAssigner,
  createAssigner,
  selectAgent,
  selectAgentType,
  getPendingTasks,
  assignTask,
  sendTaskAssignedMessage
};

// 启动逻辑（仅当直接运行时执行）

// 启动主循环
async function start() {
  console.log(`[Assigner] 🚀 v4.5 已启动（Federation 通知 Agent）`);
  console.log(`[Assigner] 📋 每个 Agent 独立配额，总计 30+ 并发`);
  
  setInterval(async () => {
    try {
      const tasks = getPendingTasks();
      console.log(`\n[${new Date().toISOString()}] 待分配：${tasks.length}个`);
      
      if (tasks.length === 0) return;
      
      for (const task of tasks.slice(0, 5)) {
        await assignTask(task);
      }
    } catch (e) {
      console.error(`[Assigner] ❌ 轮询异常:`, e.message);
    }
  }, 30000);
}

module.exports = {
  AutoTaskAssigner,
  createAssigner,
  selectAgent,
  selectAgentType,
  getPendingTasks,
  assignTask,
  sendTaskAssignedMessage,
  main: start
};

// 启动主循环
if (require.main === module) {
  console.log('[Assigner] 🚀 启动脚本调用 main()...');
  start();
}
