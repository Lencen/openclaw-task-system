/**
 * 反思系统 API 路由
 * 提供问题记录、统计、总结等功能
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'reflection-data.json');

// 读取数据
function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('[Reflection] 读取数据失败:', e);
  }
  return { summary: {}, stats: {}, weaknesses: [], issues: [] };
}

// 写入数据
function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[Reflection] 写入数据失败:', e);
    return false;
  }
}

// 获取统计数据
router.get('/stats', (req, res) => {
  const data = readData();
  res.json({ success: true, stats: data.stats || {} });
});

// 获取问题列表
router.get('/issues', (req, res) => {
  const data = readData();
  const issues = data.issues || [];
  
  // 支持筛选
  let filtered = issues;
  const { type, status, days } = req.query;
  
  if (type) {
    filtered = filtered.filter(i => i.type === type);
  }
  if (status) {
    filtered = filtered.filter(i => i.status === status);
  }
  if (days) {
    const cutoff = Date.now() - parseInt(days) * 24 * 60 * 60 * 1000;
    filtered = filtered.filter(i => new Date(i.time || i.date).getTime() > cutoff);
  }
  
  res.json({ success: true, issues: filtered, total: issues.length });
});

// 获取单个问题详情
router.get('/issues/:id', (req, res) => {
  const data = readData();
  const issue = (data.issues || []).find(i => i.id === req.params.id);
  
  if (issue) {
    res.json({ success: true, issue });
  } else {
    res.status(404).json({ success: false, error: '问题不存在' });
  }
});

// 添加问题
router.post('/issues', (req, res) => {
  const data = readData();
  const issues = data.issues || [];
  
  const newIssue = {
    id: 'issue-' + Date.now().toString(36),
    title: req.body.title,
    type: req.body.type || 'bug',
    time: new Date().toISOString().replace('T', ' ').slice(0, 16),
    status: 'open',
    background: req.body.background || '',
    reason: req.body.reason || '',
    solution: req.body.solution || '',
    reflection: req.body.reflection || '',
    recurring: false,
    recurringCount: 1
  };
  
  issues.unshift(newIssue);
  data.issues = issues;
  
  // 更新统计
  data.stats = data.stats || {};
  data.stats.total = (data.stats.total || 0) + 1;
  
  writeData(data);
  
  res.json({ success: true, issue: newIssue });
});

// 更新问题
router.put('/issues/:id', (req, res) => {
  const data = readData();
  const issues = data.issues || [];
  const index = issues.findIndex(i => i.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '问题不存在' });
  }
  
  issues[index] = { ...issues[index], ...req.body };
  data.issues = issues;
  
  writeData(data);
  
  res.json({ success: true, issue: issues[index] });
});

// 标记问题为反复出现
router.post('/issues/:id/recurring', (req, res) => {
  const data = readData();
  const issues = data.issues || [];
  const index = issues.findIndex(i => i.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: '问题不存在' });
  }
  
  issues[index].recurring = true;
  issues[index].recurringCount = (issues[index].recurringCount || 1) + 1;
  issues[index].recurringReason = req.body.reason || '';
  
  // 更新统计
  data.stats = data.stats || {};
  data.stats.recurring = (data.stats.recurring || 0) + 1;
  
  writeData(data);
  
  res.json({ success: true, issue: issues[index] });
});

// 获取总结
router.get('/summary', (req, res) => {
  const data = readData();
  res.json({ success: true, summary: data.summary || {} });
});

// 更新总结
router.put('/summary', (req, res) => {
  const data = readData();
  
  const currentVersion = data.summary?.version || '1.0';
  const newVersion = incrementVersion(currentVersion);
  
  data.summary = {
    version: newVersion,
    updateTime: new Date().toISOString().slice(0, 10),
    content: req.body.content || ''
  };
  
  writeData(data);
  
  res.json({ success: true, summary: data.summary });
});

// 获取薄弱环节
router.get('/weaknesses', (req, res) => {
  const data = readData();
  res.json({ success: true, weaknesses: data.weaknesses || [] });
});

// 刷新统计数据
router.post('/refresh-stats', (req, res) => {
  const data = readData();
  const issues = data.issues || [];
  
  // 重新计算统计
  data.stats = {
    total: issues.length,
    resolved: issues.filter(i => i.status === 'resolved').length,
    recurring: issues.filter(i => i.recurring).length,
    improvements: issues.filter(i => i.reflection && i.reflection.length > 0).length
  };
  
  // 分析薄弱环节
  const categoryCount = {};
  issues.forEach(i => {
    const category = getCategory(i);
    if (!categoryCount[category]) {
      categoryCount[category] = { name: category, count: 0, recurring: 0 };
    }
    categoryCount[category].count++;
    if (i.recurring) categoryCount[category].recurring++;
  });
  
  data.weaknesses = Object.values(categoryCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((w, i) => ({
      ...w,
      percent: Math.round((w.count / issues.length) * 100)
    }));
  
  // 更新总结版本
  if (data.summary) {
    const currentVersion = data.summary.version || '1.0';
    data.summary.version = incrementVersion(currentVersion);
    data.summary.updateTime = new Date().toISOString().slice(0, 10);
  }
  
  writeData(data);
  
  res.json({ success: true, stats: data.stats, weaknesses: data.weaknesses });
});

// 辅助函数：获取问题分类
function getCategory(issue) {
  const title = (issue.title || '').toLowerCase();
  const reason = (issue.reason || '').toLowerCase();
  
  if (title.includes('配置') || reason.includes('配置')) return '配置管理';
  if (title.includes('gateway') || reason.includes('gateway')) return 'Gateway服务';
  if (title.includes('记忆') || reason.includes('记忆')) return '记忆系统';
  if (title.includes('agent') || reason.includes('agent')) return 'Agent协作';
  if (title.includes('任务') || reason.includes('任务')) return '任务执行';
  if (title.includes('飞书') || reason.includes('飞书')) return '飞书集成';
  if (title.includes('认证') || reason.includes('认证')) return '认证系统';
  
  return '其他';
}

// 辅助函数：版本号递增
function incrementVersion(version) {
  const parts = version.split('.');
  const minor = parseInt(parts[1] || '0') + 1;
  return parts[0] + '.' + minor;
}

module.exports = router;