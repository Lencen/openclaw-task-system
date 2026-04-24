#!/usr/bin/env node
/**
 * 自我进化 - 历史记录功能
 * 功能：记录进化历史和知识点库
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const SELF_EVOLUTION_DIR = path.join(DATA_DIR, 'self-evolution');
const HISTORY_FILE = path.join(SELF_EVOLUTION_DIR, 'evolution-history.json');

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

/**
 * 记录进化历史
 */
async function recordEvolutionHistory(evolutionData) {
  console.log('📜 开始记录进化历史...');
  
  try {
    // 创建进化记录
    const evolutionRecord = {
      id: `evolution_${Date.now()}`,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      summary: {
        tasksReviewed: evolutionData.review ? evolutionData.review.completedTasks : 0,
        knowledgePoints: evolutionData.knowledge ? evolutionData.knowledge.totalKnowledgePoints : 0,
        patternsIdentified: evolutionData.knowledge ? evolutionData.knowledge.totalPatterns : 0,
        workflowsGenerated: evolutionData.conversion ? evolutionData.conversion.workflowsGenerated : 0,
        skillsGenerated: evolutionData.conversion ? evolutionData.conversion.skillsGenerated : 0
      },
      details: {
        review: evolutionData.review,
        knowledge: {
          totalPoints: evolutionData.knowledge?.totalKnowledgePoints,
          totalPatterns: evolutionData.knowledge?.totalPatterns
        },
        conversion: {
          workflows: evolutionData.conversion?.workflowsGenerated,
          skills: evolutionData.conversion?.skillsGenerated
        }
      }
    };
    
    // 读取现有历史记录
    const history = readJSON(HISTORY_FILE, []);
    
    // 添加新记录
    history.unshift(evolutionRecord);
    
    // 只保留最近100条记录
    if (history.length > 100) {
      history.splice(100);
    }
    
    // 保存历史记录
    writeJSON(HISTORY_FILE, history);
    console.log('💾 进化历史已保存');
    
    // 输出摘要
    console.log('\n=== 进化历史摘要 ===');
    console.log(`ID: ${evolutionRecord.id}`);
    console.log(`日期: ${evolutionRecord.date}`);
    console.log(`任务回顾: ${evolutionRecord.summary.tasksReviewed}`);
    console.log(`知识点: ${evolutionRecord.summary.knowledgePoints}`);
    console.log(`识别模式: ${evolutionRecord.summary.patternsIdentified}`);
    console.log(`生成工作流: ${evolutionRecord.summary.workflowsGenerated}`);
    console.log(`生成技能: ${evolutionRecord.summary.skillsGenerated}`);
    
    return {
      success: true,
      record: evolutionRecord
    };
  } catch (error) {
    console.error('❌ 历史记录失败:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 获取进化历史统计
 */
function getEvolutionStatistics() {
  try {
    const history = readJSON(HISTORY_FILE, []);
    
    if (history.length === 0) {
      return {
        totalEvolutions: 0,
        statistics: {}
      };
    }
    
    // 计算统计信息
    const stats = {
      totalEvolutions: history.length,
      firstEvolution: history[history.length - 1].date,
      lastEvolution: history[0].date,
      totalTasksReviewed: history.reduce((sum, record) => sum + (record.summary.tasksReviewed || 0), 0),
      totalKnowledgePoints: history.reduce((sum, record) => sum + (record.summary.knowledgePoints || 0), 0),
      totalPatterns: history.reduce((sum, record) => sum + (record.summary.patternsIdentified || 0), 0),
      totalWorkflows: history.reduce((sum, record) => sum + (record.summary.workflowsGenerated || 0), 0),
      totalSkills: history.reduce((sum, record) => sum + (record.summary.skillsGenerated || 0), 0)
    };
    
    return {
      success: true,
      statistics: stats
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 导出知识点库
 */
function exportKnowledgeBase() {
  try {
    const knowledgeBaseFile = path.join(SELF_EVOLUTION_DIR, 'knowledge-base.json');
    const knowledgeBase = readJSON(knowledgeBaseFile, null);
    
    if (!knowledgeBase) {
      return {
        success: false,
        error: '知识库不存在'
      };
    }
    
    // 创建导出格式
    const exportData = {
      exportTimestamp: new Date().toISOString(),
      knowledgeBaseVersion: '1.0',
      data: knowledgeBase
    };
    
    // 保存导出文件
    const exportFile = path.join(SELF_EVOLUTION_DIR, `knowledge-base-export-${Date.now()}.json`);
    writeJSON(exportFile, exportData);
    
    return {
      success: true,
      exportFile,
      knowledgePoints: knowledgeBase.totalKnowledgePoints
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  // 如果有参数，执行相应功能
  const action = process.argv[2];
  
  switch (action) {
    case 'stats':
      const statsResult = getEvolutionStatistics();
      if (statsResult.success) {
        console.log('📊 进化统计:');
        console.log(JSON.stringify(statsResult.statistics, null, 2));
      } else {
        console.error('❌ 统计失败:', statsResult.error);
        process.exit(1);
      }
      break;
      
    case 'export':
      const exportResult = exportKnowledgeBase();
      if (exportResult.success) {
        console.log(`📤 知识库已导出到: ${exportResult.exportFile}`);
        console.log(`📚 知识点数量: ${exportResult.knowledgePoints}`);
      } else {
        console.error('❌ 导出失败:', exportResult.error);
        process.exit(1);
      }
      break;
      
    default:
      console.log('用法: node history-recorder.js [stats|export]');
  }
  
  process.exit(0);
}

module.exports = {
  recordEvolutionHistory,
  getEvolutionStatistics,
  exportKnowledgeBase
};