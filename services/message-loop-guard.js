/**
 * Message Loop Guard - 消息循环防护模块
 * 
 * 功能：
 * 1. replyDepth 限制（最大 3 层）
 * 2. replyChainId 原子锁去重机制
 * 3. 内存 Map 存储（MVP 阶段）
 * 4. 防止竞态条件
 * 
 * 使用方式：
 * const guard = new MessageLoopGuard();
 * const result = guard.checkAndAcquire(message, agentId);
 * if (result.allowed) {
 *   // 处理消息
 *   guard.markReplied(chainKey);
 * }
 */

/**
 * @typedef {Object} Message
 * @property {string} id - 消息唯一 ID
 * @property {number} replyDepth - 回复深度（由系统维护）
 * @property {string} replyChainId - 回复链 ID = {roomId}:{firstMsgId}
 * @property {string} [parentMsgId] - 父消息 ID
 * @property {string} from - 发送者 Agent ID
 * @property {string} [to] - 接收者 Agent ID（私聊）
 * @property {string} roomId - 房间 ID
 * @property {string} content - 消息内容
 * @property {number} timestamp - 时间戳
 */

/**
 * @typedef {Object} CheckResult
 * @property {boolean} allowed - 是否允许处理
 * @property {string} [reason] - 拒绝原因
 * @property {string} [chainKey] - 回复链键（用于标记已回复）
 */

class MessageLoopGuard {
  /**
   * @param {Object} options - 配置选项
   * @param {number} [options.maxReplyDepth=3] - 最大回复深度
   * @param {number} [options.lockTimeout=300000] - 锁超时时间（毫秒，默认 5 分钟）
   * @param {number} [options.cleanupInterval=60000] - 清理间隔（毫秒，默认 1 分钟）
   */
  constructor(options = {}) {
    // 配置
    this.maxReplyDepth = options.maxReplyDepth || 3;
    this.lockTimeout = options.lockTimeout || 300000; // 5 分钟
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 分钟
    
    // 回复链缓存
    // Map<chainKey, { status: 'processing' | 'replied', timestamp: number, agentId: string }>
    this.replyChainCache = new Map();
    
    // 统计信息
    this.stats = {
      totalChecks: 0,
      depthRejected: 0,
      duplicateRejected: 0,
      allowed: 0
    };
    
    // 启动定期清理
    this._startCleanupTimer();
    
    console.log(`[MessageLoopGuard] 初始化完成，maxReplyDepth=${this.maxReplyDepth}, lockTimeout=${this.lockTimeout}ms`);
  }

  /**
   * 原子性检查并获取锁
   * JavaScript 单线程特性保证原子性
   * 
   * @param {string} chainKey - 回复链键
   * @param {string} agentId - Agent ID
   * @returns {boolean} true=获取成功，false=已被占用
   */
  acquireChainLock(chainKey, agentId) {
    // 检查是否已存在
    if (this.replyChainCache.has(chainKey)) {
      const existing = this.replyChainCache.get(chainKey);
      console.log(`[MessageLoopGuard] 锁已存在: ${chainKey}, status=${existing.status}, agentId=${existing.agentId}`);
      return false;
    }
    
    // 设置锁
    this.replyChainCache.set(chainKey, {
      status: 'processing',
      timestamp: Date.now(),
      agentId
    });
    
    console.log(`[MessageLoopGuard] 锁获取成功: ${chainKey}, agentId=${agentId}`);
    return true;
  }

  /**
   * 释放锁（处理完成后调用）
   * 
   * @param {string} chainKey - 回复链键
   */
  releaseChainLock(chainKey) {
    if (this.replyChainCache.has(chainKey)) {
      this.replyChainCache.delete(chainKey);
      console.log(`[MessageLoopGuard] 锁已释放: ${chainKey}`);
    }
  }

  /**
   * 标记为已回复
   * 
   * @param {string} chainKey - 回复链键
   */
  markReplied(chainKey) {
    if (this.replyChainCache.has(chainKey)) {
      const entry = this.replyChainCache.get(chainKey);
      entry.status = 'replied';
      entry.timestamp = Date.now();
      console.log(`[MessageLoopGuard] 标记已回复: ${chainKey}`);
    }
  }

  /**
   * 检查消息是否允许处理（核心方法）
   * 
   * @param {Message} msg - 消息对象
   * @param {string} agentId - 当前 Agent ID
   * @returns {CheckResult} 检查结果
   */
  checkAndAcquire(msg, agentId) {
    this.stats.totalChecks++;
    
    // 1. 检查回复深度
    const replyDepth = msg.replyDepth || 0;
    if (replyDepth > this.maxReplyDepth) {
      this.stats.depthRejected++;
      console.warn(`[MessageLoopGuard] 回复深度超限: ${replyDepth} > ${this.maxReplyDepth}, msgId=${msg.id}`);
      return {
        allowed: false,
        reason: `REPLY_DEPTH_EXCEEDED:${replyDepth}`
      };
    }
    
    // 2. 构建 replyChainId（如果消息中没有）
    const replyChainId = msg.replyChainId || this._buildReplyChainId(msg);
    
    // 3. 构建回复链键（每个 Agent 对每个回复链只处理一次）
    const chainKey = `${replyChainId}:${agentId}`;
    
    // 4. 原子性获取锁
    if (!this.acquireChainLock(chainKey, agentId)) {
      this.stats.duplicateRejected++;
      console.warn(`[MessageLoopGuard] 回复链已处理: ${chainKey}`);
      return {
        allowed: false,
        reason: `DUPLICATE_CHAIN:${chainKey}`
      };
    }
    
    // 5. 允许处理
    this.stats.allowed++;
    console.log(`[MessageLoopGuard] 消息允许处理: msgId=${msg.id}, depth=${replyDepth}, chainKey=${chainKey}`);
    
    return {
      allowed: true,
      chainKey
    };
  }

  /**
   * 构建回复链 ID
   * 
   * @param {Message} msg - 消息对象
   * @returns {string} replyChainId
   */
  _buildReplyChainId(msg) {
    // 如果有 roomId，使用 roomId:parentMsgId
    if (msg.roomId && msg.parentMsgId) {
      return `${msg.roomId}:${msg.parentMsgId}`;
    }
    
    // 如果有 roomId，使用 roomId:firstMsgId
    if (msg.roomId && msg.id) {
      return `${msg.roomId}:${msg.id}`;
    }
    
    // 回退：使用消息 ID
    return `chain:${msg.id}`;
  }

  /**
   * 检查消息是否 @ 了指定 Agent
   * 
   * @param {Message} msg - 消息对象
   * @param {string} agentId - Agent ID
   * @returns {boolean} 是否被 @
   */
  isMentioned(msg, agentId) {
    const mentions = msg.mentions || [];
    
    // 检查显式 @ 列表
    if (mentions.includes(agentId)) {
      return true;
    }
    
    // 检查 @全员 或 @all
    if (mentions.includes('@all') || mentions.includes('@全员')) {
      return true;
    }
    
    // 检查内容中的 @ 提及
    const content = msg.content || '';
    const mentionPatterns = [
      new RegExp(`@${agentId}\\b`, 'i'),
      new RegExp(`@${agentId.split(':').pop()}\\b`, 'i'), // 支持短名称
      /@全员|@all/i
    ];
    
    for (const pattern of mentionPatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 处理消息（完整流程）
   * 
   * @param {Message} msg - 消息对象
   * @param {string} agentId - 当前 Agent ID
   * @param {Function} processFn - 处理函数 async () => replyContent
   * @returns {Promise<Object>} 处理结果
   */
  async processMessage(msg, agentId, processFn) {
    // 1. 检查并获取锁
    const checkResult = this.checkAndAcquire(msg, agentId);
    
    if (!checkResult.allowed) {
      return {
        success: false,
        reason: checkResult.reason
      };
    }
    
    try {
      // 2. 检查是否被 @
      if (!this.isMentioned(msg, agentId)) {
        // 没有 @，释放锁并返回
        this.releaseChainLock(checkResult.chainKey);
        return {
          success: false,
          reason: 'NOT_MENTIONED'
        };
      }
      
      // 3. 执行处理函数
      const replyContent = await processFn(msg);
      
      // 4. 标记为已回复
      this.markReplied(checkResult.chainKey);
      
      return {
        success: true,
        replyContent,
        chainKey: checkResult.chainKey
      };
      
    } catch (error) {
      // 处理失败，释放锁
      this.releaseChainLock(checkResult.chainKey);
      console.error(`[MessageLoopGuard] 处理消息失败: ${error.message}`);
      return {
        success: false,
        reason: `PROCESS_ERROR:${error.message}`
      };
    }
  }

  /**
   * 创建回复消息
   * 
   * @param {Message} originalMsg - 原始消息
   * @param {string} replyContent - 回复内容
   * @param {string} fromAgentId - 回复者 Agent ID
   * @returns {Message} 回复消息
   */
  createReply(originalMsg, replyContent, fromAgentId) {
    const replyDepth = (originalMsg.replyDepth || 0) + 1;
    
    return {
      id: `${fromAgentId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      replyDepth,
      replyChainId: originalMsg.replyChainId || this._buildReplyChainId(originalMsg),
      parentMsgId: originalMsg.id,
      from: fromAgentId,
      to: originalMsg.from,
      roomId: originalMsg.roomId,
      content: replyContent,
      timestamp: Date.now()
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.replyChainCache.size,
      maxReplyDepth: this.maxReplyDepth,
      lockTimeout: this.lockTimeout
    };
  }

  /**
   * 清理过期的锁
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    this.replyChainCache.forEach((entry, key) => {
      if (now - entry.timestamp > this.lockTimeout) {
        this.replyChainCache.delete(key);
        cleaned++;
        console.log(`[MessageLoopGuard] 清理过期锁: ${key}`);
      }
    });
    
    if (cleaned > 0) {
      console.log(`[MessageLoopGuard] 清理完成，清理了 ${cleaned} 个过期锁`);
    }
    
    return cleaned;
  }

  /**
   * 启动定期清理定时器
   */
  _startCleanupTimer() {
    this._cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
    
    // 防止定时器阻止进程退出
    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }
  }

  /**
   * 停止定期清理
   */
  stopCleanup() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  /**
   * 重置所有状态（用于测试）
   */
  reset() {
    this.replyChainCache.clear();
    this.stats = {
      totalChecks: 0,
      depthRejected: 0,
      duplicateRejected: 0,
      allowed: 0
    };
    console.log('[MessageLoopGuard] 状态已重置');
  }
}

// 单例模式
let _instance = null;

/**
 * 获取单例实例
 * @param {Object} options - 配置选项
 * @returns {MessageLoopGuard}
 */
function getMessageLoopGuard(options) {
  if (!_instance) {
    _instance = new MessageLoopGuard(options);
  }
  return _instance;
}

// 导出
module.exports = {
  MessageLoopGuard,
  getMessageLoopGuard
};