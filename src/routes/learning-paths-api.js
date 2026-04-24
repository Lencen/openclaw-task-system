/**
 * 学习路径 API - 使用 SQLite 数据库
 */
const express = require('express');
const router = express.Router();
const LearningPathsDAL = require('../db/learning-paths-dal');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/learning-paths.db');
const dal = new LearningPathsDAL(DB_PATH);

// 获取学习路径列表
router.get('/list', (req, res) => {
  try {
    const paths = dal.getAllPaths();
    const stats = dal.getStats();
    res.json({
      success: true,
      data: paths,
      stats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单条学习路径
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const pathData = dal.getPathById(id);
    
    if (!pathData) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    
    res.json({ success: true, data: pathData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新里程碑状态
router.post('/:pathId/milestone/:milestoneId', (req, res) => {
  try {
    const { pathId, milestoneId } = req.params;
    const { status } = req.body;
    
    // 更新里程碑状态
    let dateValue;
    if (status === 'completed') {
      dateValue = new Date().toISOString().split('T')[0];
    } else if (status === 'current' || status === 'in_progress') {
      dateValue = '进行中';
    } else {
      dateValue = '待开始';
    }
    
    dal.updateMilestoneStatus(milestoneId, status, dateValue);
    
    // 重新计算路径进度
    const pathData = dal.getPathById(pathId);
    const milestones = pathData.milestones;
    const completed = milestones.filter(m => m.status === 'completed').length;
    const progress = Math.round((completed / milestones.length) * 100);
    
    dal.updateProgress(pathId, progress);
    
    // 返回更新后的路径
    const updatedPath = dal.getPathById(pathId);
    res.json({ success: true, data: updatedPath });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建新学习路径
router.post('/create', (req, res) => {
  try {
    const { name, description, category, difficulty, estimatedHours, milestones, resources } = req.body;
    
    // 生成 ID
    const id = `lp-${Date.now()}`;
    
    // 创建路径
    dal.createPath({
      id,
      name,
      description: description || '',
      category: category || '其他',
      difficulty: difficulty || '中级',
      progress: 0,
      estimatedHours: estimatedHours || 0
    });
    
    // 创建里程碑
    if (milestones && milestones.length > 0) {
      milestones.forEach((m, i) => {
        dal.createMilestone({
          id: `${id}-ms-${i}`,
          pathId: id,
          title: m.title,
          status: 'pending',
          hours: m.hours || 0,
          date: '待开始',
          sortOrder: i
        });
      });
    }
    
    // 创建资源
    if (resources && resources.length > 0) {
      resources.forEach((r, i) => {
        dal.createResource({
          id: `${id}-res-${i}`,
          pathId: id,
          type: r.type || '文档',
          title: r.title,
          url: r.url,
          sortOrder: i
        });
      });
    }
    
    res.json({ success: true, data: { id, name } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除学习路径
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    dal.deletePath(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 导出为 JSON（备份用）
router.get('/export', (req, res) => {
  try {
    const jsonData = dal.exportToJSON();
    res.json({ success: true, data: jsonData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;