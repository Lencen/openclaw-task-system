/**
 * Task Reflection API
 * 
 * 专门处理任务完成后的反思流程
 * 与任务状态变更集成，确保任务完成时触发反思
 * 扩展原有 reflection-api.js 功能，使用数据库存储
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('fs');
const path = require('path');
const ReflectionProcessor = require('../services/reflection-processor');

// 为了兼容性，同时支持旧的文件系统
const DATA_FILE = path.join(__dirname, '..', 'data', 'reflection-data.json');

// 读取旧的数据文件（用于兼容性）
function readOldData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('[Reflection] 读取旧数据失败:', e);
  }
  return { summary: {}, stats: {}, weaknesses: [], issues: [] };
}

/**
 * 手动触发任务反思（用于测试或补救）
 * POST /api/tasks/:id/reflect
 */
router.post('/:id/reflect', async (req, res) => {
  const { id: taskId } = req.params;
  
  try {
    const task = db.tasks.get(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: { type: 'NotFoundError', message: '任务不存在' }
      });
    }

    // 检查任务是否已完成
    if (task.status !== 'done') {
      return res.status(400).json({
        success: false,
        error: { type: 'InvalidStatusError', message: '任务尚未完成，无法进行反思' }
      });
    }

    // 触发反思处理
    const result = await ReflectionProcessor.processCompletedTask(taskId);
    
    if (result) {
      const reflection = ReflectionProcessor.getTaskReflectionStatus(taskId);
      
      res.json({
        success: true,
        data: {
          taskId,
          reflectionId: reflection ? reflection.id : null,
          status: 'started',
          message: '反思流程已启动'
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: { type: 'ProcessingError', message: '启动反思流程失败' }
      });
    }
  } catch (error) {
    console.error('[TaskReflectionAPI] 手动触发反思失败:', error);
    res.status(500).json({
      success: false,
      error: { type: 'SystemError', message: error.message }
    });
  }
});

/**
 * 获取任务的反思状态
 * GET /api/tasks/:id/reflection
 */
router.get('/:id/reflection', (req, res) => {
  const { id: taskId } = req.params;
  
  try {
    const reflection = ReflectionProcessor.getTaskReflectionStatus(taskId);
    
    if (!reflection) {
      return res.json({
        success: true,
        data: {
          taskId,
          hasReflection: false,
          reflection: null
        }
      });
    }

    res.json({
      success: true,
      data: {
        taskId,
        hasReflection: true,
        reflection: reflection
      }
    });
  } catch (error) {
    console.error('[TaskReflectionAPI] 获取反思状态失败:', error);
    res.status(500).json({
      success: false,
      error: { type: 'SystemError', message: error.message }
    });
  }
});

/**
 * 获取所有反思记录
 * GET /api/reflections
 */
router.get('/', (req, res) => {
  try {
    const { status, taskId, limit = 50, offset = 0 } = req.query;
    
    let sql = 'SELECT * FROM task_reflections';
    const params = [];
    
    const conditions = [];
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    
    if (taskId) {
      conditions.push('task_id = ?');
      params.push(taskId);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' ORDER BY triggered_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const reflections = db.all(sql, params);
    const total = db.get('SELECT COUNT(*) as count FROM task_reflections' + 
                        (conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''), 
                        params.slice(0, conditions.length)).count;
    
    res.json({
      success: true,
      data: {
        reflections,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('[TaskReflectionAPI] 获取反思记录失败:', error);
    res.status(500).json({
      success: false,
      error: { type: 'SystemError', message: error.message }
    });
  }
});

/**
 * 获取反思统计
 * GET /api/reflections/stats
 */
router.get('/stats', (req, res) => {
  try {
    const stats = db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN evolution_trigger IS NOT NULL THEN 1 ELSE 0 END) as with_evolution
      FROM task_reflections
    `);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[TaskReflectionAPI] 获取反思统计失败:', error);
    res.status(500).json({
      success: false,
      error: { type: 'SystemError', message: error.message }
    });
  }
});

/**
 * 重试失败的反思
 * POST /api/reflections/:id/retry
 */
router.post('/:id/retry', (req, res) => {
  const { id: reflectionId } = req.params;
  
  try {
    const reflection = db.get('SELECT * FROM task_reflections WHERE id = ?', [reflectionId]);
    
    if (!reflection) {
      return res.status(404).json({
        success: false,
        error: { type: 'NotFoundError', message: '反思记录不存在' }
      });
    }

    if (reflection.status !== 'failed') {
      return res.status(400).json({
        success: false,
        error: { type: 'InvalidStatusError', message: '只有失败的反思可以重试' }
      });
    }

    // 重置状态为 pending，以便重新处理
    db.run('UPDATE task_reflections SET status = ?, completed_at = NULL WHERE id = ?', ['pending', reflectionId]);

    // 重新触发处理
    setTimeout(async () => {
      const task = db.tasks.get(reflection.task_id);
      if (task) {
        await ReflectionProcessor.performReflectionAnalysis(reflectionId, task);
      }
    }, 1000);

    res.json({
      success: true,
      data: {
        reflectionId,
        status: 'retry_started',
        message: '反思重试已启动'
      }
    });
  } catch (error) {
    console.error('[TaskReflectionAPI] 重试反思失败:', error);
    res.status(500).json({
      success: false,
      error: { type: 'SystemError', message: error.message }
    });
  }
});

/**
 * 批量处理待反思的任务
 * POST /api/reflections/process-pending
 */
router.post('/process-pending', async (req, res) => {
  try {
    const pendingReflections = ReflectionProcessor.getPendingReflections();
    const completedTasksWithoutReflection = db.all(`
      SELECT id, title, description, status, completed_at, completed_result 
      FROM tasks 
      WHERE status = 'done' 
        AND id NOT IN (SELECT task_id FROM task_reflections)
    `);

    const results = {
      alreadyProcessing: pendingReflections.length,
      needsProcessing: completedTasksWithoutReflection.length,
      processed: 0,
      errors: 0
    };

    // 处理没有反思记录的已完成任务
    for (const task of completedTasksWithoutReflection) {
      try {
        const success = await ReflectionProcessor.processCompletedTask(task.id);
        if (success) {
          results.processed++;
        } else {
          results.errors++;
        }
      } catch (error) {
        console.error(`[TaskReflectionAPI] 处理任务 ${task.id} 反思失败:`, error);
        results.errors++;
      }
    }

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('[TaskReflectionAPI] 批量处理反思失败:', error);
    res.status(500).json({
      success: false,
      error: { type: 'SystemError', message: error.message }
    });
  }
});


// 导出兼容性函数
router.readOldData = readOldData;

module.exports = router;