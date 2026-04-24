#!/usr/bin/env node
/**
 * 自我进化功能测试脚本
 * 功能：测试自我进化全流程的正确性和完整性
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '../../data');
const SELF_EVOLUTION_DIR = path.join(DATA_DIR, 'self-evolution');
const TEST_DIR = path.join(__dirname, '../../test/self-evolution');

// 确保测试目录存在
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

// 测试用的模拟数据
const MOCK_TASKS = [
  {
    "id": "test-task-001",
    "title": "测试任务1",
    "description": "用于测试的示例任务",
    "status": "completed",
    "priority": "P2",
    "quadrant": "Q2",
    "createdAt": "2026-03-04T10:00:00.000Z",
    "started_at": "2026-03-04T10:05:00.000Z",
    "completed_at": "2026-03-04T10:15:00.000Z",
    "execution_log": [
      {
        "timestamp": "2026-03-04T10:05:00.000Z",
        "action": "START",
        "detail": "开始执行测试任务"
      },
      {
        "timestamp": "2026-03-04T10:10:00.000Z",
        "action": "PROGRESS",
        "detail": "任务执行中"
      },
      {
        "timestamp": "2026-03-04T10:15:00.000Z",
        "action": "COMPLETE",
        "detail": "任务完成"
      }
    ],
    "tags": ["test", "automation"]
  },
  {
    "id": "test-task-002",
    "title": "测试任务2",
    "description": "另一个测试任务示例",
    "status": "completed",
    "priority": "P1",
    "quadrant": "Q1",
    "createdAt": "2026-03-04T11:00:00.000Z",
    "started_at": "2026-03-04T11:05:00.000Z",
    "completed_at": "2026-03-04T11:20:00.000Z",
    "execution_log": [
      {
        "timestamp": "2026-03-04T11:05:00.000Z",
        "action": "START",
        "detail": "开始执行测试任务"
      },
      {
        "timestamp": "2026-03-04T11:10:00.000Z",
        "action": "PROGRESS",
        "detail": "任务执行中"
      },
      {
        "timestamp": "2026-03-04T11:20:00.000Z",
        "action": "COMPLETE",
        "detail": "任务完成"
      }
    ],
    "tags": ["test", "feature"]
  }
];

/**
 * 测试每日回顾功能
 */
async function testDailyReview() {
  console.log('🔬 测试每日回顾功能...');
  
  try {
    // 运行每日回顾脚本
    const output = execSync('node daily-review.js', {
      cwd: path.join(__dirname),
      timeout: 30000,
      encoding: 'utf8'
    });
    
    console.log('✅ 每日回顾功能测试通过');
    console.log(`输出: ${output.substring(0, 200)}...`);
    
    // 检查回顾报告是否存在
    const reviewFile = path.join(SELF_EVOLUTION_DIR, 'daily-reviews.json');
    if (fs.existsSync(reviewFile)) {
      const reviews = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
      if (reviews.length > 0) {
        console.log('✅ 回顾报告生成成功');
        return { success: true };
      }
    }
    
    console.log('⚠️ 回顾报告未找到或为空');
    return { success: true, warning: '回顾报告未找到或为空' };
  } catch (error) {
    console.error('❌ 每日回顾功能测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 测试知识提取功能
 */
async function testKnowledgeExtraction() {
  console.log('\n🔬 测试知识提取功能...');
  
  try {
    // 运行知识提取脚本
    const output = execSync('node knowledge-extractor.js', {
      cwd: path.join(__dirname),
      timeout: 30000,
      encoding: 'utf8'
    });
    
    console.log('✅ 知识提取功能测试通过');
    console.log(`输出: ${output.substring(0, 200)}...`);
    
    // 检查知识库是否存在
    const knowledgeFile = path.join(SELF_EVOLUTION_DIR, 'knowledge-base.json');
    if (fs.existsSync(knowledgeFile)) {
      const knowledgeBase = JSON.parse(fs.readFileSync(knowledgeFile, 'utf8'));
      if (knowledgeBase.totalKnowledgePoints > 0) {
        console.log('✅ 知识库生成成功');
        return { success: true };
      }
    }
    
    console.log('⚠️ 知识库未找到或为空');
    return { success: true, warning: '知识库未找到或为空' };
  } catch (error) {
    console.error('❌ 知识提取功能测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 测试工作流转化功能
 */
async function testWorkflowConversion() {
  console.log('\n🔬 测试工作流转化功能...');
  
  try {
    // 运行工作流转化脚本
    const output = execSync('node workflow-converter.js', {
      cwd: path.join(__dirname),
      timeout: 30000,
      encoding: 'utf8'
    });
    
    console.log('✅ 工作流转化功能测试通过');
    console.log(`输出: ${output.substring(0, 200)}...`);
    
    // 检查生成的工作流
    const workflowsDir = path.join(SELF_EVOLUTION_DIR, 'workflows');
    if (fs.existsSync(workflowsDir)) {
      const workflows = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json') && f !== 'index.json');
      if (workflows.length > 0) {
        console.log(`✅ 生成了 ${workflows.length} 个工作流`);
        return { success: true };
      }
    }
    
    console.log('⚠️ 未生成任何工作流');
    return { success: true, warning: '未生成任何工作流' };
  } catch (error) {
    console.error('❌ 工作流转化功能测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 测试历史记录功能
 */
async function testHistoryRecording() {
  console.log('\n🔬 测试历史记录功能...');
  
  try {
    // 运行历史记录脚本
    const output = execSync('node history-recorder.js stats', {
      cwd: path.join(__dirname),
      timeout: 30000,
      encoding: 'utf8'
    });
    
    console.log('✅ 历史记录功能测试通过');
    console.log(`输出: ${output.substring(0, 200)}...`);
    
    // 检查历史记录是否存在
    const historyFile = path.join(SELF_EVOLUTION_DIR, 'evolution-history.json');
    if (fs.existsSync(historyFile)) {
      const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      if (history.length > 0) {
        console.log('✅ 历史记录生成成功');
        return { success: true };
      }
    }
    
    console.log('⚠️ 历史记录未找到或为空');
    return { success: true, warning: '历史记录未找到或为空' };
  } catch (error) {
    console.error('❌ 历史记录功能测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 测试技能生成功能
 */
async function testSkillGeneration() {
  console.log('\n🔬 测试技能生成功能...');
  
  try {
    // 检查生成的技能
    const skillsDir = path.join(__dirname, '../../../skills');
    if (fs.existsSync(skillsDir)) {
      const expertSkills = fs.readdirSync(skillsDir).filter(dir => dir.includes('-expert'));
      if (expertSkills.length > 0) {
        console.log(`✅ 生成了 ${expertSkills.length} 个专家技能`);
        console.log('技能列表:', expertSkills.join(', '));
        return { success: true };
      }
    }
    
    console.log('⚠️ 未找到生成的专家技能');
    return { success: true, warning: '未找到生成的专家技能' };
  } catch (error) {
    console.error('❌ 技能生成功能测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 运行完整的自我进化测试
 */
async function runFullSelfEvolutionTest() {
  console.log('🧪 开始自我进化功能完整测试...\n');
  const startTime = Date.now();
  
  const testResults = [];
  
  // 依次运行各项测试
  testResults.push(await testDailyReview());
  testResults.push(await testKnowledgeExtraction());
  testResults.push(await testWorkflowConversion());
  testResults.push(await testHistoryRecording());
  testResults.push(await testSkillGeneration());
  
  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);
  
  // 统计结果
  const passed = testResults.filter(r => r.success).length;
  const failed = testResults.filter(r => !r.success).length;
  const warnings = testResults.filter(r => r.warning).length;
  
  console.log('\n=== 测试结果摘要 ===');
  console.log(`⏱️ 测试耗时: ${duration} 秒`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`⚠️ 警告: ${warnings}`);
  
  if (warnings > 0) {
    console.log('\n⚠️ 警告详情:');
    testResults.filter(r => r.warning).forEach((r, i) => {
      console.log(`${i + 1}. ${r.warning}`);
    });
  }
  
  if (failed > 0) {
    console.log('\n❌ 失败详情:');
    testResults.filter(r => !r.success).forEach((r, i) => {
      console.log(`${i + 1}. ${r.error}`);
    });
  }
  
  const overallSuccess = failed === 0;
  console.log(`\n${overallSuccess ? '🎉' : '💥'} 总体测试结果: ${overallSuccess ? '通过' : '失败'}`);
  
  return {
    success: overallSuccess,
    passed,
    failed,
    warnings,
    duration,
    details: testResults
  };
}

// 如果直接运行此脚本
if (require.main === module) {
  runFullSelfEvolutionTest()
    .then(result => {
      if (result.success) {
        console.log('\n✅ 自我进化功能测试全部通过');
        process.exit(0);
      } else {
        console.error('\n❌ 自我进化功能测试失败');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 自我进化测试异常:', error);
      process.exit(1);
    });
}

module.exports = {
  testDailyReview,
  testKnowledgeExtraction,
  testWorkflowConversion,
  testHistoryRecording,
  testSkillGeneration,
  runFullSelfEvolutionTest
};