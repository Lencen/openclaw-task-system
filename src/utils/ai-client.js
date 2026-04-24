/**
 * 统一 AI 客户端包装器
 * 功能：为所有 AI 调用（NVIDIA, Jina 等）提供限流保护
 * 用法：
 *   const { callAI } = require('./utils/ai-client');
 *   const result = await callAI(async () => { /* 你的 AI 调用 * / });
 */

const { getNVIDIARateLimiter } = require('../middleware/nvidia-rate-limit');
const { getJinaClient } = require('../jina-client'); // 如果存在的话

// 初始化 NVIDIA 限流器
const nvidiaLimiter = getNVIDIARateLimiter({
  rpm: parseInt(process.env.NVIDIA_RPM) || 60,
  tpm: parseInt(process.env.NVIDIA_TPM) || 100000,
  concurrent: parseInt(process.env.NVIDIA_CONCURRENT) || 3,
  maxRetries: 3,
  baseDelay: 2000
});

/**
 * 通用 AI 调用包装函数
 * @param {Function} apiCall - 实际的 AI 调用函数
 * @param {Object} options - 配置选项
 * @param {string} options.provider - AI 提供商 ('nvidia' | 'jina' | 'openai')
 * @param {number} options.tokenEstimate - 预估 token 数
 * @returns {Promise<any>} AI 调用结果
 */
async function callAI(apiCall, options = {}) {
  const { 
    provider = 'nvidia', 
    tokenEstimate = 100 
  } = options;
  
  try {
    if (provider === 'nvidia') {
      return await nvidiaLimiter.requestWithRetry(apiCall, tokenEstimate);
    } 
    // 其他提供商可以在这里扩展
    else {
      // 默认直接调用，无限流保护
      return await apiCall();
    }
  } catch (error) {
    console.error(`[AI Client] ${provider} 调用失败:`, error.message);
    throw error;
  }
}

/**
 * 获取限流器统计信息
 */
function getStats(provider = 'nvidia') {
  if (provider === 'nvidia') {
    return nvidiaLimiter.getStats();
  }
  return null;
}

module.exports = {
  callAI,
  getStats,
  nvidiaLimiter
};
