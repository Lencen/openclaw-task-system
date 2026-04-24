/**
 * 记忆服务 API
 * 
 * 提供联邦 Agent 访问共享记忆的能力
 * 
 * GET  /api/memory/search?q=关键词 - 搜索记忆
 * GET  /api/memory/list - 获取记忆列表
 * GET  /api/memory/file/:name - 获取具体记忆文件
 * POST /api/memory/write - 写入新记忆
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(process.env.HOME, '.openclaw/workspace/memory');

/**
 * GET /api/memory/search
 * 搜索记忆
 */
router.get('/search', (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q) {
      return res.status(400).json({ success: false, error: '搜索关键词不能为空' });
    }
    
    const results = [];
    const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md'));
    
    const searchLower = q.toLowerCase();
    
    for (const file of files) {
      const filePath = path.join(MEMORY_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes(searchLower)) {
          // 获取上下文（前后各 2 行）
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length, i + 3);
          const context = lines.slice(start, end).join('\n');
          
          results.push({
            file,
            line: i + 1,
            context,
            match: line
          });
          
          if (results.length >= parseInt(limit)) {
            break;
          }
        }
      }
      
      if (results.length >= parseInt(limit)) {
        break;
      }
    }
    
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('[Memory] 搜索失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/memory/list
 * 获取记忆文件列表
 */
router.get('/list', (req, res) => {
  try {
    const files = fs.readdirSync(MEMORY_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const filePath = path.join(MEMORY_DIR, f);
        const stat = fs.statSync(filePath);
        return {
          name: f,
          size: stat.size,
          modified: stat.mtime
        };
      })
      .sort((a, b) => b.modified - a.modified);
    
    res.json({ success: true, data: files });
  } catch (err) {
    console.error('[Memory] 获取列表失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/memory/file/:name
 * 获取具体记忆文件内容
 */
router.get('/file/:name', (req, res) => {
  try {
    const { name } = req.params;
    
    // 安全检查
    if (name.includes('..') || !name.endsWith('.md')) {
      return res.status(400).json({ success: false, error: '无效的文件名' });
    }
    
    const filePath = path.join(MEMORY_DIR, name);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    
    res.json({ success: true, data: { name, content } });
  } catch (err) {
    console.error('[Memory] 读取文件失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/memory/write
 * 写入新记忆
 */
router.post('/write', (req, res) => {
  try {
    const { content, file, append = true } = req.body;
    
    if (!content) {
      return res.status(400).json({ success: false, error: '内容不能为空' });
    }
    
    // 默认写入今天的记忆文件
    const fileName = file || `${new Date().toISOString().split('T')[0]}.md`;
    
    // 安全检查
    if (fileName.includes('..') || !fileName.endsWith('.md')) {
      return res.status(400).json({ success: false, error: '无效的文件名' });
    }
    
    const filePath = path.join(MEMORY_DIR, fileName);
    
    // 添加时间戳
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const formattedContent = `\n\n---\n\n**[${timestamp}]**\n\n${content}`;
    
    if (append && fs.existsSync(filePath)) {
      fs.appendFileSync(filePath, formattedContent);
    } else {
      fs.writeFileSync(filePath, formattedContent);
    }
    
    res.json({ success: true, data: { file: fileName } });
  } catch (err) {
    console.error('[Memory] 写入失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/memory/today
 * 获取今天的记忆
 */
router.get('/today', (req, res) => {
  try {
    const today = `${new Date().toISOString().split('T')[0]}.md`;
    const filePath = path.join(MEMORY_DIR, today);
    
    if (!fs.existsSync(filePath)) {
      return res.json({ success: true, data: { name: today, content: '', exists: false } });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    
    res.json({ success: true, data: { name: today, content, exists: true } });
  } catch (err) {
    console.error('[Memory] 获取今日记忆失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/memory/recent
 * 获取最近几天的记忆
 */
router.get('/recent', (req, res) => {
  try {
    const { days = 7 } = req.query;
    const results = [];
    
    for (let i = 0; i < parseInt(days); i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const fileName = `${date.toISOString().split('T')[0]}.md`;
      const filePath = path.join(MEMORY_DIR, fileName);
      
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        results.push({
          name: fileName,
          content: content.substring(0, 2000), // 限制长度
          full: content.length > 2000
        });
      }
    }
    
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('[Memory] 获取最近记忆失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

console.log('✅ Memory API 已加载');

module.exports = router;