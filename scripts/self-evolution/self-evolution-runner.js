#!/usr/bin/env node
/**
 * 自我进化 - 主运行脚本
 * 功能：每日03点自动触发自我进化全流程
 */

const path = require('path');

// 导入各个模块
const { performDailyReview } = require('./daily-review');
const { performKnowledgeExtraction } = require('./knowledge-extractor');
const { performWorkflowConversion } = require('./workflow-converter');
const { recordEvolutionHistory } = require('./history-recorder');
const { syncEvolutionToSharedMemory } = require('./evolution-sync');

async function runSelfEvolution() {
  console.log('🌱 开始自我进化流程...');
  const startTime = new Date().toISOString();
  
  try {
    // 1. 每日回顾
    console.log('\n--- 第1步：每日回顾 ---');
    const reviewResult = await performDailyReview();
    if (!reviewResult.success) {
      throw new Error(`每日回顾失败: ${reviewResult.error}`);
    }
    console.log('✅ 每日回顾完成');
    
    // 2. 知识提取
    console.log('\n--- 第2步：知识提取 ---');
    const extractionResult = await performKnowledgeExtraction();
    if (!extractionResult.success) {
      throw new Error(`知识提取失败: ${extractionResult.error}`);
    }
    console.log('✅ 知识提取完成');
    
    // 3. 工作流和技能转化
    console.log('\n--- 第3步：工作流和技能转化 ---');
    const conversionResult = await performWorkflowConversion();
    if (!conversionResult.success) {
      throw new Error(`工作流转化失败: ${conversionResult.error}`);
    }
    console.log('✅ 工作流和技能转化完成');
    
    // 4. 记录进化历史
    console.log('\n--- 第4步：记录进化历史 ---');
    const historyResult = await recordEvolutionHistory({
      review: reviewResult.report,
      knowledge: extractionResult.knowledgeBase,
      conversion: conversionResult.report
    });
    if (!historyResult.success) {
      throw new Error(`历史记录失败: ${historyResult.error}`);
    }
    console.log('✅ 进化历史记录完成');
    
    // 5. 同步到共享记忆（让所有 Agent 都能获取）
    console.log('\n--- 第5步：同步到共享记忆 ---');
    const syncResult = await syncEvolutionToSharedMemory({
      review: reviewResult.report,
      knowledge: extractionResult.knowledgeBase,
      conversion: conversionResult.report,
      history: historyResult.record
    });
    if (!syncResult.success) {
      console.warn('⚠️ 同步到共享记忆失败:', syncResult.error);
      // 不抛出错误，同步失败不影响进化流程
    } else {
      console.log('✅ 同步到共享记忆完成');
    }
    
    const endTime = new Date().toISOString();
    console.log('\n🎉 自我进化流程完成');
    console.log(`⏰ 开始时间: ${startTime}`);
    console.log(`⏰ 结束时间: ${endTime}`);
    
    // 发送飞书通知
    await sendEvolutionNotification({
      success: true,
      knowledgePoints: extractionResult.knowledgeBase?.knowledgePoints?.length || 0,
      generatedSkills: conversionResult.report?.skillsGenerated || 0,
      patterns: extractionResult.knowledgeBase?.patterns?.length || 0,
      startTime,
      endTime
    });
    
    return {
      success: true,
      startTime,
      endTime,
      results: {
        review: reviewResult,
        extraction: extractionResult,
        conversion: conversionResult,
        history: historyResult
      }
    };
  } catch (error) {
    console.error('❌ 自我进化流程失败:', error.message);
    
    // 发送失败通知
    await sendEvolutionNotification({
      success: false,
      error: error.message,
      startTime,
      endTime: new Date().toISOString()
    });
    
    return {
      success: false,
      error: error.message,
      startTime,
      endTime: new Date().toISOString()
    };
  }
}

/**
 * 发送进化通知到飞书
 */
async function sendEvolutionNotification(result) {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // 检查配置
    const configFile = path.join(__dirname, '../../data/self-evolution/reflection-config.json');
    if (!fs.existsSync(configFile)) return;
    
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (!config.notifyOnEvolution) return;
    
    // 构建通知消息
    let message;
    if (result.success) {
      message = `🧬 **自我进化完成**

📊 **本次进化结果**
- 📚 知识点: ${result.knowledgePoints}
- 🎯 新增技能: ${result.generatedSkills}
- 🔍 识别模式: ${result.patterns}

⏰ 执行时间: ${new Date(result.startTime).toLocaleString('zh-CN')}
✅ Phase ${config.phase || 1} 已启用`;
    } else {
      message = `⚠️ **自我进化失败**

❌ 错误: ${result.error}
⏰ 时间: ${new Date(result.startTime).toLocaleString('zh-CN')}`;
    }
    
    // 发送到飞书
    const fetch = require('node-fetch');
    const response = await fetch((process.env.TASK_SYSTEM_URL || 'http://localhost:8081') + '/api/feishu/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    
    console.log('📢 飞书通知已发送');
  } catch (error) {
    console.error('发送通知失败:', error.message);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runSelfEvolution()
    .then(result => {
      if (result.success) {
        console.log('\n🌟 自我进化成功完成');
        process.exit(0);
      } else {
        console.error('\n💥 自我进化失败:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 自我进化异常:', error);
      process.exit(1);
    });
}

module.exports = {
  runSelfEvolution
};