/**
 * Task Status API
 * 
 * 处理任务状态变更，包括新增的 assigned 和 failed 状态
 * 
 * 状态流转设计（v6.2）:
 * pending → assigned → doing → done
 *                  └──────→ failed
 * 
 * 状态转换验证
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const pendingSpawnsDAL = require('../db/pending-spawns-dal');
const ReflectionProcessor = require('../services/reflection-processor');

/**
 * 触发任务反思（reflection）
 * 当任务完成后自动调用
 */
function triggerReflection(taskId) {
  try {
    console.log(`[Reflection] 准备为任务 ${taskId} 触发反思流程`);
    
    // 使用反射处理器来处理任务完成后的反思
    ReflectionProcessor.processCompletedTask(taskId)
      .then(success => {
        if (success) {
          console.log(`[Reflection] ✅ 任务 ${taskId} 反思流程已启动`);
        } else {
          console.error(`[Reflection] ❌ 任务 ${taskId} 反思流程启动失败`);
        }
      })
      .catch(error => {
        console.error(`[Reflection] ❌ 任务 ${taskId} 反思流程异常:`, error);
      });
  } catch (error) {
    console.error(`[Reflection] 触发反思失败: ${error.message}`);
  }
}

// 全局更新任务状态函数，供完成 API 使用
router.updateTaskStatus = async function(taskId, status, reason = '') {
  try {
    const task = db.tasks.get(taskId);
    if (!task) {
      console.warn(`[task-status-api] 任务不存在: ${taskId}`);
      return false;
    }
    
    const updates = {
      status,
      last_status_change_at: new Date().toISOString()
    };
    
    if (reason) {
      updates.status_change_reason = reason;
    }
    
    if (status === TaskStatus.FAILED) {
      updates.failed_at = new Date().toISOString();
      updates.failed_reason = reason;
    } else if (status === TaskStatus.DONE) {
      updates.completed_at = new Date().toISOString();
    }
    
    db.tasks.update(taskId, updates);
    return true;
  } catch (error) {
    console.error(`[task-status-api] 更新任务状态失败: ${taskId}`, error);
    return false;
  }
};

/**
 * 状态常量定义
 */
const TaskStatus = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  DOING: 'doing',
  REFLECTION_PENDING: 'reflection_pending',  // 新增状态：等待反思
  DONE: 'done',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  DELETED: 'deleted'
};

/**
 * 有效的状态转换规则
 * key: 当前状态, value: 允许转换到的状态
 */
const validTransition = {
  [TaskStatus.PENDING]: [TaskStatus.ASSIGNED, TaskStatus.CANCELLED, TaskStatus.DELETED],
  [TaskStatus.ASSIGNED]: [TaskStatus.DOING, TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.DELETED],
  [TaskStatus.DOING]: [TaskStatus.REFLECTION_PENDING, TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.DELETED],
  [TaskStatus.REFLECTION_PENDING]: [TaskStatus.DONE, TaskStatus.FAILED],  // 反思完成后可以完成或失败
  [TaskStatus.DONE]: [],
  [TaskStatus.FAILED]: [TaskStatus.ASSIGNED, TaskStatus.CANCELLED, TaskStatus.DELETED],
  [TaskStatus.CANCELLED]: [],
  [TaskStatus.DELETED]: []
};

/**
 * 获取所有有效状态
 * GET /api/tasks/statuses
 */
router.get('/statuses', (req, res) => {
  res.json({
    success: true,
    data: {
      statuses: Object.values(TaskStatus),
      validTransitions: validTransition
    }
  });
});

/**
 * 获取状态转换错误码说明
 * GET /api/tasks/status-errors
 */
router.get('/status-errors', (req, res) => {
  res.json({
    success: true,
    data: {
      errorCodes: {
        'TASK_NOT_FOUND': { code: 404, message: '任务不存在' },
        'INVALID_STATUS': { code: 400, message: '无效的状态值' },
        'INVALID_TRANSITION': { code: 409, message: '不允许的状态转换' },
        'SYSTEM_ERROR': { code: 500, message: '系统错误' }
      },
      validTransitions: validTransition
    }
  });
});

/**
 * 检查状态转换是否有效
 * POST /api/tasks/validate-transition
 * {
 *   taskId: "task-xxx",
 *   fromStatus: "pending",
 *   toStatus: "assigned"
 * }
 */
router.post('/validate-transition', (req, res) => {
  const { taskId, fromStatus, toStatus } = req.body;
  
  if (!taskId || !fromStatus || !toStatus) {
    return res.status(400).json({
      success: false,
      error: {
        type: 'ValidationError',
        message: '缺少必填字段: taskId, fromStatus, toStatus'
      }
    });
  }
  
  const allowedTransitions = validTransition[fromStatus] || [];
  const isValid = allowedTransitions.includes(toStatus);
  
  res.json({
    success: true,
    data: {
      taskId,
      fromStatus,
      toStatus,
      isValid,
      allowedTransitions
    }
  });
});

/**
 * 批量更新任务状态
 * POST /api/tasks/batch-status
 * 
 * 请求体:
 * {
 *   "tasks": [
 *     { "id": "task-1", "status": "assigned", "reason": "..." },
 *     { "id": "task-2", "status": "doing", "reason": "..." }
 *   ]
 * }
 */
router.post('/batch-status', (req, res) => {
  // ========== 日志追踪: 记录调用来源 ==========
  const callSource = {
    ip: req.ip,
    userAgent: req.get('user-agent') || 'unknown',
    referer: req.get('referer') || 'direct',
    // 尝试从 header 提取调用者信息
    caller: req.get('X-Caller-Agent') || req.get('x-caller-agent') || 'unknown',
    // 尝试从 query 提取
    source: req.query.source || req.body.source || 'api',
    timestamp: new Date().toISOString()
  };
  
  console.log(`[STATUS-TRACKER] batch-status 被调用 | 来源: ${callSource.source} | Caller: ${callSource.caller} | IP: ${callSource.ip} | UA: ${callSource.userAgent?.substring(0, 50)}`);
  
  const { tasks } = req.body;
  
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        type: 'ValidationError',
        message: '缺少必填字段: tasks (数组)'
      }
    });
  }
  
  const results = [];
  let successCount = 0;
  let failCount = 0;
  
  for (const taskUpdate of tasks) {
    const { id: taskId, status, reason } = taskUpdate;
    
    try {
      // 读取当前任务
      const task = db.tasks.get(taskId);
      
      if (!task) {
        results.push({
          taskId,
          success: false,
          error: {
            type: 'NotFoundError',
            message: '任务不存在'
          }
        });
        failCount++;
        continue;
      }
      
      const previousStatus = task.status;
      
      // 检查状态转换是否有效
      const allowedTransitions = validTransition[previousStatus] || [];
      if (!allowedTransitions.includes(status)) {
        results.push({
          taskId,
          success: false,
          error: {
            type: 'InvalidTransition',
            message: `不允许从 '${previousStatus}' 转换到 '${status}'`,
            allowedTransitions
          }
        });
        failCount++;
        continue;
      }
      
      // 构建更新内容
      const updates = {
        status,
        last_status_change_at: new Date().toISOString(),
        // 记录状态变更来源（用于调试循环问题）
        _status_change_source: JSON.stringify({
          source: callSource.source,
          caller: callSource.caller,
          reason: reason,
          timestamp: new Date().toISOString(),
          stack: new Error().stack // 记录调用堆栈
        })
      };
      
      // 记录特定状态的时间戳
      if (status === TaskStatus.ASSIGNED) {
        updates.assigned_at = new Date().toISOString();
      }
      
      if (status === TaskStatus.FAILED) {
        updates.failed_at = new Date().toISOString();
        if (reason) {
          updates.failed_reason = reason;
        }
      }
      
      if (reason) {
        updates.status_change_reason = reason;
      }
      
      // ========== 日志追踪: 状态变更详细 ==========
      console.log(`[STATUS-TRACKER] 状态变更 | Task: ${taskId} | ${previousStatus} → ${status} | Reason: ${reason || '未指定'} | Source: ${callSource.source} | Caller: ${callSource.caller} | Trigger: ${callSource.referer}`);
      
      // 执行更新
      db.tasks.update(taskId, updates);
      
      // 读取更新后的任务
      const updatedTask = db.tasks.get(taskId);
      
      results.push({
        taskId,
        success: true,
        data: {
          id: updatedTask.id,
          status: updatedTask.status,
          previous_status: previousStatus
        }
      });
      successCount++;
    } catch (error) {
      console.error(`[task-status-api] 批量更新任务 ${taskUpdate.id} 状态失败:`, error);
      results.push({
        taskId: taskUpdate.id,
        success: false,
        error: {
          type: 'SystemError',
          message: error.message
        }
      });
      failCount++;
    }
  }
  
  res.json({
    success: true,
    data: {
      results,
      summary: {
        total: tasks.length,
        success: successCount,
        failed: failCount
      }
    }
  });
});

/**
 * 完成任务 - 但先进入反思待处理状态
 * POST /api/tasks/:id/complete
 * 
 * 请求体:
 * {
 *   "result": "任务完成结果",
 *   "sessionKey": "session-key-xxx"  // 用于验证
 * }
 */
router.post('/:id/complete', async (req, res) => {
  const { id: taskId } = req.params;
  const { result, sessionKey } = req.body;
  
  try {
    // 读取当前任务
    const task = db.tasks.get(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          type: 'NotFoundError',
          message: '任务不存在'
        }
      });
    }
    
    // 检查 sessionKey（如果提供了）
    if (sessionKey) {
      const isAlive = pendingSpawnsDAL.isSessionAlive(sessionKey);
      if (!isAlive) {
        return res.status(403).json({
          success: false,
          error: {
            type: 'SessionExpired',
            message: '会话已过期'
          }
        });
      }
    }
    
    const previousStatus = task.status;
    
    // 检查是否可以转换到 reflection_pending 状态
    const allowedTransitions = validTransition[previousStatus] || [];
    if (!allowedTransitions.includes(TaskStatus.REFLECTION_PENDING)) {
      return res.status(409).json({
        success: false,
        error: {
          type: 'InvalidTransition',
          message: `不允许从 '${previousStatus}' 转换到 '${TaskStatus.REFLECTION_PENDING}'`,
          allowedTransitions
        }
      });
    }
    
    // 更新任务状态为 reflection_pending
    const updates = {
      status: TaskStatus.REFLECTION_PENDING,
      last_status_change_at: new Date().toISOString()
    };
    
    if (result) {
      updates.completed_result = result;
      updates.status_change_reason = '任务完成，等待反思';
    }
    
    // 执行更新
    db.tasks.update(taskId, updates);
    
    // 触发反思（reflection）
    triggerReflection(taskId);
    
    // 读取更新后的任务
    const updatedTask = db.tasks.get(taskId);
    
    res.json({
      success: true,
      data: {
        id: updatedTask.id,
        status: updatedTask.status,
        previous_status: previousStatus,
        completed_result: updatedTask.completed_result || null,
        status_change_reason: updatedTask.status_change_reason || null,
        last_status_change_at: updatedTask.last_status_change_at
      }
    });
  } catch (error) {
    console.error('[task-status-api] 完成任务失败:', error);
    res.status(500).json({
      success: false,
      error: {
        type: 'SystemError',
        message: error.message
      }
    });
  }
});

/**
 * 获取任务的允许状态转换
 * GET /api/tasks/:id/valid-transitions
 */
router.get('/:id/valid-transitions', (req, res) => {
  const { id: taskId } = req.params;
  
  try {
    const task = db.tasks.get(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          type: 'NotFoundError',
          message: '任务不存在'
        }
      });
    }
    
    const currentStatus = task.status;
    const allowedTransitions = validTransition[currentStatus] || [];
    
    res.json({
      success: true,
      data: {
        currentStatus,
        allowedTransitions
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        type: 'SystemError',
        message: error.message
      }
    });
  }
});

/**
 * 重置任务到 pending 状态（完全回退）
 * POST /api/tasks/:id/reset
 * 
 * 重置内容（v2.0 增强版）：
 * - status -> pending
 * - assigned_agent -> null
 * - assigned_at -> null
 * - 清理 pending_assignments 表（所有 DAL）
 * - 清理 pending_spawns 表
 * - 清理 Redis 队列
 * - 清理文件兜底（pending-assignments.jsonl）
 * - 同步更新所有数据源
 */
router.post('/:id/reset', async (req, res) => {
  const { id: taskId } = req.params;

  // ========== 日志追踪: reset 端点调用 ==========
  const callSource = {
    ip: req.ip,
    userAgent: req.get('user-agent') || 'unknown',
    referer: req.get('referer') || 'direct',
    caller: req.get('X-Caller-Agent') || req.get('x-caller-agent') || 'unknown',
    source: req.query.source || 'api',
    timestamp: new Date().toISOString()
  };
  
  console.log(`[STATUS-TRACKER] reset 被调用 | Task: ${taskId} | Source: ${callSource.source} | Caller: ${callSource.caller} | IP: ${callSource.ip} | Stack: ${new Error().stack.split('\n').slice(2, 6).join(' → ')}`);

  try {
    // 1. 读取当前任务
    const task = db.tasks.get(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: { type: 'NotFoundError', message: '任务不存在' }
      });
    }

    const previousStatus = task.status;
    const previousAgent = task.assigned_agent;

    // ========== 2. 清理 pending_assignments 表（所有 DAL）==========
    try {
      // 2.1 清理主 DAL
      const pendingDal = require('../db/pending-assignments-dal');
      const existingRecords = pendingDal.getRecordsByTaskId(taskId);
      for (const record of existingRecords) {
        pendingDal.deleteRecord(record.id);
      }
      console.log(`[task-reset] 清理 pending_assignments (主 DAL): ${existingRecords.length} 条`);
    } catch (e) {
      console.warn(`[task-reset] 清理 pending_assignments 失败:`, e.message);
    }

    // ========== 2.2 清理文件兜底（pending-assignments.jsonl）==========
    try {
      const fs = require('fs');
      const jsonlPath = path.join(__dirname, '../data/pending-assignments.jsonl');
      if (fs.existsSync(jsonlPath)) {
        const content = fs.readFileSync(jsonlPath, 'utf8').trim();
        if (content) {
          const lines = content.split('\n').filter(line => {
            try {
              const record = JSON.parse(line);
              return record.taskId !== taskId;
            } catch {
              return true;
            }
          });
          fs.writeFileSync(jsonlPath, lines.join('\n') + (lines.length ? '\n' : ''));
          console.log(`[task-reset] 清理 pending-assignments.jsonl`);
        }
      }
    } catch (e) {
      console.warn(`[task-reset] 清理文件兜底失败:`, e.message);
    }

    // ========== 2.3 清理 pending_assignments-dal-v2（跨进程）==========
    try {
      const pendingDalV2 = require('../db/pending-assignments-dal-v2');
      if (pendingDalV2 && pendingDalV2.listRecords) {
        const records = pendingDalV2.listRecords().filter(r => r.taskId === taskId);
        for (const record of records) {
          pendingDalV2.deleteRecord(record.id);
        }
        console.log(`[task-reset] 清理 pending_assignments (v2): ${records.length} 条`);
      }
    } catch (e) {
      console.warn(`[task-reset] 清理 pending_assignments v2 失败:`, e.message);
    }

    // ========== 3. 清理 pending_spawns 表 ==========
    try {
      const pendingSpawnsDAL = require('../db/pending-spawns-dal');
      const spawns = pendingSpawnsDAL.getRecordsByTask(taskId);
      for (const spawn of spawns) {
        pendingSpawnsDAL.deleteRecord(spawn.id);
      }
      console.log(`[task-reset] 清理 pending_spawns: ${spawns.length} 条`);
    } catch (e) {
      console.warn(`[task-reset] 清理 pending_spawns 失败:`, e.message);
    }

    // ========== 4. 清理 Redis 队列 ==========
    try {
      const redis = require('../services/redis-service');
      if (redis && redis.TaskQueue) {
        // 获取所有队列中的任务并清理
        const queues = ['default', 'high', 'low', 'coder', 'fast', 'deep', 'office', 'test'];
        for (const queue of queues) {
          try {
            const removed = await redis.TaskQueue.remove(taskId, queue);
            if (removed) {
              console.log(`[task-reset] 从 Redis 队列移除任务: ${queue}`);
            }
          } catch (e) {
            // 忽略单个队列错误
          }
        }
      }
    } catch (e) {
      console.warn(`[task-reset] 清理 Redis 队列失败:`, e.message);
    }

    // ========== 5. 同步更新所有数据源 ==========
    const dataDbPath = path.join(__dirname, '../data/tasks.db');
    if (fs.existsSync(dataDbPath)) {
      try {
        const sqlite3 = require('sqlite3').verbose();
        const dataDb = new sqlite3.Database(dataDbPath);
        
        await new Promise((resolve, reject) => {
          dataDb.run(
            "UPDATE tasks SET status = 'pending', assigned_agent = NULL, assigned_at = NULL, last_status_change_at = ? WHERE id = ?",
            [new Date().toISOString(), taskId],
            function(err) {
              if (err) reject(err);
              else {
                console.log(`[task-reset] 同步更新 data/tasks.db: ${this.changes} 行`);
                resolve();
              }
            }
          );
        });
        dataDb.close();
      } catch (e) {
        console.warn(`[task-reset] 更新 data/tasks.db 失败:`, e.message);
      }
    }

    // ========== 6. 重置任务状态（主数据库）==========
    console.log(`[STATUS-TRACKER] 执行重置 | Task: ${taskId} | ${previousStatus} → PENDING | Caller: ${callSource.caller} | Stack: ${new Error().stack.split('\n').slice(2, 5).join(' → ')}`);
    
    const updates = {
      status: TaskStatus.PENDING,
      assigned_agent: null,
      assigned_at: null,
      last_status_change_at: new Date().toISOString(),
      status_change_reason: '重置任务',
      // 记录重置来源
      _reset_source: JSON.stringify({
        caller: callSource.caller,
        source: callSource.source,
        ip: callSource.ip,
        referer: callSource.referer,
        timestamp: new Date().toISOString(),
        stack: new Error().stack
      })
    };

    db.tasks.update(taskId, updates);

    // 5. 读取更新后的任务
    const updatedTask = db.tasks.get(taskId);

    res.json({
      success: true,
      data: {
        id: updatedTask.id,
        status: updatedTask.status,
        previous_status: previousStatus,
        previous_agent: previousAgent,
        message: '任务已重置到 pending 状态'
      }
    });

  } catch (error) {
    console.error('[task-status-api] 重置任务失败:', error);
    res.status(500).json({
      success: false,
      error: { type: 'SystemError', message: error.message }
    });
  }
});

module.exports = router;
