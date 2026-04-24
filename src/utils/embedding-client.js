/**
 * Embedding 客户端 - 任务语义搜索与推荐
 * 功能：
 * - 生成任务 embedding
 * - 语义搜索
 * - 相似任务推荐
 * - 重复检测
 */

const fs = require('fs');
const path = require('path');

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || 'YOUR_NVIDIA_API_KEY';

class EmbeddingClient {
  constructor(options = {}) {
    this.model = options.model || 'nvidia/nv-embedqa-e5-v5';
    this.baseUrl = 'https://integrate.api.nvidia.com/v1';
    this.apiKey = NVIDIA_API_KEY;
    this.indexPath = options.indexPath || path.join(__dirname, '../data/task-embeddings.json');
    
    // 内存中的向量索引
    this.embeddings = new Map(); // taskId -> { embedding, metadata }
    
    // 加载已保存的索引
    this.loadIndex();
  }

  /**
   * 生成单个文本的 embedding
   */
  async embed(text, inputType = 'query') {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: [text],
        model: this.model,
        encoding_format: 'float',
        input_type: inputType
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  /**
   * 批量生成 embedding
   */
  async embedBatch(texts, inputType = 'passage') {
    const batchSize = 100; // NVIDIA API 限制
    const allEmbeddings = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: batch,
          model: this.model,
          encoding_format: 'float',
          input_type: inputType
        })
      });

      if (!response.ok) {
        throw new Error(`NVIDIA API Error: ${response.status}`);
      }

      const data = await response.json();
      allEmbeddings.push(...data.data.map(item => item.embedding));
    }

    return allEmbeddings;
  }

  /**
   * 为任务生成 embedding（组合标题、描述、标签）
   */
  async embedTask(task) {
    const text = [
      task.title,
      task.description || '',
      task.tags ? task.tags.join(' ') : '',
      task.category || ''
    ].filter(Boolean).join(' ');
    
    return await this.embed(text, 'passage');
  }

  /**
   * 添加任务到索引
   */
  async addTask(task) {
    const embedding = await this.embedTask(task);
    this.embeddings.set(task.id, {
      embedding,
      metadata: {
        title: task.title,
        category: task.category,
        status: task.status,
        createdAt: task.createdAt
      }
    });
    
    // 保存到磁盘
    this.saveIndex();
    
    return embedding;
  }

  /**
   * 从索引中移除任务
   */
  removeTask(taskId) {
    this.embeddings.delete(taskId);
    this.saveIndex();
  }

  /**
   * 搜索相似任务
   * @param {string|number[]} query - 查询文本或向量
   * @param {Object} options - 选项
   * @returns {Array} 按相似度排序的任务列表
   */
  async search(query, options = {}) {
    const { topK = 5, threshold = 0.5 } = options;
    
    // 如果查询是文本，先生成 embedding
    const queryEmbedding = typeof query === 'string' 
      ? await this.embed(query, 'query')
      : query;

    const results = [];
    
    for (const [taskId, { embedding, metadata }] of this.embeddings) {
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      
      if (similarity >= threshold) {
        results.push({
          taskId,
          similarity,
          ...metadata
        });
      }
    }

    // 按相似度排序
    results.sort((a, b) => b.similarity - a.similarity);
    
    return results.slice(0, topK);
  }

  /**
   * 查找相似任务（用于去重）
   */
  async findSimilar(task, options = {}) {
    const { threshold = 0.85, topK = 5 } = options;
    const embedding = await this.embedTask(task);
    return await this.search(embedding, { topK, threshold });
  }

  /**
   * 保存索引到磁盘
   */
  saveIndex() {
    const data = {
      model: this.model,
      updatedAt: new Date().toISOString(),
      embeddings: Array.from(this.embeddings.entries()).map(([id, data]) => ({
        id,
        embedding: data.embedding,
        metadata: data.metadata
      }))
    };

    const dir = path.dirname(this.indexPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.indexPath, JSON.stringify(data, null, 2));
  }

  /**
   * 从磁盘加载索引
   */
  loadIndex() {
    if (!fs.existsSync(this.indexPath)) {
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      this.embeddings.clear();
      
      for (const item of data.embeddings || []) {
        this.embeddings.set(item.id, {
          embedding: item.embedding,
          metadata: item.metadata
        });
      }
      
      console.log(`[Embedding] 已加载 ${this.embeddings.size} 个任务向量`);
    } catch (error) {
      console.error('[Embedding] 加载索引失败:', error.message);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalTasks: this.embeddings.size,
      model: this.model,
      indexPath: this.indexPath
    };
  }
}

/**
 * 余弦相似度计算
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('向量维度不匹配');
  }

  const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a * 1.0, 0));
  const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b * 1.0, 0));
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dot / (normA * normB);
}

// 导出单例
let embeddingClient = null;

function getEmbeddingClient(options = {}) {
  if (!embeddingClient) {
    embeddingClient = new EmbeddingClient(options);
  }
  return embeddingClient;
}

module.exports = {
  EmbeddingClient,
  getEmbeddingClient,
  cosineSimilarity
};
