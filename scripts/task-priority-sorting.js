/**
 * 任务优先级和排序规则
 */

/**
 * 优先级规范（统一使用 Px 格式）
 *
 * 优先级等级（从高到低）：
 * - P0: 紧急/关键任务，立即执行
 * - P1: 高优先级，尽快完成
 * - P2: 中等优先级，正常执行
 * - P3: 低优先级，有空闲时处理
 * - P4: 可选/长期任务，不紧急
 *
 * 旧格式映射：
 * - high → P1（高优先级）
 * - medium → P2（中等优先级）
 * - low → P3（低优先级）
 *
 * 象限优先级（从高到低）：
 * - Q1: 重要且紧急（第一象限）
 * - Q2: 重要但不紧急（第二象限）
 * - Q3: 紧急但不重要（第三象限）
 * - Q4: 不重要且不紧急（第四象限）
 */

/**
 * 优先级数值映射
 */
const PRIORITY_MAP = {
  'P0': 0,
  'P1': 1,
  'P2': 2,
  'P3': 3,
  'P4': 4,
  // 旧格式兼容
  'critical': 0,
  'high': 1,
  'medium': 2,
  'low': 3
};

/**
 * 象限数值映射
 */
const QUADRANT_MAP = {
  'Q1': 0,
  'Q2': 1,
  'Q3': 2,
  'Q4': 3
};

/**
 * 标准化优先级
 * 将旧格式（high/medium/low）转换为新格式（P1/P2/P3）
 */
function normalizePriority(priority) {
  if (!priority) return 'P2'; // 默认中等优先级

  if (priority.startsWith('P') && !isNaN(parseInt(priority[1]))) {
    // 已经是 P 格式
    return priority;
  }

  // 旧格式转换
  const oldFormats = {
    'critical': 'P0',
    'high': 'P1',
    'medium': 'P2',
    'low': 'P3'
  };

  return oldFormats[priority.toLowerCase()] || 'P2';
}

/**
 * 标准化象限
 */
function normalizeQuadrant(quadrant) {
  if (!quadrant) return 'Q1';

  if (quadrant.startsWith('Q') && quadrant.length >= 2) {
    const q = quadrant.toUpperCase().substring(0, 2);
    if (['Q1', 'Q2', 'Q3', 'Q4'].includes(q)) {
      return q;
    }
  }

  // 数字转换
  const num = parseInt(quadrant);
  if (num >= 1 && num <= 4) {
    return `Q${num}`;
  }

  return 'Q1';
}

/**
 * 排序规则（严格按顺序执行）
 *
 * 排序顺序：
 * 1. 优先级（P0 > P1 > P2 > P3 > P4）
 * 2. 象限（Q1 > Q2 > Q3 > Q4）
 * 3. 任务顺序号（task_order，用于手动调整，数值越小越靠前）
 * 4. 创建时间（新任务优先）
 * 5. 任务ID（字母顺序，确保稳定性）
 */
function sortTasks(tasks) {
  if (!tasks || !Array.isArray(tasks)) return [];

  return tasks.sort((a, b) => {
    // 优先级排序
    const priorityA = PRIORITY_MAP[normalizePriority(a.priority)] || 2;
    const priorityB = PRIORITY_MAP[normalizePriority(b.priority)] || 2;

    if (priorityA !== priorityB) {
      return priorityA - priorityB; // 优先级数值越小越靠前
    }

    // 象限排序
    const quadrantA = QUADRANT_MAP[normalizeQuadrant(a.quadrant)] || 0;
    const quadrantB = QUADRANT_MAP[normalizeQuadrant(b.quadrant)] || 0;

    if (quadrantA !== quadrantB) {
      return quadrantA - quadrantB; // 象限数值越小越靠前
    }

    // 手动顺序号（如果设置）
    const orderA = a.task_order || 9999;
    const orderB = b.task_order || 9999;

    if (orderA !== orderB) {
      return orderA - orderB; // 顺序号越小越靠前
    }

    // 创建时间（新任务优先）
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

    if (timeA !== timeB) {
      return timeB - timeA; // 新任务优先
    }

    // 任务ID（确保稳定性）
    return a.id.localeCompare(b.id);
  });
}

/**
 * 手动调整任务顺序
 *
 * @param {string[]} taskIds - 按顺序的任务ID数组
 * @returns {object} 操作结果
 */
function setTaskOrder(taskIds) {
  const fs = require('fs');
  const path = require('path');

  const TASKS_FILE = path.join(__dirname, '../../data/tasks.json');
  const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));

  let updatedCount = 0;
  taskIds.forEach((taskId, index) => {
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      tasks[taskIndex].task_order = index;
      tasks[taskIndex].task_order_updated_at = new Date().toISOString();
      updatedCount++;
    }
  });

  if (updatedCount > 0) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
  }

  return {
    success: true,
    updatedCount,
    message: `已更新 ${updatedCount} 个任务的顺序`
  };
}

/**
 * 重置手动顺序（恢复自动排序）
 */
function resetTaskOrder(taskId = null) {
  const fs = require('fs');
  const path = require('path');

  const TASKS_FILE = path.join(__dirname, '../../data/tasks.json');
  const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));

  let resetCount = 0;

  if (taskId) {
    // 重置单个任务
    const index = tasks.findIndex(t => t.id === taskId);
    if (index !== -1 && tasks[index].task_order !== undefined) {
      delete tasks[index].task_order;
      delete tasks[index].task_order_updated_at;
      resetCount = 1;
    }
  } else {
    // 重置所有任务
    tasks.forEach(task => {
      if (task.task_order !== undefined) {
        delete task.task_order;
        delete task.task_order_updated_at;
        resetCount++;
      }
    });
  }

  if (resetCount > 0) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
  }

  return {
    success: true,
    resetCount,
    message: `已重置 ${resetCount} 个任务的顺序`
  };
}

/**
 * 自动推断任务优先级
 *
 * 根据任务标题和描述智能推断优先级
 */
function inferPriority(title, description = '') {
  const text = (title + ' ' + description).toLowerCase();

  // P0 关键词
  const criticalKeywords = ['紧急', '严重', '关键', '崩溃', '故障', '修复', 'bug', 'crash', 'security', 'critical'];
  for (const keyword of criticalKeywords) {
    if (text.includes(keyword)) return 'P0';
  }

  // P1 关键词
  const highKeywords = ['优化', '升级', '实现', '完成', '重要', '优先', 'feature', 'implement'];
  for (const keyword of highKeywords) {
    if (text.includes(keyword)) return 'P1';
  }

  // P2 默认
  return 'P2';
}

module.exports = {
  PRIORITY_MAP,
  QUADRANT_MAP,
  normalizePriority,
  normalizeQuadrant,
  sortTasks,
  setTaskOrder,
  resetTaskOrder,
  inferPriority
};
