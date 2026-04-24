/**
 * 消息去重管理器 v1.1
 * 
 * 功能：
 * 1. 消息级去重（5 分钟窗口）
 * 2. 任务级去重（1 小时窗口）
 * 3. 执行级去重（永久存储）
 * 4. 任务相似度检测（基于签名）
 * 
 * @version 1.1.0
 * @created 2026-03-27
 * @updated 2026-03-27 - 完善任务去重机制
 */

const crypto = require('crypto');
const RedisPool = require('./redis-pool');

/**
 * 消息去重管理器
 */
class DedupManager {
  constructor() {
    // 默认窗口时间（秒）
    this.messageWindow = 300;    // 5 分钟
    this.taskWindow = 3600;      // 1 小时
    this.executionWindow = null; // 永久
    
    // 相似度检测配置
    this.signatureLength = 32;  // 签名长度
    this.similarityThreshold = 0.8; // 相似度阈值
  }

  /**
   * 计算消息 hash
   * 
   * @param {string} message - 消息原文
   */
  calculateMessageHash(message) {
    return crypto
      .createHash('md5')
      .update(message.trim().toLowerCase())
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * 消息去重
   * 
   * @param {string} message - 消息原文
   * @param {number} window - 去重窗口时间（秒）
   */
  async deduplicateMessage(message, window = this.messageWindow) {
    const messageHash = this.calculateMessageHash(message);
    const key = `msg:dedup:${messageHash}`;

    // 检查是否已处理
    const exists = await RedisPool.checkMessageDedupe(messageHash);

    if (exists.isDeduped) {
      return {
        isDuplicate: true,
        messageHash,
        key
      };
    }

    // 标记为已处理
    await RedisPool.addMessageDedupe(messageHash, window);

    return {
      isDuplicate: false,
      messageHash,
      key
    };
  }

  /**
   * 计算任务签名（全字段，不截断）
   * 
   * 签名组成：
   * - type: 任务类型
   * - title: 任务标题（完整）
   * - description: 任务描述（完整）
   * - sourceChannel: 来源渠道
   * - day: 当天日期（当天内去重）
   * 
   * @param {object} task - 任务数据
   */
  calculateTaskSignature(task) {
    // 提取任务核心字段（不截断）
    const signatureData = {
      type: task.type || 'default',
      title: task.title || '',
      description: task.description || task.user_description || '',
      sourceChannel: task.sourceChannel || 'unknown',
      day: new Date().toISOString().split('T')[0] // 当天内去重
    };

    // 计算 SHA256 hash
    const signature = crypto
      .createHash('sha256')
      .update(JSON.stringify(signatureData))
      .digest('hex')
      .substring(0, this.signatureLength);
    
    return signature;
  }
  
  /**
   * 计算两个签名的相似度（Jaccard 相似度）
   * 
   * @param {string} signature1 - 第一个签名
   * @param {string} signature2 - 第二个签名
   */
  calculateSignatureSimilarity(signature1, signature2) {
    if (!signature1 || !signature2) return 0;
    
    // 简单实现：直接比较字符串
    if (signature1 === signature2) return 1.0;
    
    // 使用 Levenshtein 距离计算相似度
    const distance = this.levenshteinDistance(signature1, signature2);
    const maxLength = Math.max(signature1.length, signature2.length);
    const similarity = 1 - (distance / maxLength);
    
    return Math.max(0, Math.min(1, similarity));
  }
  
  /**
   * 计算 Levenshtein 距离（用于相似度计算）
   * 
   * @param {string} str1 - 字符串1
   * @param {string} str2 - 字符串2
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    // 初始化矩阵
    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }
    
    // 填充矩阵
    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // 删除
          matrix[i][j - 1] + 1,      // 插入
          matrix[i - 1][j - 1] + cost // 替换
        );
      }
    }
    
    return matrix[str1.length][str2.length];
  }

  /**
   * 任务去重检查
   * 
   * @param {object} task - 任务数据
   * @param {number} window - 去重窗口时间（秒）
   * @returns {Promise<object>} 去重结果
   */
  async deduplicateTask(task, window = this.taskWindow) {
    const signature = this.calculateTaskSignature(task);
    const key = `task:dedup:${signature}`;
    
    console.log(`[DEDUP] 任务签名: ${signature.substring(0, 8)}...`);
    
    // 检查 Redis 中是否已存在完全相同的签名
    const exists = await RedisPool.checkMessageDedupe(signature);

    if (exists.isDeduped) {
      console.log(`[DEDUP] ⚠️ 发现完全重复任务：${signature.substring(0, 8)}...`);
      return {
        isDuplicate: true,
        signature,
        key,
        matchType: 'exact'
      };
    }
    
    // 检查相似任务（在窗口内）
    const similarTasks = await this.checkSimilarTasks(signature, window);
    
    if (similarTasks.length > 0) {
      console.log(`[DEDUP] ⚠️ 发现相似任务：${similarTasks.length} 个`);
      return {
        isDuplicate: false,
        signature,
        key,
        matchType: 'similar',
        similarTasks,
        message: `发现 ${similarTasks.length} 个相似任务，请确认是否重复创建`
      };
    }

    // 标记为已处理
    await RedisPool.addMessageDedupe(signature, window);

    return {
      isDuplicate: false,
      signature,
      key,
      matchType: 'new'
    };
  }

  /**
   * 检查相似任务
   * 
   * @param {string} signature - 任务签名
   * @param {number} window - 时间窗口（秒）
   * @returns {Promise<object[]>} 相似任务列表
   */
  async checkSimilarTasks(signature, window = this.taskWindow) {
    // 获取所有任务（实际实现中应该从数据库查询）
    // 这里返回 placeholder logic
    
    // 调用数据库 API 获取最近的任务
    try {
      const http = require('http');
      
      // 获取所有任务
      const tasks = await new Promise((resolve, reject) => {
        http.get((process.env.TASK_SYSTEM_URL || 'http://localhost:8081') + '/api/tasks/all', (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve(result.data || []);
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });
      
      console.log(`[DEDUP] 检查 ${tasks.length} 个任务的相似度`);
      
      // 计算相似度
      const similarTasks = [];
      const now = Date.now();
      const windowMs = window * 1000;
      
      for (const task of tasks) {
        // 跳过自己
        if (task.id && task.id === (window.taskId || '')) continue;
        
        // 检查是否在窗口内
        const taskTime = new Date(task.created_at || task.createdAt).getTime();
        if (now - taskTime > windowMs) continue;
        
        // 计算签名
        const taskSignature = this.calculateTaskSignature(task);
        
        // 计算相似度
        const similarity = this.calculateSignatureSimilarity(signature, taskSignature);
        
        if (similarity >= this.similarityThreshold && similarity < 1.0) {
          similarTasks.push({
            taskId: task.id,
            title: task.title,
            similarity,
            created_at: task.created_at
          });
        }
      }
      
      console.log(`[DEDUP] 找到 ${similarTasks.length} 个相似任务（相似度 >= ${this.similarityThreshold}）`);
      return similarTasks;
      
    } catch (error) {
      console.error(`[DEDUP] 检查相似任务失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 生成执行 ID
   * 
   * @param {string} taskId - 任务 ID
   * @param {string} agentId - Agent ID
   * @param {number} attemptNumber - 尝试次数
   */
  generateExecutionId(taskId, agentId, attemptNumber = 0) {
    return `exec:${taskId}:${agentId}:${attemptNumber}`;
  }

  /**
   * 记录执行结果
   * 
   * @param {string} executionId - 执行 ID
   * @param {object} result - 执行结果
   */
  async recordExecution(executionId, result) {
    const key = `exec:record:${executionId}`;

    await RedisPool.createLock(
      executionId,
      {
        result,
        completedAt: Date.now()
      },
      this.executionWindow // 永久
    );
  }

  /**
   * 检查执行是否已完成
   * 
   * @param {string} executionId - 执行 ID
   */
  async isExecutionCompleted(executionId) {
    const key = `exec:record:${executionId}`;
    const exists = await RedisPool.checkLock(executionId);
    
    return exists.exists;
  }

  /**
   * 获取执行记录
   * 
   * @param {string} executionId - 执行 ID
   */
  async getExecutionRecord(executionId) {
    const lockInfo = await RedisPool.getLockInfo(executionId);
    return lockInfo.lock;
  }
}

// 创建单例实例
const dedupManager = new DedupManager();

module.exports = dedupManager;
