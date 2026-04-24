/**
 * 消息预处理器
 * 功能：在消息处理流程中自动执行任务意图检测和知识检索
 * 创建时间：2026-03-20
 */

const http = require('http');
const TASK_SYSTEM_URL = process.env.TASK_SYSTEM_URL || 'http://localhost:8081';

class MessagePreprocessor {
  constructor(options = {}) {
    this.timeout = options.timeout || 500;
    this.enableTaskDetection = options.enableTaskDetection !== false;
    this.enableKnowledgeRetrieval = options.enableKnowledgeRetrieval !== false;
    this.stats = {
      processedCount: 0,
      errorCount: 0,
      totalProcessingTime: 0
    };
  }

  /**
   * 处理消息
   * @param {object} message - 消息对象
   * @param {object} context - 上下文信息
   * @returns {Promise<object>} 预处理结果
   */
  async process(message, context = {}) {
    const startTime = Date.now();
    this.stats.processedCount++;

    const result = {
      originalMessage: message,
      taskInfo: null,
      knowledge: [],
      processingTime: 0,
      errors: []
    };

    try {
      // 异步执行任务检测和知识检索
      const promises = [];

      if (this.enableTaskDetection) {
        promises.push(
          this.detectTask(message, context).then(taskInfo => {
            result.taskInfo = taskInfo;
          }).catch(err => {
            result.errors.push(`任务检测错误：${err.message}`);
          })
        );
      }

      if (this.enableKnowledgeRetrieval) {
        promises.push(
          this.retrieveKnowledge(message, context).then(knowledge => {
            result.knowledge = knowledge;
          }).catch(err => {
            result.errors.push(`知识检索错误：${err.message}`);
          })
        );
      }

      // 等待所有操作完成或超时
      await Promise.race([
        Promise.all(promises),
        this.timeoutTimer(this.timeout)
      ]);

      result.processingTime = Date.now() - startTime;
      this.stats.totalProcessingTime += result.processingTime;
    } catch (error) {
      console.error('[MessagePreprocessor] 处理失败:', error);
      this.stats.errorCount++;
      result.errors.push(`处理错误：${error.message}`);
      result.processingTime = Date.now() - startTime;
    }

    return result;
  }

  /**
   * 检测任务意图
   */
  async detectTask(message, context) {
    const content = typeof message === 'string' ? message : message.content || message.text || '';
    
    try {
      const response = await this.httpPost(`${TASK_SYSTEM_URL}/api/tasks/from-chat`, {
        message: content,
        sourceChannel: context.channel || 'unknown',
        userId: context.userId || null
      });

      if (response.success && response.task) {
        return {
          isTask: true,
          task: response.task,
          taskId: response.id,
          message: response.message
        };
      }
      
      return { isTask: false, task: null };
    } catch (error) {
      console.error('[MessagePreprocessor] 任务检测失败:', error.message);
      return { isTask: false, task: null, error: error.message };
    }
  }

  /**
   * 检索知识
   */
  async retrieveKnowledge(message, context = {}) {
    const content = typeof message === 'string' ? message : message.content || message.text || '';
    const keywords = this.extractKeywords(content);
    
    if (keywords.length === 0) {
      return [];
    }

    const results = [];
    
    for (const keyword of keywords.slice(0, 3)) { // 最多检索 3 个关键词
      try {
        const response = await this.httpGet(
          `${TASK_SYSTEM_URL}/api/knowledge/query?q=${encodeURIComponent(keyword)}&tier=HOT`
        );
        
        if (response.success && response.results) {
          results.push(...response.results.slice(0, 2)); // 每个关键词最多取 2 条
        }
      } catch (error) {
        console.warn(`[MessagePreprocessor] 知识检索失败 (${keyword}):`, error.message);
      }
    }

    return results;
  }

  /**
   * 提取关键词
   */
  extractKeywords(content) {
    if (!content) return [];
    
    const keywords = [];
    const keywordMap = {
      '更新平台': ['更新平台', '更新系统', '补丁平台'],
      '证书': ['证书', '签名', '验签'],
      '任务': ['任务', 'task'],
      '项目': ['项目', 'project'],
      'Agent': ['Agent', '代理'],
      '部署': ['部署', 'deploy'],
      '工行': ['工行', '工商银行'],
      '南航': ['南航', '南方航空']
    };

    for (const [baseKeyword, variants] of Object.entries(keywordMap)) {
      for (const variant of variants) {
        if (content.includes(variant)) {
          keywords.push(baseKeyword);
          break;
        }
      }
    }

    return [...new Set(keywords)];
  }

  /**
   * 超时定时器
   */
  timeoutTimer(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * HTTP GET 请求
   */
  httpGet(url) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('请求超时'));
      });
    });
  }

  /**
   * HTTP POST 请求
   */
  httpPost(url, data) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const postData = JSON.stringify(data);
      
      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(responseData));
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        });
      });
      
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('请求超时'));
      });
      
      req.write(postData);
      req.end();
    });
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const avgTime = this.stats.processedCount > 0 
      ? Math.round(this.stats.totalProcessingTime / this.stats.processedCount)
      : 0;
    
    return {
      processedCount: this.stats.processedCount,
      errorCount: this.stats.errorCount,
      avgProcessingTime: avgTime
    };
  }
}

module.exports = MessagePreprocessor;
