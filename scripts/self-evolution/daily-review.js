#!/usr/bin/env node
/**
 * 自我进化 - 每日回顾功能
 * 功能：检查当日工作、识别改进点
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DATA_DIR = path.join(__dirname, '../../data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const SELF_EVOLUTION_DIR = path.join(DATA_DIR, 'self-evolution');
const REVIEW_LOG_FILE = path.join(SELF_EVOLUTION_DIR, 'daily-reviews.json');

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
 * 获取今日完成的任务
 */
function getTodayCompletedTasks() {
  const data = readJSON(TASKS_FILE, { tasks: [] });
  const tasks = Array.isArray(data) ? data : (data.tasks || []);
  const today = new Date().toISOString().split('T')[0];
  
  return tasks.filter(task => {
    if (task.status !== 'completed') return false;
    if (!task.completed_at) return false;
    
    const completionDate = new Date(task.completed_at).toISOString().split('T')[0];
    return completionDate === today;
  });
}

/**
 * 分析任务执行效率
 */
function analyzeTaskEfficiency(tasks) {
  const efficiencyData = [];
  
  tasks.forEach(task => {
    if (task.started_at && task.completed_at) {
      const start = new Date(task.started_at);
      const end = new Date(task.completed_at);
      const duration = (end - start) / 1000 / 60; // 分钟
      
      let estimated = 0;
      if (task.estimated_time) {
        // 解析预估时间，例如 "30 minutes"
        const match = task.estimated_time.match(/(\d+)\s*minutes/);
        if (match) {
          estimated = parseInt(match[1]);
        }
      } else if (task.breakdown) {
        // 计算所有步骤的预估时间总和
        estimated = task.breakdown.reduce((sum, step) => {
          if (step.estimated_time) {
            const match = step.estimated_time.match(/(\d+)\s*minutes/);
            if (match) {
              return sum + parseInt(match[1]);
            }
          }
          return sum;
        }, 0);
      }
      
      efficiencyData.push({
        taskId: task.id,
        taskTitle: task.title,
        actualMinutes: Math.round(duration),
        estimatedMinutes: estimated,
        efficiency: estimated > 0 ? Math.round((duration / estimated) * 100) : 0
      });
    }
  });
  
  return efficiencyData;
}

/**
 * 识别常见问题模式
 */
function identifyProblemPatterns(tasks) {
  const problems = [];
  
  tasks.forEach(task => {
    // 检查执行日志中的错误或警告
    if (task.execution_log) {
      const errors = task.execution_log.filter(log => 
        log.action === 'ERROR' || 
        log.action === 'FAILED' || 
        log.action === 'BLOCKED' ||
        (log.detail && (log.detail.includes('错误') || log.detail.includes('失败')))
      );
      
      if (errors.length > 0) {
        problems.push({
          taskId: task.id,
          taskTitle: task.title,
          errorCount: errors.length,
          lastError: errors[errors.length - 1].detail
        });
      }
    }
    
    // 检查是否有重新执行的记录
    if (task.execution_log && task.execution_log.some(log => log.action === 'REEXECUTE')) {
      problems.push({
        taskId: task.id,
        taskTitle: task.title,
        issue: '任务被重新执行',
        detail: '可能存在执行不稳定或虚假完成问题'
      });
    }
  });
  
  return problems;
}

/**
 * 生成改进建议
 */
function generateImprovementSuggestions(efficiencyData, problemPatterns) {
  const suggestions = [];
  
  // 效率分析建议
  const inefficientTasks = efficiencyData.filter(item => item.efficiency > 150); // 超过预估时间1.5倍
  if (inefficientTasks.length > 0) {
    suggestions.push({
      type: 'efficiency',
      priority: 'high',
      description: '发现效率较低的任务',
      details: inefficientTasks.map(t => `${t.taskTitle} (实际${t.actualMinutes}分钟，预估${t.estimatedMinutes}分钟)`),
      suggestion: '分析任务执行过程，优化步骤分解或调整预估时间'
    });
  }
  
  // 问题模式建议
  if (problemPatterns.length > 0) {
    suggestions.push({
      type: 'stability',
      priority: 'high',
      description: '发现任务执行稳定性问题',
      details: problemPatterns.map(p => `${p.taskTitle}: ${p.lastError || p.issue}`),
      suggestion: '检查相关模块的错误处理机制，增强容错能力'
    });
  }
  
  // 一般性建议
  suggestions.push({
    type: 'process',
    priority: 'medium',
    description: '流程优化建议',
    details: ['定期回顾任务执行情况', '持续优化任务分解和预估'],
    suggestion: '建立定期的人工审核机制，确保自动化流程的准确性'
  });
  
  return suggestions;
}

/**
 * 执行每日回顾
 */
async function performDailyReview() {
  console.log('🔍 开始每日回顾...');
  
  try {
    // 获取今日完成的任务
    const completedTasks = getTodayCompletedTasks();
    console.log(`✅ 今日完成任务数: ${completedTasks.length}`);
    
    // 分析任务执行效率
    const efficiencyData = analyzeTaskEfficiency(completedTasks);
    console.log(`📈 效率分析完成，分析了 ${efficiencyData.length} 个任务`);
    
    // 识别问题模式
    const problemPatterns = identifyProblemPatterns(completedTasks);
    console.log(`⚠️ 发现 ${problemPatterns.length} 个问题模式`);
    
    // 生成改进建议
    const suggestions = generateImprovementSuggestions(efficiencyData, problemPatterns);
    console.log(`💡 生成 ${suggestions.length} 条改进建议`);
    
    // 生成回顾报告
    const reviewReport = {
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      completedTasks: completedTasks.length,
      efficiencyAnalysis: efficiencyData,
      problemPatterns,
      improvementSuggestions: suggestions
    };
    
    // 保存回顾报告
    const reviews = readJSON(REVIEW_LOG_FILE, []);
    reviews.unshift(reviewReport);
    
    // 只保留最近30天的回顾记录
    if (reviews.length > 30) {
      reviews.splice(30);
    }
    
    writeJSON(REVIEW_LOG_FILE, reviews);
    console.log('💾 回顾报告已保存');
    
    // 输出摘要
    console.log('\n=== 每日回顾摘要 ===');
    console.log(`日期: ${reviewReport.date}`);
    console.log(`完成任务: ${reviewReport.completedTasks}`);
    console.log(`发现问题: ${reviewReport.problemPatterns.length}`);
    console.log(`改进建议: ${reviewReport.improvementSuggestions.length}`);
    
    if (suggestions.length > 0) {
      console.log('\n改进建议:');
      suggestions.forEach((s, index) => {
        console.log(`${index + 1}. [${s.priority}] ${s.description}`);
      });
    }
    
    return {
      success: true,
      report: reviewReport
    };
  } catch (error) {
    console.error('❌ 每日回顾失败:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  performDailyReview()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 每日回顾完成');
        process.exit(0);
      } else {
        console.error('\n💥 每日回顾失败:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 每日回顾异常:', error);
      process.exit(1);
    });
}

module.exports = {
  getTodayCompletedTasks,
  analyzeTaskEfficiency,
  identifyProblemPatterns,
  generateImprovementSuggestions,
  performDailyReview
};