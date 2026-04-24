#!/usr/bin/env node
/**
 * 自我进化 - 知识整理和方案提取功能 (增强版)
 * 功能：从任务执行过程、记忆文件、技能文件中提取有价值的知识点和解决方案
 * 更新时间: 2026-03-11
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const SELF_EVOLUTION_DIR = path.join(DATA_DIR, 'self-evolution');
const KNOWLEDGE_BASE_FILE = path.join(SELF_EVOLUTION_DIR, 'knowledge-base.json');

// 记忆文件路径
const WORKSPACE_DIR = path.join(require('os').homedir(), '.openclaw/workspace');
const MEMORY_FILE = path.join(WORKSPACE_DIR, 'MEMORY.md');
const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');
const SKILLS_DIR = path.join(WORKSPACE_DIR, 'skills');
const DOCS_DIR = path.join(WORKSPACE_DIR, 'docs');

// 确保目录存在
if (!fs.existsSync(SELF_EVOLUTION_DIR)) {
  fs.mkdirSync(SELF_EVOLUTION_DIR, { recursive: true });
}

// 读取JSON文件的辅助函数
const readJSON = (file, defaultVal) => {
  if (!fs.existsSync(file)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return defaultVal;
  }
};

// 写入JSON文件的辅助函数
const writeJSON = (file, data) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// 读取文本文件的辅助函数
const readTextFile = (file) => {
  if (!fs.existsSync(file)) return '';
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

/**
 * 从记忆文件中提取知识点
 */
function extractKnowledgeFromMemory() {
  const knowledgePoints = [];
  
  // 1. 从主 MEMORY.md 提取规则
  if (fs.existsSync(MEMORY_FILE)) {
    const content = readTextFile(MEMORY_FILE);
    const rules = extractRulesFromMarkdown(content, 'MEMORY.md');
    knowledgePoints.push(...rules);
  }
  
  // 2. 从每日记忆文件提取经验
  if (fs.existsSync(MEMORY_DIR)) {
    const files = fs.readdirSync(MEMORY_DIR)
      .filter(f => f.endsWith('.md') && !f.includes('evolution'))
      .sort()
      .reverse();
    // 移除7天限制，永久保存所有记忆
    
    files.forEach(file => {
      const content = readTextFile(path.join(MEMORY_DIR, file));
      const experiences = extractExperiencesFromMarkdown(content, file);
      knowledgePoints.push(...experiences);
    });
  }
  
  // 3. 从进化报告提取教训
  const evolutionFiles = fs.readdirSync(MEMORY_DIR)
    .filter(f => f.includes('evolution'))
    .sort()
    .reverse()
    .slice(0, 3);
  
  evolutionFiles.forEach(file => {
    const content = readTextFile(path.join(MEMORY_DIR, file));
    const lessons = extractLessonsFromEvolution(content, file);
    knowledgePoints.push(...lessons);
  });
  
  // 4. 从技能文件提取最佳实践
  if (fs.existsSync(SKILLS_DIR)) {
    const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    
    skillDirs.forEach(skillDir => {
      const skillFile = path.join(SKILLS_DIR, skillDir, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const content = readTextFile(skillFile);
        const practices = extractPracticesFromSkill(content, skillDir);
        knowledgePoints.push(...practices);
      }
    });
  }
  
  return knowledgePoints;
}

/**
 * 从 Markdown 中提取规则
 */
function extractRulesFromMarkdown(content, source) {
  const rules = [];
  
  // 匹配规则标题和内容
  const ruleRegex = /###\s*(规则|Rule)[\s\S]*?(?=###|$)/gi;
  let match;
  
  while ((match = ruleRegex.exec(content)) !== null) {
    const ruleText = match[0];
    
    // 提取规则级别
    const levelMatch = ruleText.match(/\*\*规则等级\*\*[：:]\s*\*\*([^*]+)\*\*/);
    const level = levelMatch ? levelMatch[1] : 'MEDIUM';
    
    // 提取规则名称
    const nameMatch = ruleText.match(/###\s*(?:规则|Rule)[\s:：]*([^\n]+)/i);
    const name = nameMatch ? nameMatch[1].trim() : '未命名规则';
    
    // 提取关键词
    const keywords = extractKeywords(ruleText);
    
    rules.push({
      type: 'rule',
      name: name,
      level: level,
      source: source,
      keywords: keywords,
      content: ruleText.substring(0, 500), // 截取前 500 字符
      createdAt: new Date().toISOString()
    });
  }
  
  return rules;
}

/**
 * 从 Markdown 中提取经验
 */
function extractExperiencesFromMarkdown(content, source) {
  const experiences = [];
  
  // 匹配经验教训标题和内容
  const expRegex = /(?:##\s*(经验|教训|问题|解决|心得))[\s\S]*?(?=##|$)/gi;
  let match;
  
  while ((match = expRegex.exec(content)) !== null) {
    const expText = match[0];
    const keywords = extractKeywords(expText);
    
    if (keywords.length > 0) {
      experiences.push({
        type: 'experience',
        source: source,
        keywords: keywords,
        content: expText.substring(0, 500),
        createdAt: new Date().toISOString()
      });
    }
  }
  
  return experiences;
}

/**
 * 从进化报告中提取教训
 */
function extractLessonsFromEvolution(content, source) {
  const lessons = [];
  
  // 匹配教训标题和内容
  const lessonRegex = /(?:###\s*教训[\s\S]*?)(?=###|$)/gi;
  let match;
  
  while ((match = lessonRegex.exec(content)) !== null) {
    const lessonText = match[0];
    
    // 提取教训来源
    const sourceMatch = lessonText.match(/\*\*来源\*\*[：:]\s*([^\n]+)/);
    const lessonSource = sourceMatch ? sourceMatch[1] : source;
    
    // 提取关键词
    const keywords = extractKeywords(lessonText);
    
    lessons.push({
      type: 'lesson',
      source: lessonSource,
      keywords: keywords,
      content: lessonText.substring(0, 500),
      createdAt: new Date().toISOString()
    });
  }
  
  return lessons;
}

/**
 * 从技能文件提取最佳实践
 */
function extractPracticesFromSkill(content, skillName) {
  const practices = [];
  
  // 匹配最佳实践、规则、核心规则等
  const practiceRegex = /(?:##\s*(?:核心规则|规则|最佳实践|Best Practice))[\s\S]*?(?=##|$)/gi;
  let match;
  
  while ((match = practiceRegex.exec(content)) !== null) {
    const practiceText = match[0];
    const keywords = extractKeywords(practiceText);
    
    practices.push({
      type: 'practice',
      skill: skillName,
      keywords: keywords,
      content: practiceText.substring(0, 500),
      createdAt: new Date().toISOString()
    });
  }
  
  return practices;
}

/**
 * 提取关键词
 */
function extractKeywords(text) {
  if (!text) return [];
  
  const commonWords = ['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '可以', '需要', '进行', '使用'];
  
  const words = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
                  .split(/\s+/)
                  .filter(word => word.length > 1 && !commonWords.includes(word));
  
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  return Object.keys(wordCount)
    .sort((a, b) => wordCount[b] - wordCount[a])
    .slice(0, 10);
}

/**
 * 从任务中提取知识点
 */
function extractKnowledgeFromTasks(tasks) {
  const knowledgePoints = [];
  
  tasks.forEach(task => {
    const keywords = extractKeywords(task.title + ' ' + (task.description || ''));
    const solutions = extractSolutions(task.execution_log || []);
    const domains = task.tags || [];
    
    const importance = {
      priority: task.priority || 'medium',
      quadrant: task.quadrant || 'Q2'
    };
    
    knowledgePoints.push({
      type: 'task',
      taskId: task.id,
      taskTitle: task.title,
      keywords,
      solutions,
      domains,
      importance,
      createdAt: task.createdAt || new Date().toISOString()
    });
  });
  
  return knowledgePoints;
}

/**
 * 从执行日志中提取解决方案
 */
function extractSolutions(executionLogs) {
  const solutions = [];
  
  executionLogs.forEach(log => {
    if (log.detail && (
      log.detail.includes('解决') || 
      log.detail.includes('修复') || 
      log.detail.includes('完成') ||
      log.detail.includes('实现') ||
      log.detail.includes('优化')
    )) {
      solutions.push({
        action: log.action,
        detail: log.detail,
        timestamp: log.timestamp
      });
    }
  });
  
  return solutions;
}

/**
 * 识别成功模式
 */
function identifySuccessPatterns(tasks) {
  const patterns = [];
  
  const efficientTasks = tasks.filter(task => {
    if (task.status !== 'completed' || !task.started_at || !task.completed_at) return false;
    const duration = new Date(task.completed_at) - new Date(task.started_at);
    return duration < 30 * 60 * 1000;
  });
  
  if (efficientTasks.length > 0) {
    patterns.push({
      type: 'efficiency',
      description: '快速完成任务的模式',
      count: efficientTasks.length,
      examples: efficientTasks.slice(0, 3).map(t => t.title)
    });
  }
  
  const highQualityTasks = tasks.filter(task => {
    if (!task.execution_log) return true;
    return !task.execution_log.some(log => log.action === 'REEXECUTE');
  });
  
  if (highQualityTasks.length > 0) {
    patterns.push({
      type: 'quality',
      description: '高质量执行的模式',
      count: highQualityTasks.length,
      examples: highQualityTasks.slice(0, 3).map(t => t.title)
    });
  }
  
  return patterns;
}

/**
 * 构建知识图谱
 */
function buildKnowledgeGraph(knowledgePoints, patterns) {
  const graph = {
    entities: [],
    relationships: [],
    patterns: patterns
  };
  
  knowledgePoints.forEach((point, index) => {
    graph.entities.push({
      id: `knowledge_${index}`,
      type: point.type,
      name: point.name || point.taskTitle || point.source,
      keywords: point.keywords,
      level: point.level,
      source: point.source
    });
  });
  
  // 构建基于关键词的关系
  for (let i = 0; i < knowledgePoints.length; i++) {
    for (let j = i + 1; j < knowledgePoints.length; j++) {
      const commonKeywords = knowledgePoints[i].keywords.filter(
        k => knowledgePoints[j].keywords.includes(k)
      );
      if (commonKeywords.length >= 2) {
        graph.relationships.push({
          from: `knowledge_${i}`,
          to: `knowledge_${j}`,
          type: 'related',
          commonKeywords: commonKeywords
        });
      }
    }
  }
  
  return graph;
}

/**
 * 执行知识提取
 */
async function performKnowledgeExtraction() {
  console.log('📚 开始知识提取 (增强版)...');
  
  try {
    // 1. 从任务中提取
    const data = readJSON(TASKS_FILE, { tasks: [] });
    const tasks = Array.isArray(data) ? data : (data.tasks || []);
    console.log(`📖 处理任务数: ${tasks.length}`);
    const taskKnowledge = extractKnowledgeFromTasks(tasks);
    console.log(`  - 从任务提取: ${taskKnowledge.length} 个知识点`);
    
    // 2. 从记忆文件中提取
    console.log('📄 处理记忆文件...');
    const memoryKnowledge = extractKnowledgeFromMemory();
    console.log(`  - 从记忆提取: ${memoryKnowledge.length} 个知识点`);
    
    // 合并所有知识点
    const allKnowledgePoints = [...taskKnowledge, ...memoryKnowledge];
    console.log(`🔍 总知识点: ${allKnowledgePoints.length}`);
    
    // 3. 识别成功模式
    const patterns = identifySuccessPatterns(tasks);
    console.log(`🎯 识别模式: ${patterns.length}`);
    
    // 4. 构建知识图谱
    const knowledgeGraph = buildKnowledgeGraph(allKnowledgePoints, patterns);
    console.log(`🔗 构建知识图谱: ${knowledgeGraph.entities.length} 个实体, ${knowledgeGraph.relationships.length} 个关系`);
    
    // 5. 保存到知识库
    const knowledgeBase = {
      timestamp: new Date().toISOString(),
      version: '2.0',
      sources: {
        tasks: tasks.length,
        memoryFiles: memoryKnowledge.filter(k => k.type !== 'task').length
      },
      totalKnowledgePoints: allKnowledgePoints.length,
      totalPatterns: patterns.length,
      knowledgePoints: allKnowledgePoints,
      patterns: patterns,
      knowledgeGraph: knowledgeGraph
    };
    
    writeJSON(KNOWLEDGE_BASE_FILE, knowledgeBase);
    console.log('💾 知识库已保存');
    
    // 6. 输出摘要
    console.log('\n=== 知识提取摘要 ===');
    console.log(`知识点总数: ${allKnowledgePoints.length}`);
    
    const byType = {};
    allKnowledgePoints.forEach(kp => {
      byType[kp.type] = (byType[kp.type] || 0) + 1;
    });
    console.log('按类型分类:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
    
    console.log(`\n成功模式: ${patterns.length}`);
    console.log(`知识图谱实体: ${knowledgeGraph.entities.length}`);
    console.log(`知识图谱关系: ${knowledgeGraph.relationships.length}`);
    
    return {
      success: true,
      knowledgeBase
    };
  } catch (error) {
    console.error('❌ 知识提取失败:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  performKnowledgeExtraction()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 知识提取完成');
        process.exit(0);
      } else {
        console.error('\n💥 知识提取失败:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 知识提取异常:', error);
      process.exit(1);
    });
}

module.exports = {
  performKnowledgeExtraction,
  extractKnowledgeFromMemory,
  extractRulesFromMarkdown,
  extractKeywords
};