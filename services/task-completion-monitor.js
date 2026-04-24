/**
 * Task Completion Monitor v2.1 - 监控器（支持 reflection 流程）
 * 
 * 架构变更：
 * - 第1版：监控 + 更新状态
 * - 第2版：只负责监控和检测，状态更新交给状态更新器
 * - 第2.1版：增加 reflection_pending 状态监控
 * 
 * 新职责：
 * - 检查 session 是否活跃
 * - 检测超时任务
 * - 记录监控日志
 * - 检测异常任务
 * - 监控 reflection 完成情况
 * 
 * 不再负责：
 * - ❌ 更新任务状态（由 StatusUpdater 负责）
 * - ❌ 启动 Subagent（由 Executor 负责）
 */

const pendingSpawnsDAL = require('../src/db/pending-spawns-dal');
const db = require('../src/db');
const { StatusUpdater } = require('../src/services/status-updater');
const TaskModel = require('../src/models/task');

/**
 * 配置
 */
const CONFIG = {
  // 超时阈值（毫秒）- 20 分钟
  TIMEOUT_MS: 20 * 60 * 1000,
  // 扫描间隔（毫秒）- 每 5 分钟扫描一次
  SCAN_INTERVAL_MS: 5 * 60 * 1000
};

/**
 * 检查 session 是否活跃（只检查，不操作）
 * @param {string} sessionKey - 会话密钥
 */
function checkSessionAlive(sessionKey) {
  try {
    return pendingSpawnsDAL.isSessionAlive(sessionKey);
  } catch (err) {
    console.error('[task-completion-monitor] 检查会话失败:', sessionKey, err.message);
    return false;
  }
}

/**
 * 检测超时任务（只检测，不标记）
 * @param {number} timeoutMs - 超时阈值
 */
function detectTimedOutTasks(timeoutMs = CONFIG.TIMEOUT_MS) {
  try {
    const spawns = pendingSpawnsDAL.listRecords();
    const now = Date.now();
    
    return spawns.filter(spawn => {
      // 检查状态为 assigned 的记录是否超时
      if (spawn.status === 'assigned' && spawn.assigned_at) {
        const assignedTime = new Date(spawn.assigned_at).getTime();
        return (now - assignedTime) > timeoutMs;
      }
      
      // 检查状态为 doing 的记录是否超时
      if (spawn.status === 'doing' && spawn.started_at) {
        const startedTime = new Date(spawn.started_at).getTime();
        return (now - startedTime) > timeoutMs;
      }
      
      return false;
    });
  } catch (error) {
    console.error('[task-completion-monitor] 检测超时任务失败:', error);
    return [];
  }
}

/**
 * 检测需要进入 reflection 的任务（只检测，不操作）
 * 任务完成条件：
 * - status 为 'completed'
 * - reflection_status 为 'pending' 或 'in_progress'
 */
function detectTasksForReflection() {
  try {
    const allTasks = db.all('SELECT * FROM tasks WHERE status = ?', ['completed']);
    
    return allTasks.filter(task => {
      try {
        const reflectionStatus = task.reflection_status || 'not_required';
        return reflectionStatus === 'pending' || reflectionStatus === 'in_progress';
      } catch {
        return false;
      }
    });
  } catch (error) {
    console.error('[task-completion-monitor] 检测需要 reflection 的任务失败:', error);
    return [];
  }
}

/**
 * 检测超时的 reflection（只检测，不操作）
 * 如果 reflection_status 为 'in_progress' 超过阈值，认为超时
 */
function detectTimedOutReflections(timeoutMs = CONFIG.TIMEOUT_MS) {
  try {
    const allTasks = db.all(
      'SELECT * FROM tasks WHERE reflection_status IN (?, ?)',
      ['pending', 'in_progress']
    );
    
    const now = Date.now();
    return allTasks.filter(task => {
      try {
        const reflectionStatus = task.reflection_status || 'not_required';
        if (reflectionStatus !== 'in_progress') return false;
        
        // 检查是否有 started_at
        const taskDetail = TaskModel.getById(task.id);
        if (taskDetail && taskDetail.reflection && taskDetail.reflection.started_at) {
          const startedTime = new Date(taskDetail.reflection.started_at).getTime();
          return (now - startedTime) > timeoutMs;
        }
        
        return false;
      } catch {
        return false;
      }
    });
  } catch (error) {
    console.error('[task-completion-monitor] 检测超时 reflection 失败:', error);
    return [];
  }
}

/**
 * 检测异常任务（只检测，不操作）
 * 异常情况：
 * - pending_spawns 记录与 tasks 表状态不一致
 * - sessionKey 为 null 但状态异常
 * - reflection 状态异常
 */
function detectAbnormalTasks() {
  try {
    const spawns = pendingSpawnsDAL.listRecords();
    const abnormalTasks = [];
    
    for (const spawn of spawns) {
      // 检查 sessionKey 为 null 但状态为 doing 的记录
      if (spawn.status === 'doing' && (!spawn.sessionKey || spawn.sessionKey === 'null')) {
        abnormalTasks.push({
          type: 'NO_SESSION',
          spawn,
          message: '状态为 doing 但 sessionKey 为 null'
        });
      }
      
      // 检查状态为 pending 但有 sessionKey 的记录
      if (spawn.status === 'pending' && spawn.sessionKey) {
        abnormalTasks.push({
          type: 'STATUS_MISMATCH',
          spawn,
          message: `状态为 pending 但有 sessionKey: ${spawn.sessionKey}`
        });
      }
    }
    
    // 检查 reflection 状态异常
    const allTasks = db.all(
      'SELECT * FROM tasks WHERE reflection_status IN (?, ?, ?)',
      ['pending', 'in_progress', 'completed']
    );
    
    for (const task of allTasks) {
      try {
        const reflectionStatus = task.reflection_status || 'not_required';
        if (reflectionStatus === 'completed') {
          // 检查是否已在 task_reflections 表中有 completed 记录
          const reflection = db.get(
            'SELECT * FROM task_reflections WHERE task_id = ? AND status = ?',
            [task.id, 'completed']
          );
          if (!reflection) {
            abnormalTasks.push({
              type: 'REFLECTION_STATUS_MISMATCH',
              task,
              message: `reflection_status 为 completed 但 task_reflections 表中没有对应记录`
            });
          }
        }
      } catch {
        // 忽略单个任务的检查错误
      }
    }
    
    return abnormalTasks;
  } catch (error) {
    console.error('[task-completion-monitor] 检测异常任务失败:', error);
    return [];
  }
}

/**
 * 单独监听任务完成事件（不动状态表）
 * 由执行模块调用此函数报告任务完成
 */
function reportTaskCompleted(taskId, sessionId, durationMs) {
  console.log(`[task-completion-monitor] 任务完成报告: taskId=${taskId}, sessionId=${sessionId}, duration=${durationMs}ms`);
  
  // 记录到监控日志
  console.log(`[task-completion-monitor] ✅ 任务完成: ${taskId}`);
  
  return {
    reported: true,
    taskId,
    sessionId,
    durationMs
  };
}

/**
 * 单独监听任务失败事件（不动状态表）
 * 由执行模块调用此函数报告任务失败
 */
function reportTaskFailed(taskId, sessionId, error, failedReason) {
  console.log(`[task-completion-monitor] 任务失败报告: taskId=${taskId}, sessionId=${sessionId}, error=${error}`);
  
  // 记录到监控日志
  console.log(`[task-completion-monitor] ❌ 任务失败: ${taskId} - ${error}`);
  
  return {
    reported: true,
    taskId,
    sessionId,
    error,
    failedReason
  };
}

/**
 * 初始化状态更新器（用于报告状态更新，但不由监控器负责更新）
 */
function initStatusUpdater() {
  return new StatusUpdater({
    sessionId: 'monitor-status-updater',
    executorId: 'monitor'
  });
}

/**
 * 启动监控服务（只监控，不动数据）
 */
function start() {
  console.log('[task-completion-monitor] 启动监控服务 v2.0...');
  console.log('  只负责监控，不更新状态');
  
  // 立即执行一次
  const result = processMonitorCheck();
  
  // 设置定时扫描
  const intervalId = setInterval(() => {
    processMonitorCheck();
  }, CONFIG.SCAN_INTERVAL_MS);
  
  console.log(`[task-completion-monitor] 扫描间隔: ${CONFIG.SCAN_INTERVAL_MS / 1000} 秒`);
  
  return intervalId;
}

/**
 * 停止监控服务
 */
function stop(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
    console.log('[task-completion-monitor] 监控服务已停止');
  }
}

/**
 * 处理监控检查（只检查，不动数据）
 */
function processMonitorCheck() {
  console.log('[task-completion-monitor] 开始监控检查...');
  
  try {
    // 检测超时任务
    const timedOutTasks = detectTimedOutTasks(CONFIG.TIMEOUT_MS);
    
    console.log(`[task-completion-monitor] 检测到 ${timedOutTasks.length} 个超时任务`);
    
    for (const spawn of timedOutTasks) {
      console.log(`  ⚠️ 超时任务: spawn=${spawn.id}, taskId=${spawn.taskId}, status=${spawn.status}`);
    }
    
    // 检测需要进入 reflection 的任务
    const tasksForReflection = detectTasksForReflection();
    
    console.log(`[task-completion-monitor] 检测到 ${tasksForReflection.length} 个需要 reflection 的任务`);
    
    for (const task of tasksForReflection) {
      console.log(`  ℹ️ 任务 ${task.id} 需要 reflection (status: ${task.reflection_status})`);
    }
    
    // 检测超时的 reflection
    const timedOutReflections = detectTimedOutReflections(CONFIG.TIMEOUT_MS);
    
    console.log(`[task-completion-monitor] 检测到 ${timedOutReflections.length} 个超时的 reflection`);
    
    for (const task of timedOutReflections) {
      console.log(`  ⚠️ 超时 reflection: taskId=${task.id}, reflection_status=${task.reflection_status}`);
    }
    
    // 检测异常任务
    const abnormalTasks = detectAbnormalTasks();
    
    console.log(`[task-completion-monitor] 检测到 ${abnormalTasks.length} 个异常任务`);
    
    for (const task of abnormalTasks) {
      console.log(`  ⚠️ 异常任务: ${task.type} - ${task.message}`);
    }
    
    console.log(`[task-completion-monitor] 监控检查完成`);
    
    return {
      timedOutCount: timedOutTasks.length,
      tasksForReflectionCount: tasksForReflection.length,
      timedOutReflectionsCount: timedOutReflections.length,
      abnormalCount: abnormalTasks.length,
      timedOutTasks,
      tasksForReflection,
      timedOutReflections,
      abnormalTasks
    };
  } catch (error) {
    console.error('[task-completion-monitor] 监控检查失败:', error);
    return { error: error.message };
  }
}

/**
 * 获取监控状态
 */
function getMonitorStatus() {
  try {
    const spawns = pendingSpawnsDAL.listRecords();
    
    const status = {
      totalSpawns: spawns.length,
      doingCount: spawns.filter(s => s.status === 'doing').length,
      assignedCount: spawns.filter(s => s.status === 'assigned').length,
      pendingCount: spawns.filter(s => s.status === 'pending').length,
      failedCount: spawns.filter(s => s.status === 'failed').length
    };
    
    return status;
  } catch (error) {
    console.error('[task-completion-monitor] 获取监控状态失败:', error);
    return null;
  }
}

module.exports = {
  start,
  stop,
  processMonitorCheck,
  checkSessionAlive,
  detectTimedOutTasks,
  detectTimedOutReflections,
  detectTasksForReflection,
  detectAbnormalTasks,
  reportTaskCompleted,
  reportTaskFailed,
  initStatusUpdater,
  getMonitorStatus,
  CONFIG
};
