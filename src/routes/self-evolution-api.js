/**
 * 自我进化 API 路由
 * 提供进化监控页面所需的数据接口
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data/self-evolution');
const SKILLS_DIR = path.join(__dirname, '../../skills');

// 读取 JSON 文件辅助函数
const readJSON = (file, defaultVal = {}) => {
  if (!fs.existsSync(file)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return defaultVal;
  }
};

// 读取 JSONL 文件辅助函数
const readJSONL = (dir) => {
  const items = [];
  if (!fs.existsSync(dir)) return items;
  
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  files.forEach(file => {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    content.split('\n').filter(Boolean).forEach(line => {
      try {
        items.push(JSON.parse(line));
      } catch {}
    });
  });
  
  return items;
};

/**
 * 获取进化历史
 */
router.get('/history', (req, res) => {
  try {
    const historyFile = path.join(DATA_DIR, 'evolution-history.json');
    const history = readJSON(historyFile, { records: [] });
    
    res.json(history.records || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取知识库数据
 */
router.get('/knowledge-base', (req, res) => {
  try {
    const kbFile = path.join(DATA_DIR, 'knowledge-base.json');
    const kb = readJSON(kbFile, { knowledgePoints: [] });
    
    res.json({
      totalKnowledge: kb.knowledgePoints?.length || 0,
      byType: kb.knowledgePoints?.reduce((acc, p) => {
        acc[p.type] = (acc[p.type] || 0) + 1;
        return acc;
      }, {}) || {},
      patterns: kb.patterns || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取反思记录
 */
router.get('/reflections', (req, res) => {
  try {
    const reflectionsDir = path.join(DATA_DIR, 'reflections');
    const items = readJSONL(reflectionsDir);
    
    res.json({
      total: items.length,
      applied: items.filter(r => r.applied).length,
      items: items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取技能列表
 */
router.get('/skills', (req, res) => {
  try {
    const skills = [];
    
    if (fs.existsSync(SKILLS_DIR)) {
      const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      
      dirs.forEach(dir => {
        const skillFile = path.join(SKILLS_DIR, dir, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          const content = fs.readFileSync(skillFile, 'utf8');
          
          // 解析版本
          const versionMatch = content.match(/\*\*版本\*\*:\s*(\d+\.\d+\.\d+)/);
          const version = versionMatch ? versionMatch[1] : '1.0.0';
          
          // 解析描述
          const descMatch = content.match(/description:\s*\|?\s*([^\n]+)/);
          const description = descMatch ? descMatch[1].trim() : '';
          
          skills.push({
            name: dir,
            version,
            description
          });
        }
      });
    }
    
    res.json(skills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取配置
 */
router.get('/config', (req, res) => {
  try {
    const configFile = path.join(DATA_DIR, 'reflection-config.json');
    const config = readJSON(configFile, { phase: 1 });
    
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新配置
 */
router.post('/config', (req, res) => {
  try {
    const configFile = path.join(DATA_DIR, 'reflection-config.json');
    const config = readJSON(configFile, {});
    
    const updated = { ...config, ...req.body };
    fs.writeFileSync(configFile, JSON.stringify(updated, null, 2));
    
    res.json({ success: true, config: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 手动触发进化
 */
router.post('/run', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const runnerPath = path.join(__dirname, '../scripts/self-evolution/self-evolution-runner.js');
    
    exec(`node ${runnerPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error('进化执行失败:', error);
      }
    });
    
    // 等待一小段时间让进化开始
    await new Promise(resolve => setTimeout(resolve, 500));
    
    res.json({ 
      success: true, 
      message: '进化已触发，请稍后刷新查看结果' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取统计数据
 */
router.get('/stats', (req, res) => {
  try {
    const historyFile = path.join(DATA_DIR, 'evolution-history.json');
    const history = readJSON(historyFile, { records: [] });
    
    const kbFile = path.join(DATA_DIR, 'knowledge-base.json');
    const kb = readJSON(kbFile, { knowledgePoints: [] });
    
    const reflectionsDir = path.join(DATA_DIR, 'reflections');
    const reflections = readJSONL(reflectionsDir);
    
    const skills = [];
    if (fs.existsSync(SKILLS_DIR)) {
      const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      skills.push(...dirs);
    }
    
    res.json({
      totalKnowledge: kb.knowledgePoints?.length || 0,
      totalSkills: skills.length,
      totalReflections: reflections.length,
      appliedReflections: reflections.filter(r => r.applied).length,
      lastEvolution: history.records?.[0]?.timestamp || null,
      evolutionCount: history.records?.length || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;