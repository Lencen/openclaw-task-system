const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const ALERTS_FILE = path.join(__dirname, '../data/alerts.json');

// 获取告警列表
router.get('/list', (req, res) => {
  try {
    const { status, level, limit = 50 } = req.query;
    
    if (!fs.existsSync(ALERTS_FILE)) {
      return res.json({ success: true, data: [], stats: { total: 0 } });
    }
    
    const data = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
    let alerts = data.alerts || [];
    
    // 过滤
    if (status && status !== 'all') {
      alerts = alerts.filter(a => a.status === status);
    }
    if (level && level !== 'all') {
      alerts = alerts.filter(a => a.level === level);
    }
    
    // 排序（最新的在前）
    alerts.sort((a, b) => new Date(b.time) - new Date(a.time));
    
    // 限制数量
    alerts = alerts.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: alerts,
      stats: data.stats || { total: alerts.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单条告警
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    if (!fs.existsSync(ALERTS_FILE)) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    
    const data = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
    const alert = (data.alerts || []).find(a => a.id === id);
    
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    
    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 处理告警
router.post('/:id/resolve', (req, res) => {
  try {
    const { id } = req.params;
    const { resolvedBy = 'manual', note = '' } = req.body;
    
    if (!fs.existsSync(ALERTS_FILE)) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    
    const data = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
    const alertIndex = (data.alerts || []).findIndex(a => a.id === id);
    
    if (alertIndex === -1) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    
    // 更新告警状态
    data.alerts[alertIndex].status = 'resolved';
    data.alerts[alertIndex].resolvedTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    data.alerts[alertIndex].resolvedBy = resolvedBy;
    data.alerts[alertIndex].duration = '已处理';
    if (note) {
      data.alerts[alertIndex].note = note;
    }
    
    // 更新统计
    data.stats.byStatus = { unresolved: 0, resolving: 0, resolved: 0 };
    data.alerts.forEach(a => {
      data.stats.byStatus[a.status] = (data.stats.byStatus[a.status] || 0) + 1;
    });
    
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(data, null, 2));
    
    res.json({ success: true, data: data.alerts[alertIndex] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量处理告警
router.post('/batch-resolve', (req, res) => {
  try {
    const { ids, resolvedBy = 'manual' } = req.body;
    
    if (!ids || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, error: 'Missing ids' });
    }
    
    if (!fs.existsSync(ALERTS_FILE)) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    
    const data = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
    const resolvedTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    ids.forEach(id => {
      const alertIndex = (data.alerts || []).findIndex(a => a.id === id);
      if (alertIndex !== -1) {
        data.alerts[alertIndex].status = 'resolved';
        data.alerts[alertIndex].resolvedTime = resolvedTime;
        data.alerts[alertIndex].resolvedBy = resolvedBy;
        data.alerts[alertIndex].duration = '已处理';
      }
    });
    
    // 更新统计
    data.stats.byStatus = { unresolved: 0, resolving: 0, resolved: 0 };
    data.alerts.forEach(a => {
      data.stats.byStatus[a.status] = (data.stats.byStatus[a.status] || 0) + 1;
    });
    
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(data, null, 2));
    
    res.json({ success: true, resolvedCount: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 添加告警
router.post('/add', (req, res) => {
  try {
    const { title, level, source, description, suggestion, relatedMetrics } = req.body;
    
    if (!title || !level) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    let data = { alerts: [], stats: { total: 0, byStatus: {}, byLevel: {} } };
    if (fs.existsSync(ALERTS_FILE)) {
      data = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
    }
    
    const newAlert = {
      id: `alt-${String(data.alerts.length + 1).padStart(3, '0')}`,
      title,
      level,
      status: 'unresolved',
      source: source || '系统',
      time: new Date().toISOString().replace('T', ' ').substring(0, 19),
      duration: '刚刚',
      description: description || '',
      suggestion: suggestion || '',
      relatedMetrics: relatedMetrics || []
    };
    
    data.alerts.push(newAlert);
    
    // 更新统计
    data.stats.total = data.alerts.length;
    data.stats.byStatus = { unresolved: 0, resolving: 0, resolved: 0 };
    data.stats.byLevel = { critical: 0, warning: 0, info: 0 };
    data.alerts.forEach(a => {
      data.stats.byStatus[a.status] = (data.stats.byStatus[a.status] || 0) + 1;
      data.stats.byLevel[a.level] = (data.stats.byLevel[a.level] || 0) + 1;
    });
    
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(data, null, 2));
    
    res.json({ success: true, data: newAlert });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
