/**
 * 任务信息 API
 * 提供任务时间线、完整度检查等功能
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('better-sqlite3')(path.join(__dirname, '..', 'data', 'tasks.db'));

/**
 * GET /api/tasks/:id/timeline - 获取任务时间线
 */
router.get('/:id/timeline', (req, res) => {
  const { id } = req.params;
  
  try {
    // 获取任务基本信息
    const task = db.prepare(`
      SELECT id, title, status, priority, created_at, assigned_agent, 
             started_at, completed_at
      FROM tasks WHERE id = ?
    `).get(id);
    
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    
    // 获取 pending_spawns 记录
    const spawns = db.prepare(`
      SELECT id, agentId, status, sessionKey, createdAt, startedAt, completedAt
      FROM pending_spawns WHERE taskId = ?
      ORDER BY createdAt DESC
    `).all(id);
    
    // 构建时间线
    const timeline = [];
    
    // 创建
    timeline.push({
      status: 'pending',
      timestamp: task.created_at,
      description: '任务创建',
      icon: '📋'
    });
    
    // 分配
    if (task.assigned_agent || spawns.length > 0) {
      const spawn = spawns[0];
      timeline.push({
        status: 'assigned',
        timestamp: spawn?.createdAt || task.created_at,
        description: `分配给 ${spawn?.agentId || task.assigned_agent} Agent`,
        icon: '🎯'
      });
    }
    
    // 开始
    const doingSpawn = spawns.find(s => s.status === 'doing' || s.startedAt);
    if (doingSpawn) {
      timeline.push({
        status: 'doing',
        timestamp: doingSpawn.startedAt || doingSpawn.createdAt,
        description: '开始执行',
        icon: '🚀',
        sessionKey: doingSpawn.sessionKey
      });
    }
    
    // 完成
    if (task.status === 'done' && task.completed_at) {
      timeline.push({
        status: 'done',
        timestamp: task.completed_at,
        description: '任务完成',
        icon: '✅'
      });
    }
    
    // 失败
    if (task.status === 'failed') {
      timeline.push({
        status: 'failed',
        timestamp: task.completed_at,
        description: '任务失败',
        icon: '❌'
      });
    }
    
    res.json({
      success: true,
      data: {
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority
        },
        timeline,
        currentStatus: task.status,
        agent: spawns[0]?.agentId || task.assigned_agent
      }
    });
    
  } catch (err) {
    console.error('[Timeline API] 错误:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/tasks/:id/completeness - 获取任务完整度检查结果
 */
router.get('/:id/completeness', (req, res) => {
  const { id } = req.params;
  
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    
    // Level 1: 必填字段检查
    const requiredFields = ['id', 'title', 'description', 'priority', 'created_at'];
    const missingRequired = requiredFields.filter(f => !task[f]);
    const level1 = {
      pass: missingRequired.length === 0,
      score: missingRequired.length === 0 ? 40 : 0,
      missing: missingRequired
    };
    
    // Level 2: 类型字段检查
    const typeRequired = {
      development: ['breakdown'],
      fix: ['related_issues'],
      default: []
    };
    const taskType = task.type || 'general';
    const required = typeRequired[taskType] || typeRequired.default;
    const missingType = required.filter(f => !task[f]);
    const level2 = {
      pass: missingType.length === 0,
      score: missingType.length === 0 ? 30 : 15,
      missing: missingType
    };
    
    // Level 3: 质量检查
    const qualityIssues = [];
    if (task.title && task.title.length < 5) qualityIssues.push('标题过短');
    if (task.description && task.description.length < 20) qualityIssues.push('描述过短');
    const level3 = {
      pass: qualityIssues.length === 0,
      score: qualityIssues.length === 0 ? 20 : 10,
      issues: qualityIssues
    };
    
    // Level 4: 关联检查
    const level4 = {
      pass: true,
      score: 10,
      issues: []
    };
    if (task.type === 'fix' && !task.related_issues) {
      level4.pass = false;
      level4.score = 5;
      level4.issues.push('修复任务未关联问题');
    }
    
    // 总分
    const totalScore = level1.score + level2.score + level3.score + level4.score;
    
    res.json({
      success: true,
      data: {
        taskId: task.id,
        taskTitle: task.title,
        score: totalScore,
        levels: {
          level1,
          level2,
          level3,
          level4
        },
        suggestions: [
          ...missingRequired.map(f => `补充必填字段：${f}`),
          ...qualityIssues,
          ...level4.issues
        ]
      }
    });
    
  } catch (err) {
    console.error('[Completeness API] 错误:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
