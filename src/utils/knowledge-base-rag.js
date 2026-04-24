/**
 * 知识库RAG搜索服务
 * 基于NVIDIA Embedding的语义搜索
 */

const { EmbeddingClient } = require('./embedding-client');
const { glob } = require('glob');
const fs = require('fs');
const path = require('path');

class KnowledgeBaseRAG {
  constructor(options = {}) {
    this.embeddingClient = new EmbeddingClient(options);
    this.kbPath = options.kbPath || path.join(__dirname, '../../notes/my-knowledge');
    this.vectorIndexPath = path.join(this.kbPath, '.obsidian/knowledge-vectors.json');
    
    this.documentVectors = new Map(); // DocPath -> { embedding, metadata }
    this.loadVectors();
  }

  /**
   * 扫描知识库中的md文件
   */
  async scanDocuments() {
    const files = await glob('**/*.md', {
      cwd: this.kbPath,
      ignore: ['.obsidian/**', 'templates/**', 'node_modules/**']
    });

    return files;
  }

  /**
   * 为文档生成向量
   */
  async indexDocument(docPath, content) {
    const fullPath = path.join(this.kbPath, docPath);
    
    // 解析Frontmatter
    const frontmatter = this.parseFrontmatter(content);
    const bodyContent = this.stripFrontmatter(content);
    
    // 生成embedding
    const embedding = await this.embeddingClient.embed(
      `${frontmatter.title || docPath}\n${bodyContent}`,
      'passage'
    );
    
    // 存储向量
    this.documentVectors.set(docPath, {
      embedding,
      metadata: {
        title: frontmatter.title,
        tags: frontmatter.tags || [],
        related: frontmatter.related || [],
        created: frontmatter.created,
        updated: frontmatter.updated,
        path: docPath
      }
    });
    
    this.saveVectors();
    
    return embedding;
  }

  /**
   * 批量索引整个知识库
   */
  async indexAll() {
    const files = await this.scanDocuments();
    
    console.log(`[KB-RAG] 开始索引 ${files.length} 个文档...`);
    
    let indexed = 0;
    for (const file of files) {
      try {
        const fullPath = path.join(this.kbPath, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        
        await this.indexDocument(file, content);
        indexed++;
        
        // 进度提示
        if (indexed % 50 === 0) {
          console.log(`[KB-RAG] 进度: ${indexed}/${files.length}`);
        }
      } catch (error) {
        console.error(`[KB-RAG] 索引失败 ${file}:`, error.message);
      }
    }
    
    console.log(`[KB-RAG] 索引完成: ${indexed} 个文档`);
    return indexed;
  }

  /**
   * 语义搜索
   */
  async search(query, options = {}) {
    const { topK = 5, threshold = 0.5, filters = {} } = options;
    
    const queryEmbedding = await this.embeddingClient.embed(query, 'query');
    const results = [];
    
    for (const [docPath, { embedding, metadata }] of this.documentVectors) {
      // 应用过滤器
      if (filters.tag && !metadata.tags.includes(filters.tag)) {
        continue;
      }
      
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      
      if (similarity >= threshold) {
        results.push({
          docPath,
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
   * 智能问答（RAG）
   */
  async askQuestion(question, options = {}) {
    const { topK = 3 } = options;
    
    // 搜索相关文档
    const relevantDocs = await this.search(question, { topK });
    
    const context = [];
    for (const doc of relevantDocs) {
      const fullPath = path.join(this.kbPath, doc.docPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      const bodyContent = this.stripFrontmatter(content);
      
      context.push({
        ...doc,
        content: bodyContent.substring(0, 500) + '...'
      });
    }
    
    return {
      question,
      context,
      relevantDocs
    };
  }

  /**
   * 解析Frontmatter
   */
  parseFrontmatter(content) {
    const frontmatter = {};
    
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (match) {
      const lines = match[1].split('\n');
      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
          let value = valueParts.join(':').trim();
          
          if (value.startsWith('[') && value.endsWith(']')) {
            value = value.slice(1, -1).split(',').map(v => v.trim());
          }
          
          frontmatter[key.trim()] = value;
        }
      }
    }
    
    return frontmatter;
  }

  /**
   * 去除Frontmatter
   */
  stripFrontmatter(content) {
    return content.replace(/^---\n[\s\S]*?\n---\n/, '');
  }

  /**
   * 保存向量索引
   */
  saveVectors() {
    const data = {
      model: this.embeddingClient.model,
      updatedAt: new Date().toISOString(),
      vectors: Array.from(this.documentVectors.entries()).map(([id, data]) => ({
        id,
        embedding: data.embedding,
        metadata: data.metadata
      }))
    };

    const dir = path.dirname(this.vectorIndexPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.vectorIndexPath, JSON.stringify(data, null, 2));
  }

  /**
   * 加载向量索引
   */
  loadVectors() {
    if (!fs.existsSync(this.vectorIndexPath)) {
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(this.vectorIndexPath, 'utf8'));
      this.documentVectors.clear();
      
      for (const item of data.vectors || []) {
        this.documentVectors.set(item.id, {
          embedding: item.embedding,
          metadata: item.metadata
        });
      }
      
      console.log(`[KB-RAG] 已加载 ${this.documentVectors.size} 个文档向量`);
    } catch (error) {
      console.error('[KB-RAG] 加载索引失败:', error.message);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalDocuments: this.documentVectors.size,
      model: this.embeddingClient.model,
      kbPath: this.kbPath,
      vectorIndexPath: this.vectorIndexPath
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
  const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dot / (normA * normB);
}

module.exports = { KnowledgeBaseRAG, cosineSimilarity };
