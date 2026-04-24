/**
 * Knowledge Base Routes
 * 知识库API路由
 */

const express = require('express');
const router = express.Router();
const { KnowledgeBaseRAG } = require('../utils/knowledge-base-rag');

// 初始化RAG服务
const kbRag = new KnowledgeBaseRAG({ kbPath: '/path/to/knowledge-base' });

// 知识库搜索
router.get('/search', async (req, res) => {
  try {
    const { q, topK = 5, tag } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query parameter' });
    const results = await kbRag.search(q, { topK: parseInt(topK), filters: tag ? { tag } : {} });
    res.json({ query: q, results, total: results.length });
  } catch (error) {
    console.error('[KB-Search] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 知识库问答
router.get('/ask', async (req, res) => {
  try {
    const { q, topK = 3 } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing question parameter' });
    const answer = await kbRag.askQuestion(q, { topK: parseInt(topK) });
    res.json(answer);
  } catch (error) {
    console.error('[KB-Ask] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 重建索引
router.post('/reindex', async (req, res) => {
  try {
    const count = await kbRag.indexAll();
    res.json({ success: true, totalDocuments: count, message: `已索引 ${count} 个文档` });
  } catch (error) {
    console.error('[KB-Reindex] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取统计信息
router.get('/stats', async (req, res) => {
  try {
    const stats = kbRag.getStats();
    res.json(stats);
  } catch (error) {
    console.error('[KB-Stats] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
