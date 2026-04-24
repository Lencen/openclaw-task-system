/**
 * 任务排序和手动顺序调整 API
 */

const express = require('express');
const router = express.Router();
const taskSorting = require('../../scripts/task-priority-sorting');
const fs = require('fs');
const path = require('path');

const TASKS_FILE = path.join(__dirname, '../data/tasks.json');

/**
 * GET /api/tasks/sort
 * 获取排序后的任务列表
 */
router.get('/sort', (req, res) => {
  try {
    const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));

    // 过滤掉已完成和已归档的任务
    const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'archived');

    // 按规则排序
    const sortedTasks = taskSorting.sortTasks(activeTasks);

    res.json({
      success: true,
      count: sortedTasks.length,
      tasks: sortedTasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/tasks/order
 * 手动调整任务顺序
 *
 * Body:
 * {
 *   taskIds: ['task-id-1', 'task-id-2', ...]  // 按顺序的任务ID数组
 * }
 */
router.post('/order', (req, res) => {
  try {
    const { taskIds } = req.body;

    if (!taskIds || !Array.isArray(taskIds)) {
      return res.status(400).json({
        success: false,
        error: 'taskIds 必须是数组'
      });
    }

    const result = taskSorting.setTaskOrder(taskIds);

    res.json({
      success: result.success,
      updatedCount: result.updatedCount,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/tasks/:taskId/order
 * 设置单个任务的顺序号
 *
 * Body:
 * {
 *   order: 1  // 顺序号（数字越小越靠前）
 * }
 */
router.post('/:taskId/order', (req, res) => {
  try {
    const { taskId } = req.params;
    const { order } = req.body;

    if (typeof order !== 'number' || order < 0) {
      return res.status(400).json({
        success: false,
        error: 'order 必须是非负整数'
      });
    }

    const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    const taskIndex = tasks.findIndex(t => t.id === taskId);

    if (taskIndex === -1) {
      return res.status(404).json({
        success: false,
        error: '任务不存在'
      });
    }

    tasks[taskIndex].task_order = order;
    tasks[taskIndex].task_order_updated_at = new Date().toISOString();

    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');

    res.json({
      success: true,
      message: `任务顺序已设置为 ${order}`,
      task: {
        id: taskId,
        task_order: order
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/tasks/:taskId/order
 * 重置任务的顺序（恢复自动排序）
 */
router.delete('/:taskId/order', (req, res) => {
  try {
    const { taskId } = req.params;
    const result = taskSorting.resetTaskOrder(taskId);

    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/tasks/order
 * 重置所有任务的顺序
 */
router.delete('/order', (req, res) => {
  try {
    const result = taskSorting.resetTaskOrder(null);

    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/tasks/normalize-priority
 * 标准化所有任务的优先级（old → new format）
 */
router.post('/normalize-priority', (req, res) => {
  try {
    const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));

    let updatedCount = 0;
    tasks.forEach(task => {
      const oldPriority = task.priority;
      const newPriority = taskSorting.normalizePriority(oldPriority);

      if (oldPriority !== newPriority) {
        task.priority = newPriority;
        task.priority_normalized_at = new Date().toISOString();
        updatedCount++;
      }

      // 标准化象限
      if (task.quadrant) {
        const oldQuadrant = task.quadrant;
        const newQuadrant = taskSorting.normalizeQuadrant(oldQuadrant);
        if (oldQuadrant !== newQuadrant) {
          task.quadrant = newQuadrant;
          updatedCount++;
        }
      }
    });

    if (updatedCount > 0) {
      fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
    }

    res.json({
      success: true,
      updatedCount,
      message: `已标准化 ${updatedCount} 个任务的优先级和象限`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tasks/priority-rules
 * 获取优先级规则文档
 */
router.get('/priority-rules', (req, res) => {
  res.json({
    success: true,
    rules: {
      priority: {
        levels: ['P0', 'P1', 'P2', 'P3', 'P4'],
        descriptions: {
          P0: '紧急/关键任务，立即执行',
          P1: '高优先级，尽快完成',
          P2: '中等优先级，正常执行',
          P3: '低优先级，有空闲时处理',
          P4: '可选/长期任务，不紧急'
        },
        mapping: {
          'critical': 'P0',
          'high': 'P1',
          'medium': 'P2',
          'low': 'P3'
        }
      },
      quadrant: {
        levels: ['Q1', 'Q2', 'Q3', 'Q4'],
        descriptions: {
          Q1: '重要且紧急（第一象限）',
          Q2: '重要但不紧急（第二象限）',
          Q3: '紧急但不重要（第三象限）',
          Q4: '不重要且不紧急（第四象限）'
        }
      },
      sorting: {
        order: [
          '1. 优先级（P0 > P1 > P2 > P3 > P4）',
          '2. 象限（Q1 > Q2 > Q3 > Q4）',
          '3. 手动顺序号（task_order，越小越靠前）',
          '4. 创建时间（新任务优先）',
          '5. 任务ID（字母顺序）'
        ]
      }
    }
  });
});

module.exports = router;
