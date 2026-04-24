/**
 * 从聊天消息自动创建任务 - SQLite 版本
 * 替代原有的 JSON 文件写入
 * 
 * v1.1 新增：自动关联相关文档
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const { getDAL } = require('../db/data-access-layer');
const { generateShortId } = require('../db/uuid-generator');
const taskIntentDetector = require('../task-intent-detector');
const Database = require('better-sqlite3');
const dedupManager = require('../lib/redis/dedup-manager');
const taskDedup = require('../lib/redis/task-dedup-manager');

const dal = getDAL();

/**
/**
 * 生成初步分析（thought）
 * 
 * v1: 使用基于规则的简单分析（无需 LLM）
 * v2: 可扩展为调用 LLM API
 */
function generateInitialThought(message, title) {
  // 基于标题和消息生成简单的初步分析
  let thought = '';
  
  // 分析任务类型
  const lowerTitle = title.toLowerCase();
  
  let taskType = '一般任务';
  if (lowerTitle.includes('修复') || lowerTitle.includes('bug') || lowerTitle.includes('错误')) {
    taskType = 'Bug 修复';
  } else if (lowerTitle.includes('开发') || lowerTitle.includes('实现') || lowerTitle.includes('创建')) {
    taskType = '功能开发';
  } else if (lowerTitle.includes('研究') || lowerTitle.includes('调研') || lowerTitle.includes('分析')) {
    taskType = '调研分析';
  } else if (lowerTitle.includes('测试')) {
    taskType = '测试任务';
  } else if (lowerTitle.includes('部署') || lowerTitle.includes('安装')) {
    taskType = '部署运维';
  }
  
  // 生成分析
  thought = '【初步分析】' + '\n' + '\n';
  thought += '1. 任务类型：' + taskType + '\n';
  thought += '2. 任务目标：' + title + '\n';
  thought += '3. 用户需求：' + message.substring(0, 100) + (message.length > 100 ? '...' : '') + '\n' + '\n';
  thought += '4. 关键要点：' + '\n';
  
  if (taskType === 'Bug 修复') {
    thought += '   - 定位问题根因' + '\n';
    thought += '   - 查找相关日志/代码' + '\n';
    thought += '   - 验证修复效果' + '\n';
  } else if (taskType === '功能开发') {
    thought += '   - 理解需求细节' + '\n';
    thought += '   - 设计实现方案' + '\n';
    thought += '   - 编写测试用例' + '\n';
  } else if (taskType === '调研分析') {
    thought += '   - 收集相关信息' + '\n';
    thought += '   - 分析对比方案' + '\n';
    thought += '   - 得出结论建议' + '\n';
  } else {
    thought += '   - 理解任务要求' + '\n';
    thought += '   - 制定执行计划' + '\n';
    thought += '   - 逐步完成任务' + '\n';
  }
  
  thought += '\n' + '5. 潜在挑战：' + '\n';
  thought += '   - 需要充分理解需求' + '\n';
  thought += '   - 可能涉及多模块修改' + '\n';
  thought += '   - 需要测试验证' + '\n';
  
  return thought;
}

/**
 * 根据任务标题判断任务类型
 * @param {string} title - 任务标题
 * @returns {string} 任务类型
 */
function detectTaskType(title) {
  const lowerTitle = title.toLowerCase();
  
  if (lowerTitle.includes('修复') || lowerTitle.includes('bug') || lowerTitle.includes('问题') || lowerTitle.includes('异常')) {
    return 'fix';
  } else if (lowerTitle.includes('开发') || lowerTitle.includes('实现') || lowerTitle.includes('编写')) {
    return 'development';
  } else if (lowerTitle.includes('调研') || lowerTitle.includes('研究') || lowerTitle.includes('分析')) {
    return 'research';
  } else if (lowerTitle.includes('文档') || lowerTitle.includes('说明') || lowerTitle.includes('记录')) {
    return 'documentation';
  } else if (lowerTitle.includes('测试') || lowerTitle.includes('验收')) {
    return 'testing';
  } else if (lowerTitle.includes('部署') || lowerTitle.includes('上线') || lowerTitle.includes('发布')) {
    return 'deployment';
  } else {
    return 'general';
  }
}

/**
 * 生成任务步骤拆分（breakdown）
 * @param {Object} taskData - 任务数据
 * @returns {Object} breakdown 对象
 */
function generateBreakdown(taskData) {
  const taskType = detectTaskType(taskData.title);
  
  const breakdown = {
    source: 'auto-generated',
    generated_at: new Date().toISOString(),
    task_type: taskType,
    steps: []
  };
  
  // 任务类型对应的默认步骤模板
  const stepTemplates = {
    // 通用任务
    general: [
      { id: 1, name: '需求分析', description: '分析任务需求，明确目标和范围', status: 'pending' },
      { id: 2, name: '方案设计', description: '设计实现方案和技术路线', status: 'pending' },
      { id: 3, name: '实现', description: '按照方案实现功能', status: 'pending' },
      { id: 4, name: '测试', description: '编写测试用例并进行测试', status: 'pending' },
      { id: 5, name: '验收', description: '完成任务验收和文档整理', status: 'pending' }
    ],
    // 开发任务
    development: [
      { id: 1, name: '环境准备', description: '搭建开发环境，检查依赖', status: 'pending' },
      { id: 2, name: '需求分析', description: '分析需求，理解功能点', status: 'pending' },
      { id: 3, name: '代码实现', description: '编写代码实现功能', status: 'pending' },
      { id: 4, name: '单元测试', description: '编写并运行单元测试', status: 'pending' },
      { id: 5, name: '代码审查', description: '进行代码审查和优化', status: 'pending' },
      { id: 6, name: '集成测试', description: '进行集成测试', status: 'pending' },
      { id: 7, name: '部署上线', description: '部署到测试/生产环境', status: 'pending' }
    ],
    // 修复任务
    fix: [
      { id: 1, name: '问题定位', description: '定位问题根因，分析日志', status: 'pending' },
      { id: 2, name: '方案设计', description: '设计修复方案', status: 'pending' },
      { id: 3, name: '修复实现', description: '实施修复', status: 'pending' },
      { id: 4, name: '验证修复', description: '验证问题已修复', status: 'pending' },
      { id: 5, name: '回归测试', description: '确保修复没有引入新问题', status: 'pending' }
    ],
    // 调研任务
    research: [
      { id: 1, name: '背景调研', description: '了解背景和相关技术', status: 'pending' },
      { id: 2, name: '方案收集', description: '收集可能的解决方案', status: 'pending' },
      { id: 3, name: '分析对比', description: '分析各方案的优缺点', status: 'pending' },
      { id: 4, name: '总结建议', description: '给出结论和建议', status: 'pending' }
    ],
    // 文档任务
    documentation: [
      { id: 1, name: '需求收集', description: '收集文档需求和素材', status: 'pending' },
      { id: 2, name: '大纲设计', description: '设计文档大纲', status: 'pending' },
      { id: 3, name: '内容编写', description: '编写文档内容', status: 'pending' },
      { id: 4, name: '审核校对', description: '审核和校对文档', status: 'pending' }
    ],
    // 测试任务
    testing: [
      { id: 1, name: '测试计划', description: '制定测试计划', status: 'pending' },
      { id: 2, name: '用例设计', description: '设计测试用例', status: 'pending' },
      { id: 3, name: '环境准备', description: '准备测试环境', status: 'pending' },
      { id: 4, name: '用例执行', description: '执行测试用例', status: 'pending' },
      { id: 5, name: '缺陷报告', description: '记录发现的缺陷', status: 'pending' },
      { id: 6, name: '测试总结', description: '编写测试报告', status: 'pending' }
    ],
    // 部署任务
    deployment: [
      { id: 1, name: '环境检查', description: '检查目标环境', status: 'pending' },
      { id: 2, name: '资源准备', description: '准备部署资源', status: 'pending' },
      { id: 3, name: '执行部署', description: '执行部署操作', status: 'pending' },
      { id: 4, name: '验证部署', description: '验证部署结果', status: 'pending' },
      { id: 5, name: '监控确认', description: '确认监控正常运行', status: 'pending' }
    ]
  };
  
  // 获取对应任务类型的步骤模板
  breakdown.steps = stepTemplates[taskType] || stepTemplates.general;
  
  return breakdown;
}

/**
 * 从消息中提取关键词
 * 用于搜索相关文档
 */
function extractKeywords(message) {
  // 移除常见停用词
  const stopWords = ['的', '是', '在', '有', '和', '了', '我', '你', '他', '她', '它', '们', '这', '那', '要', '做', '帮我', '请', '需要', '帮我', '帮我', '要', '可以', '一下', '什么', '怎么', '如何', '为什么', '的时候'];
  
  // 提取中文词汇（改进分词：按2-4字分词）
  const keywords = new Set();
  
  // 2字词
  const twoChars = message.match(/[\u4e00-\u9fa5]{2}/g) || [];
  for (const word of twoChars) {
    if (!stopWords.includes(word)) {
      keywords.add(word);
    }
  }
  
  // 3字词
  const threeChars = message.match(/[\u4e00-\u9fa5]{3}/g) || [];
  for (const word of threeChars) {
    if (!stopWords.includes(word)) {
      keywords.add(word);
    }
  }
  
  // 4字词（专业术语）
  const fourChars = message.match(/[\u4e00-\u9fa5]{4}/g) || [];
  for (const word of fourChars) {
    if (!stopWords.includes(word)) {
      keywords.add(word);
    }
  }
  
  // 返回关键词数组，优先4字词
  const result = Array.from(keywords);
  // 把4字词放前面
  result.sort((a, b) => b.length - a.length);
  
  return result.slice(0, 5);  // 最多取5个关键词
}

/**
 * 搜索相关文档
 * 根据关键词在文档索引中搜索
 */
function searchRelatedDocs(keywords, limit = 3) {
  if (!keywords || keywords.length === 0) return [];
  
  try {
    const db = new Database('./data/tasks.db');
    const results = [];
    
    // 对每个关键词搜索
    for (const keyword of keywords) {
      const docs = db.prepare(`
        SELECT id, title, path, description 
        FROM documents_index 
        WHERE title LIKE ? OR description LIKE ?
        LIMIT ?
      `).all(`%${keyword}%`, `%${keyword}%`, limit);
      
      for (const doc of docs) {
        // 避免重复
        if (!results.find(r => r.id === doc.id)) {
          results.push({
            id: doc.id,
            title: doc.title,
            path: doc.path,
            relevance: keyword  // 记录匹配的关键词
          });
        }
      }
      
      // 最多返回5个相关文档
      if (results.length >= 5) break;
    }
    
    db.close();
    return results.slice(0, 5);
  } catch (err) {
    console.error(`[AUTO-TASK-SQLite] 文档搜索失败:`, err.message);
    return [];
  }
}

/**
 * 格式化相关文档为任务描述
 */
function formatRelatedDocsForDescription(docs) {
  if (!docs || docs.length === 0) return '';
  
  let text = '\n\n## 📚 相关文档\n\n';
  text += '以下文档可能对完成任务有帮助：\n\n';
  
  for (const doc of docs) {
    text += `- **${doc.title}** \`${doc.path}\`\n`;
  }
  
  text += '\n> 💡 建议先阅读相关文档，了解背景和上下文。\n';
  
  return text;
}

// 直接使用主检测器的逻辑，避免重复代码
function hasTaskIntent(message) {
  return taskIntentDetector.hasTaskIntent(message);
}

function extractTaskFields(message) {
  let priority = 'P2';
  let quadrant = 2;
  
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes('紧急') || lowerMsg.includes('马上') || lowerMsg.includes('立刻')) {
    priority = 'P0';
    quadrant = 1;
  } else if (lowerMsg.includes('重要') || lowerMsg.includes('关键')) {
    priority = 'P1';
    quadrant = 2;
  }
  
  // 提取标题
  let title = message.replace(/^(帮我|要做|需要|请)\s*/, '').substring(0, 50);
  if (title.length < 5) title = message.substring(0, 30) + '...';
  
  return { title, priority, quadrant, description: message };
}

router.post('/', async (req, res) => {
  const { message, sourceChannel } = req.body;
  
  if (!message) {
    return res.status(400).json({ success: false, error: '消息内容不能为空' });
  }
  
  console.log(`[AUTO-TASK-SQLite] 收到消息：${message.substring(0, 50)}...`);
  
  // 1. 检测任务意图
  if (!hasTaskIntent(message)) {
    return res.json({ success: false, isTask: false, message: '未检测到任务意图' });
  }
  
  console.log(`[AUTO-TASK-SQLite] ✅ 检测到任务意图`);
  
  // ========== v1.1 新增：任务级去重检查 ==========
  console.log(`[AUTO-TASK-SQLite] [TASK DEDUP] 开始任务级去重检查`);
  
  const taskForDedup = {
    type: 'default',
    title: taskIntentDetector.summarizeTitle(message),
    description: message,
    sourceChannel: sourceChannel || 'unknown'
  };
  
  let taskDedupResult = { isDuplicate: false, similarTasks: [] };
  try {
    taskDedupResult = await taskDedup.deduplicateTask(taskForDedup, 60 * 60);
  } catch (dedupError) {
    console.log(`[AUTO-TASK-SQLite] Redis 去重不可用，跳过: ${dedupError.message}`);
  }
  
  if (taskDedupResult.isDuplicate) {
    console.log(`[AUTO-TASK-SQLite] ⚠️ 任务已存在（任务级去重）`);
    return res.json({
      success: true,
      isTask: true,
      taskId: null,
      alreadyExists: true,
      message: taskDedupResult.message || '任务已存在（任务级去重）',
      dedupSource: 'task-dedup',
      dedupResult: taskDedupResult
    });
  }
  
  if (taskDedupResult.similarTasks && taskDedupResult.similarTasks.length > 0) {
    console.log(`[AUTO-TASK-SQLite] ⚠️ 发现 ${taskDedupResult.similarTasks.length} 个相似任务`);
    // 可以选择提示用户
  }
  
  // ========== v1.1 新增：任务级去重检查结束 ==========
  
  // 2. Redis 去重检查（消息级，5分钟窗口）
  const messageHash = crypto.createHash('md5').update(message.trim().toLowerCase()).digest('hex').substring(0, 16);
  console.log(`[AUTO-TASK-SQLite] [REDIS DEDUP] 检查重复: hash=${messageHash}`);
  
  try {
    // 尝试初始化 Redis 连接（如果未初始化）
    if (!dedupManager.isRedisInitialized) {
      console.log(`[AUTO-TASK-SQLite] [REDIS DEDUP] Redis 未初始化，尝试连接`);
      const Redis = require('ioredis');
      const redis = new Redis();
      dedupManager.initRedis(redis);
    }
    
    // 检查是否重复
    const isDuplicate = await dedupManager.isDuplicateMessage(messageHash);
    
    if (isDuplicate) {
      console.log(`[AUTO-TASK-SQLite] ⚠️ 任务已存在（Redis 去重）：hash=${messageHash}`);
      return res.json({
        success: true,
        isTask: true,
        taskId: null,  // 无法从 Redis 获取 taskId
        alreadyExists: true,
        message: `任务已存在（去重）：hash=${messageHash}`,
        dedupSource: 'redis'
      });
    }
  } catch (redisErr) {
    console.warn(`[AUTO-TASK-SQLite] [REDIS DEDUP] Redis 检查失败，降级到 SQLite: ${redisErr.message}`);
    // Redis 不可用时降级到 SQLite 检查
    try {
      const existingTask = dal.checkDuplicateTask(messageHash, 60);
      if (existingTask) {
        console.log(`[AUTO-TASK-SQLite] ⚠️ 任务已存在（SQLite 去重）：${existingTask.title}`);
        return res.json({
          success: true,
          isTask: true,
          taskId: existingTask.id,
          alreadyExists: true,
          message: `任务已存在：${existingTask.title}`,
          task: existingTask,
          dedupSource: 'sqlite'
        });
      }
    } catch (sqliteErr) {
      console.error(`[AUTO-TASK-SQLite] [DEDUP] SQLite 检查也失败，继续创建: ${sqliteErr.message}`);
    }
  }
  
  // 3. 提取字段
  const fields = extractTaskFields(message);
  
  try {
    // 4. 检查是否已存在（通过 hash，60分钟窗口防止重复创建）
    console.log(`[AUTO-TASK-SQLite] [DEDUP] SQLite 检查重复: hash=${messageHash}`);
    const existingTask = dal.checkDuplicateTask(messageHash, 60);
    
    if (existingTask) {
      console.log(`[AUTO-TASK-SQLite] ⚠️ 任务已存在：${existingTask.title}`);
      return res.json({
        success: true,
        isTask: true,
        taskId: existingTask.id,
        alreadyExists: true,
        message: `任务已存在：${existingTask.title}`,
        task: existingTask,
        dedupSource: 'sqlite'
      });
    }
    
    // 5. 搜索相关文档
    const keywords = extractKeywords(message);
    console.log(`[AUTO-TASK-SQLite] 提取关键词:`, keywords.join(', '));
    
    const relatedDocs = searchRelatedDocs(keywords);
    console.log(`[AUTO-TASK-SQLite] 找到 ${relatedDocs.length} 个相关文档`);
    
    // 6. 生成增强的任务描述
    const docsInfo = formatRelatedDocsForDescription(relatedDocs);
    const enhancedDescription = fields.description + docsInfo;
    
    // 7. 创建新任务（SQLite）
    const id = generateShortId('task');
    
    // 生成任务步骤拆分（breakdown）
    const taskData = {
      title: fields.title,
      description: enhancedDescription,
      priority: fields.priority,
      quadrant: fields.quadrant
    };
    const breakdown = generateBreakdown(taskData);

    // 生成初步分析（thought）
    console.log(`[AUTO-TASK-SQLite] 生成初步分析...`);
    const thought = generateInitialThought(message, fields.title);
    console.log(`[AUTO-TASK-SQLite] 初步分析生成完成: ${thought.substring(0, 50)}...`);

    const newTask = {
      id,
      title: fields.title,
      description: enhancedDescription,  // 使用增强的描述
      user_description: message,
      message_hash: messageHash,
      priority: fields.priority,
      quadrant: fields.quadrant,
      status: 'pending',
      created_at: new Date().toISOString(),
      analysis: { thought: thought, conclusion: '' },
      breakdown: breakdown,
      execution_log: [{
        timestamp: new Date().toISOString(),
        action: 'CREATE',
        detail: `从聊天消息自动创建（SQLite），关联 ${relatedDocs.length} 个文档，步骤数: ${breakdown.steps.length}`,
        source: 'api',
        sourceDetail: 'POST /api/tasks/from-chat-sqlite'
      }],
      issues: [],
      related_docs: relatedDocs.map(doc => doc.path),  // 存储文档路径
      test_acceptance: { plan: '', cases: [], result: '' },
      reflection: {},  // 反思应用（v7.0）
      audit_monitor: {},  // 审计监控（v7.0）
      process_validation: {},
      quality_acceptance: {}
    };
    
    dal.createTask(newTask);
    console.log(`[AUTO-TASK-SQLite] ✅ 任务已创建：${id} - ${fields.title}`);
    
    // 8. 记录到 Redis 去重（设置 5 分钟过期）
    try {
      if (dedupManager.isRedisInitialized) {
        await dedupManager.recordMessage(messageHash, id);
      }
    } catch (redisErr) {
      console.warn(`[AUTO-TASK-SQLite] [REDIS DEDUP] 记录 Redis 失败: ${redisErr.message}`);
    }
    
    return res.json({
      success: true,
      isTask: true,
      taskId: id,
      alreadyExists: false,
      message: `✅ 任务已创建：${fields.title}`,
      task: newTask,
      dedupSource: 'sqlite'
    });
    
  } catch (err) {
    console.error(`[AUTO-TASK-SQLite] ❌ 创建失败：`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
