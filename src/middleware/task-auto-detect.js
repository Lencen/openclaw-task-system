/**
 * 任务自动识别中间件
 * 功能：在消息处理流程中自动识别任务并创建
 * 创建时间: 2026-03-16
 * 
 * 使用方式：
 * 1. 在 Agent 处理消息时调用 detectAndCreateTask(message)
 * 2. 或者作为中间件集成到消息处理流程
 */

const TASK_SYSTEM_URL = process.env.TASK_SYSTEM_URL || 'http://localhost:8081';

/**
 * 检测消息是否包含任务意图并自动创建任务
 * @param {string} message - 消息内容
 * @param {object} options - 选项
 * @param {string} options.sourceChannel - 来源渠道（feishu, telegram等）
 * @param {string} options.userId - 用户ID
 * @param {boolean} options.silent - 是否静默模式（不返回提示）
 * @returns {Promise<object>} 检测结果
 */
async function detectAndCreateTask(message, options = {}) {
  const { sourceChannel = 'unknown', userId = null, silent = false } = options;
  
  try {
    // 调用任务识别 API
    const response = await fetch(`${TASK_SYSTEM_URL}/api/tasks/from-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        sourceChannel,
        userId
      })
    });
    
    const result = await response.json();
    
    if (!result.success) {
      // 不是任务或创建失败
      return {
        isTask: false,
        task: null,
        message: result.message || '未检测到任务意图'
      };
    }
    
    // 任务创建成功
    console.log(`[TASK-AUTO] 任务已自动创建: ${result.task.title} (ID: ${result.id})`);
    
    return {
      isTask: true,
      task: result.task,
      taskId: result.id,
      message: `✅ 已自动创建任务: ${result.task.title}`
    };
    
  } catch (error) {
    console.error('[TASK-AUTO] 任务识别失败:', error.message);
    return {
      isTask: false,
      task: null,
      error: error.message
    };
  }
}

/**
 * 批量检测消息中的任务
 * @param {string[]} messages - 消息数组
 * @param {object} options - 选项
 * @returns {Promise<object[]>} 检测结果数组
 */
async function batchDetectTasks(messages, options = {}) {
  const results = [];
  
  for (const message of messages) {
    const result = await detectAndCreateTask(message, options);
    results.push(result);
    
    // 避免请求过快
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}

/**
 * 获取当前任务队列状态
 * @returns {Promise<object>} 队列状态
 */
async function getTaskQueueStatus() {
  try {
    const response = await fetch(`${TASK_SYSTEM_URL}/api/tasks/queue/status`);
    return await response.json();
  } catch (error) {
    console.error('[TASK-AUTO] 获取队列状态失败:', error.message);
    return { error: error.message };
  }
}

/**
 * 检查任务系统健康状态
 * @returns {Promise<boolean>} 是否健康
 */
async function checkTaskSystemHealth() {
  try {
    const response = await fetch(`${TASK_SYSTEM_URL}/api/health`, {
      timeout: 5000
    });
    return response.ok;
  } catch {
    return false;
  }
}

// 如果直接运行此脚本，执行测试
if (require.main === module) {
  console.log('=== 任务自动识别中间件测试 ===\n');
  
  const testMessages = [
    '调研 WSUS 核心功能，下周五前完成对比报告',
    '紧急！修复支付漏洞',
    '你好，今天天气不错',
    '计划下周完成企业级更新管理系统的学习',
    '记得提醒我明天开会'
  ];
  
  (async () => {
    for (const msg of testMessages) {
      console.log(`消息: ${msg}`);
      const result = await detectAndCreateTask(msg);
      console.log(`结果: ${result.isTask ? '✅ 任务' : '❌ 非任务'}`);
      if (result.task) {
        console.log(`  标题: ${result.task.title}`);
        console.log(`  优先级: ${result.task.priority}`);
      }
      console.log('---');
    }
  })();
}

module.exports = {
  detectAndCreateTask,
  batchDetectTasks,
  getTaskQueueStatus,
  checkTaskSystemHealth
};