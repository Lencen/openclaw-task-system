#!/usr/bin/env node
/**
 * 自我进化 - 进化成果同步模块
 * 功能：将进化成果同步到共享记忆，让所有 Agent 都能获取
 * 创建时间: 2026-03-16
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(require('os').homedir(), '.openclaw/workspace');
const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');
const EVOLUTION_LOG_FILE = path.join(MEMORY_DIR, 'EVOLUTION-LOG.md');
const KNOWLEDGE_BASE_FILE = path.join(__dirname, '../../data/self-evolution/knowledge-base.json');
const HISTORY_FILE = path.join(__dirname, '../../data/self-evolution/evolution-history.json');

// 确保目录存在
if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

/**
 * 同步进化成果到共享记忆
 * @param {Object} evolutionData - 进化数据
 * @returns {Object} 同步结果
 */
async function syncEvolutionToSharedMemory(evolutionData) {
  console.log('🔄 开始同步进化成果到共享记忆...');
  
  try {
    // 读取知识库
    const knowledgeBase = readJSON(KNOWLEDGE_BASE_FILE, { knowledgePoints: [], patterns: [] });
    const history = readJSON(HISTORY_FILE, []);
    
    // 获取最新的进化记录
    const latestEvolution = history[0];
    
    // 生成进化摘要
    const evolutionSummary = generateEvolutionSummary(evolutionData, knowledgeBase, latestEvolution);
    
    // 生成知识要点
    const knowledgeHighlights = generateKnowledgeHighlights(knowledgeBase);
    
    // 生成完整的进化日志
    const logContent = generateEvolutionLogContent(evolutionSummary, knowledgeHighlights, history);
    
    // 写入进化日志文件
    fs.writeFileSync(EVOLUTION_LOG_FILE, logContent);
    console.log('💾 进化日志已保存到:', EVOLUTION_LOG_FILE);
    
    // 输出摘要
    console.log('\n=== 同步摘要 ===');
    console.log(`日期: ${evolutionSummary.date}`);
    console.log(`知识点总数: ${evolutionSummary.totalKnowledgePoints}`);
    console.log(`识别模式: ${evolutionSummary.patternsIdentified}`);
    console.log(`生成技能: ${evolutionSummary.skillsGenerated}`);
    
    return {
      success: true,
      logFile: EVOLUTION_LOG_FILE,
      summary: evolutionSummary
    };
  } catch (error) {
    console.error('❌ 同步进化成果失败:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 生成进化摘要
 */
function generateEvolutionSummary(evolutionData, knowledgeBase, latestEvolution) {
  return {
    date: latestEvolution?.date || new Date().toISOString().split('T')[0],
    timestamp: new Date().toISOString(),
    totalKnowledgePoints: knowledgeBase.totalKnowledgePoints || knowledgeBase.knowledgePoints?.length || 0,
    patternsIdentified: knowledgeBase.totalPatterns || knowledgeBase.patterns?.length || 0,
    tasksReviewed: latestEvolution?.summary?.tasksReviewed || 0,
    workflowsGenerated: latestEvolution?.summary?.workflowsGenerated || 0,
    skillsGenerated: latestEvolution?.summary?.skillsGenerated || 0,
    topPatterns: knowledgeBase.patterns?.slice(0, 5) || [],
    recentKnowledgePoints: knowledgeBase.knowledgePoints?.slice(-10) || []
  };
}

/**
 * 生成知识要点
 */
function generateKnowledgeHighlights(knowledgeBase) {
  const highlights = [];
  
  // 按类型分组
  const byType = {};
  if (knowledgeBase.knowledgePoints) {
    knowledgeBase.knowledgePoints.forEach(kp => {
      const type = kp.type || 'general';
      if (!byType[type]) byType[type] = [];
      byType[type].push(kp);
    });
  }
  
  // 提取每个类型的前5个
  Object.entries(byType).forEach(([type, points]) => {
    highlights.push({
      type,
      count: points.length,
      topPoints: points.slice(-5).map(p => {
        // 尝试多种可能的标题字段
        const title = p.taskTitle || p.title || p.name || p.keywords?.[0] || '未命名';
        const description = p.description || p.solution || p.keywords?.slice(0, 3).join(', ') || '';
        return {
          title: title.slice(0, 60),
          description: description.slice(0, 100)
        };
      })
    });
  });
  
  return highlights.sort((a, b) => b.count - a.count);
}

/**
 * 生成进化日志内容
 */
function generateEvolutionLogContent(summary, highlights, history) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0, 8);
  
  let content = `# 🧬 进化日志 - 共享记忆

> **最后更新**: ${dateStr} ${timeStr}
> **所有 Agent 启动时都会读取此文件**

---

## 📊 最新进化摘要

| 指标 | 数值 |
|------|------|
| 进化日期 | ${summary.date} |
| 知识点总数 | ${summary.totalKnowledgePoints} |
| 识别模式 | ${summary.patternsIdentified} |
| 任务回顾 | ${summary.tasksReviewed} |
| 生成工作流 | ${summary.workflowsGenerated} |
| 生成技能 | ${summary.skillsGenerated} |

---

## 💡 核心知识点（按类型）

`;

  // 添加知识点分类
  if (highlights.length > 0) {
    highlights.forEach(category => {
      content += `### ${category.type} (${category.count} 个)\n\n`;
      category.topPoints.forEach((point, i) => {
        content += `${i + 1}. **${point.title}**\n`;
        if (point.description) {
          content += `   ${point.description}\n`;
        }
      });
      content += '\n';
    });
  } else {
    content += '*暂无知识点*\n\n';
  }

  // 添加识别的模式
  if (summary.topPatterns && summary.topPatterns.length > 0) {
    content += `---\n\n## 🔍 识别的模式\n\n`;
    summary.topPatterns.forEach((pattern, i) => {
      content += `${i + 1}. **${pattern.name || pattern.type || '模式'}**\n`;
      if (pattern.description) {
        content += `   ${pattern.description}\n`;
      }
      content += '\n';
    });
  }

  // 添加最近进化历史（最近5次）
  if (history && history.length > 0) {
    content += `---\n\n## 📜 进化历史（最近5次）\n\n`;
    content += `| 日期 | 知识点 | 模式 | 技能 |\n`;
    content += `|------|--------|------|------|\n`;
    history.slice(0, 5).forEach(record => {
      const date = record.date || '?';
      const kp = record.summary?.knowledgePoints || 0;
      const patterns = record.summary?.patternsIdentified || 0;
      const skills = record.summary?.skillsGenerated || 0;
      content += `| ${date} | ${kp} | ${patterns} | ${skills} |\n`;
    });
  }

  // 添加使用说明
  content += `
---

## 📖 使用说明

### Agent 启动时

所有 Agent 在启动时会自动读取此文件，获取最新的进化成果。

### 手动查看

\`\`\`bash
cat ~/.openclaw/workspace/memory/EVOLUTION-LOG.md
\`\`\`

### 触发进化

\`\`\`bash
# 手动触发一次进化
cd ~/.openclaw/workspace/task-system-v2
node scripts/self-evolution/self-evolution-runner.js

# 查看进化历史
node scripts/self-evolution/history-recorder.js stats
\`\`\`

---

*此文件由自我进化系统自动维护，每次进化完成后更新。*
`;
  
  return content;
}

/**
 * 读取 JSON 文件
 */
function readJSON(file, defaultVal) {
  if (!fs.existsSync(file)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return defaultVal;
  }
}

/**
 * 获取进化统计（供外部调用）
 */
function getEvolutionStats() {
  const knowledgeBase = readJSON(KNOWLEDGE_BASE_FILE, { knowledgePoints: [] });
  const history = readJSON(HISTORY_FILE, []);
  
  return {
    totalEvolutions: history.length,
    totalKnowledgePoints: knowledgeBase.totalKnowledgePoints || knowledgeBase.knowledgePoints?.length || 0,
    totalPatterns: knowledgeBase.totalPatterns || knowledgeBase.patterns?.length || 0,
    lastEvolution: history[0]?.date || null
  };
}

// 如果直接运行此脚本
if (require.main === module) {
  syncEvolutionToSharedMemory({})
    .then(result => {
      if (result.success) {
        console.log('\n✅ 进化成果同步成功');
        process.exit(0);
      } else {
        console.error('\n❌ 同步失败:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n❌ 同步异常:', error);
      process.exit(1);
    });
}

module.exports = {
  syncEvolutionToSharedMemory,
  getEvolutionStats
};