/**
 * 任务意图检测器 v2.2 - 增强版
 * 支持智能标题总结、增强时间提取、全字段提取
 */

// ==================== 关键词库 ====================
const TASK_KEYWORDS = [
  '安排', '计划', '待办', 'todo',
  '记得', '别忘了', '提醒我', '完成之前', '之前要做',
  '修复', '实现', '开发', '调研', '测试', '部署', '发布',
  '要做', '需要做', '得做', '要做的事情', '要做的事',
  '了解', '对比', '学习', '研究', '分析', '整理',
  // 新增关键词 - 更容易被识别为任务
  '调整', '检查', '修改', '创建', '增加', '恢复', '提升',
  '模块化', '重构', '优化', '升级', '迁移',
  '帮我', '让我', '请', '麻烦', '需要',
  '问题', 'bug', '缺陷', '错误', '异常',
  // 新增关键词 - 任务跟进相关
  '跟进', '继续', '步骤', '后续', '完善', '完成'
];

// 灵活匹配的任务关键词
const TASK_FLEX_PATTERNS = [
  /创建.*任务/, /新建.*任务/, /添加.*任务/, /建一个任务/, /建个任务/,
  /了解.*功能/, /了解.*流程/, /对比.*功能/, /对比.*流程/, /整理.*功能/,
  /用任务.*跟进/, /继续.*完成/, /完成.*步骤/, /后续.*工作/
];

// 增强版时间表达式
const TIME_EXPRESSIONS = [
  /(\d{4}[-/]\d{1,2}[-/]\d{1,2}[\sT]?\d{0,2}:\d{0,2}?)/, // 2024-01-01
  /(\d{1,2}月\d{1,2}日)/,
  /(\d{1,2}:\d{2} (上午 | 下午 | 点))/,
  /(明天 | 后天 | 大后天 | 本周五 | 下周一 | 本月底 | 月底 | 年底)/,
  /(下周 | 下个月 | 下季度) (初 | 中 | 底 | 末)?/,
  /\d+ 天(后|内)/,
  /\d+ 周(后|内)/,
  /\d+ 个月(后|内)/,
  /(之前 | 之前完成 | 点前 | 号前)/,
  /(本周|下周|本月|本季度)[前后]/,
  /下个?(周|月|季度)[前后]/,
  /本(周|月|年)底/,
  /明(天|日)/
];

// 优先级关键词 - P0/P1/P2/P3 格式
const PRIORITY_KEYWORDS = {
  P0: ['紧急', '优先', '马上', '立刻', '尽快', '加急', '重要且紧急', '火烧眉毛', 'P0', '最高'],
  P1: ['重要', '关键', '核心', 'P1'],
  P2: ['普通', '正常', '一般', 'P2'],
  P3: ['不重要', '有空再做', '不紧急', '可有可无', '低优先级', 'P3']
};

// 象限关键词
const QUADRANT_KEYWORDS = {
  1: ['重要且紧急', '第一象限', '马上做'],
  2: ['重要不紧急', '第二象限', '计划做'],
  3: ['紧急不重要', '第三象限', '委托做'],
  4: ['不紧急不重要', '第四象限', '少做']
};

// ==================== 核心函数 ====================

/**
 * 检测消息是否包含任务意图
 * 优化策略：增加多个判断条件，避免过于宽松
 */
function hasTaskIntent(message) {
  if (!message || typeof message !== 'string') return false;
  
  const msg = message.trim();
  if (msg.length < 3) return false; // 太短的消息默认不是任务
  
  const lowerMsg = msg.toLowerCase();
  
  // === 0. 排除明显非任务消息 ===
  // 排除问候语、闲聊、简单问答等
  
  // 排除常见问候语
  const GREETING_PATTERNS = [
    /^你好/,
    /^您好/,
    /^hi\b/,
    /^hello\b/,
    /^早上好/,
    /^中午好/,
    /^晚上好/,
    /^(今天|今日)天气/,
    /^(今天|今日)天气不错/,
    /^(今天|今日)心情/,
    /^在吗/,
    /^吃饭没/,
    /^吃了/,
    /^好的/,
    /^嗯/,
    /^哦/
  ];
  
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(lowerMsg)) return false;
  }
  
  // === 1. 灵活模式匹配（这些模式已经足够明确） ===
  for (const pattern of TASK_FLEX_PATTERNS) {
    if (pattern.test(message)) return true;
  }
  
  // === 2. 关键词匹配（需要配合动作词）===
  // 检查是否有"任务关键词"且包含动作动词
  const taskKeywordsWithAction = TASK_KEYWORDS.filter(k => 
    !['任务', '问题', 'bug', '缺陷', '错误', '异常'].includes(k)
  );
  
  let hasTaskWithVerb = false;
  for (const keyword of taskKeywordsWithAction) {
    if (message.includes(keyword)) {
      // 检查是否包含动作动词
      const actionVerbs = ['创建', '新建', '安排', '计划', '修复', '实现', '开发', '调研', '测试', '部署', '发布', '完成', '做', '写', '整理', '分析', '检查', '修改', '调整', '优化', '提升', '了解', '对比', '学习', '研究', '跟进'];
      if (actionVerbs.some(v => message.includes(v))) {
        hasTaskWithVerb = true;
        break;
      }
    }
  }
  
  if (hasTaskWithVerb) return true;
  
  // === 3. 特殊检测：包含"任务"且包含动作词 ===
  if (message.includes('任务') && /(创建 | 新建 | 添加 | 安排 | 完成 | 做)/.test(message)) {
    return true;
  }
  
  // === 4. 时间表达式 + 动作词组合检测（必须同时满足）===
  const hasTimeExpression = TIME_EXPRESSIONS.some(pattern => pattern.test(message));
  const hasActionVerb = /(完成 | 做 | 处理 | 提交 | 发送 | 写 | 开发 | 修复 | 实现 | 测试 | 部署)/.test(message);
  
  if (hasTimeExpression && hasActionVerb) return true;
  
  // === 5. 祈使句模式（必须是完整祈使句）===
  const imperativePattern = /^(请|帮我|麻烦你)\s+(修复|实现|开发|写|创建|添加|删除|修改|安排|计划)/;
  if (imperativePattern.test(message.trim()) && message.length > 8) {
    return true;
  }
  
  // === 6. 排除简单陈述句 ===
  // 如果只是陈述一个事实，没有明确动作意图，排除
  const statementPatterns = [
    /^(今天|今日|明天|后天)\s+(是|有|在)/,
    /^(我|你|他|我们|大家)\s+(在|好|开心|高兴|难过)/,
    /^(今天|今日)是/
  ];
  
  for (const pattern of statementPatterns) {
    if (pattern.test(lowerMsg)) return false;
  }
  
  return false;
}

/**
 * 智能总结标题 (模拟 AI 总结)
 * 策略：提取核心动宾结构，去除冗余词
 */
function summarizeTitle(message) {
  // 尝试提取引号内内容
  const quoteMatch = message.match(/["']([^"']{5,50})["']/);
  if (quoteMatch) return quoteMatch[1].trim();
  
  // 尝试提取"关于 XXX"的内容
  const aboutMatch = message.match(/关于 ([^，,.。！？\n]{5,30})/);
  if (aboutMatch) return aboutMatch[1].trim();
  
  // 尝试提取动宾结构 (动词 + 名词)
  const verbObjPatterns = [
    /(调研 | 分析 | 了解 | 学习 | 研究 | 对比 | 整理 | 实现 | 修复 | 开发)(.*?)(的 | 并 | 以 | 为| 后| 前|，|。|$)/
  ];
  
  for (const pattern of verbObjPatterns) {
    const match = message.match(pattern);
    if (match && match[0].length > 5 && match[0].length < 60) {
      // 清理冗余词
      let title = match[0].trim()
        .replace(/^(然后 | 主要 | 用来 | 进行)/, '')
        .replace(/(的 | 了 | 这个 | 这些)$/, '');
      return title.length > 50 ? title.substring(0, 50) + '...' : title;
    }
  }
  
  // 默认：取前 30 个字符
  return message.length > 50 ? message.substring(0, 50) + '...' : message;
}

/**
 * 提取时间表达式
 */
function extractDeadline(message) {
  for (const pattern of TIME_EXPRESSIONS) {
    const match = message.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  return null;
}

/**
 * 从消息中提取任务字段
 */
function extractTaskFields(message) {
  const fields = {
    title: summarizeTitle(message),
    user_description: message,  // 用户原话
    description: message,  // Agent 理解的任务描述（初始与原话相同，后续可被 Agent 完善）
    deadline: extractDeadline(message),
    priority: 'P2',  // 默认 P2（中等优先级）
    quadrant: 2,  // 默认第二象限（重要不紧急）
    total_steps: 1,
    completed_steps: 0
  };
  
  // 提取优先级
  for (const [priority, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (message.includes(keyword)) {
        fields.priority = priority;
        break;
      }
    }
    if (fields.priority === priority) break;
  }
  
  // 提取象限
  for (const [quadrant, keywords] of Object.entries(QUADRANT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (message.includes(keyword)) {
        fields.quadrant = parseInt(quadrant);
        break;
      }
    }
    if (fields.quadrant === parseInt(quadrant)) break;
  }
  
  // 智能推断象限
  if (fields.priority === 'P0') {
    fields.quadrant = 1;  // 重要且紧急
  } else if (fields.priority === 'P1') {
    fields.quadrant = 2;  // 重要不紧急
  }
  
  return fields;
}

/**
 * 生成任务确认信息
 */
function generateTaskConfirmation(task) {
  const priorityMap = { P0: '🔴 P0 最高', P1: '🟠 P1 重要', P2: '🟡 P2 普通', P3: '🟢 P3 低' };
  const quadrantMap = { 1: '重要且紧急', 2: '重要不紧急', 3: '紧急不重要', 4: '不紧急不重要' };
  
  return `✅ **任务已创建并加入队列**
- 📝 **标题**: ${task.title}
- 🎯 **优先级**: ${priorityMap[task.priority] || task.priority}
- 📍 **象限**: ${quadrantMap[task.quadrant] || `第${task.quadrant}象限`}
- ⏰ **截止时间**: ${task.deadline || '未设置'}
- 📊 **状态**: ${task.status === 'analyzing' ? '分析中' : task.status === 'pending' ? '等待中' : task.status}
- 🔗 **前置任务**: ${task.preTaskId ? '有' : '无'}

💡 提示：任务将在当前任务完成后自动开始执行`;
}

/**
 * 生成字段补充提示
 */
function generateFieldSupplementPrompt(task) {
  const missing = [];
  if (!task.deadline) missing.push('截止时间');
  if (task.priority === 'medium') missing.push('优先级（当前为默认中等）');
  
  if (missing.length > 0) {
    return `\n🔧 **建议补充**: ${missing.join('、')}
💬 你可以回复："把截止时间改为明天下午 3 点，优先级调高"`;
  }
  return '';
}

// ==================== 导出模块 ====================
module.exports = {
  hasTaskIntent,
  extractTaskFields,
  summarizeTitle,
  extractDeadline,
  generateTaskConfirmation,
  generateFieldSupplementPrompt,
  TASK_KEYWORDS,
  PRIORITY_KEYWORDS,
  QUADRANT_KEYWORDS
};

// ==================== 测试代码 ====================
if (require.main === module) {
  console.log('=== 任务意图检测器 v2.2 测试 ===\n');
  
  const tests = [
    { msg: '调研 WSUS 核心功能，下周五前完成对比报告', expect: true },
    { msg: '紧急！修复支付漏洞', expect: true },
    { msg: '你好', expect: false }
  ];
  
  tests.forEach(({msg, expect}) => {
    const result = hasTaskIntent(msg);
    const fields = extractTaskFields(msg);
    console.log(`消息：${msg}`);
    console.log(`意图：${result ? '✅' : '❌'} | 标题：${fields.title} | 截止：${fields.deadline || '无'}`);
    console.log('---');
  });
}
