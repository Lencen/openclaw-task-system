/**
 * 任务状态流转服务 - 实现 Reflection 自动化流程
 * 
 * 实现状态流转：
 * pending → assigned → doing → completed → reflection_pending → done
 *                              ↓
 *                            failed
 * 
 * @version 1.0.0
 * @created 2026-04-06
 */

const { db } = require('../database/db');

class TaskStateTransition {
  /**
   * 当任务状态变为 completed 时，自动流转到 reflection_pending
   */
  static async onTaskCompleted(taskId) {
    console.log(`[TaskStateTransition] 任务 ${taskId} 状态变为 completed，触发 reflection_pending 转流`);
    
    try {
      // 检查任务是否存在
      const task = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!task) {
        console.error(`[TaskStateTransition] 任务 ${taskId} 不存在`);
        return { success: false, error: '任务不存在' };
      }

      // 检查当前状态是否为 completed
      if (task.status !== 'completed') {
        console.warn(`[TaskStateTransition] 任务 ${taskId} 状态不是 completed，当前为 ${task.status}`);
        return { success: false, error: '任务状态不是 completed' };
      }

      // 检查是否已有 reflection 记录
      const existingReflection = await db.get(
        'SELECT id FROM task_reflections WHERE task_id = ?',
        [taskId]
      );

      if (!existingReflection) {
        // 创建新的 reflection 记录
        const reflectionId = db.generateId('ref');
        const now = new Date().toISOString();
        
        await db.run(
          `INSERT INTO task_reflections (
            id, task_id, status, template, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            reflectionId,
            taskId,
            'pending',
            JSON.stringify({}), // 空模板，后续会填充
            now,
            now
          ]
        );
        
        console.log(`[TaskStateTransition] 为任务 ${taskId} 创建了新的 reflection 记录: ${reflectionId}`);
      } else {
        // 更新现有的 reflection 状态
        await db.run(
          `UPDATE task_reflections 
           SET status = ?, updated_at = ? 
           WHERE task_id = ?`,
          ['pending', new Date().toISOString(), taskId]
        );
        
        console.log(`[TaskStateTransition] 更新任务 ${taskId} 的 reflection 状态为 pending`);
      }

      // 更新任务的 reflection_status
      await db.run(
        'UPDATE tasks SET reflection_status = ? WHERE id = ?',
        ['pending', taskId]
      );

      console.log(`[TaskStateTransition] ✅ 任务 ${taskId} 已流转至 reflection_pending 状态`);
      
      return {
        success: true,
        taskId,
        from: task.status,
        to: 'reflection_pending',
        reflectionStatus: 'pending'
      };
    } catch (error) {
      console.error(`[TaskStateTransition] 任务 ${taskId} 状态流转失败:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 当 reflection 完成时，将任务状态流转到 done
   */
  static async onReflectionCompleted(taskId) {
    console.log(`[TaskStateTransition] 任务 ${taskId} 的 reflection 完成，触发到 done 的流转`);
    
    try {
      // 检查任务是否存在
      const task = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!task) {
        console.error(`[TaskStateTransition] 任务 ${taskId} 不存在`);
        return { success: false, error: '任务不存在' };
      }

      // 检查 reflection 状态
      const reflection = await db.get(
        'SELECT * FROM task_reflections WHERE task_id = ? ORDER BY created_at DESC LIMIT 1',
        [taskId]
      );

      if (!reflection) {
        console.error(`[TaskStateTransition] 任务 ${taskId} 没有 reflection 记录`);
        return { success: false, error: '没有 reflection 记录' };
      }

      if (reflection.status !== 'completed') {
        console.warn(`[TaskStateTransition] 任务 ${taskId} 的 reflection 状态不是 completed，当前为 ${reflection.status}`);
        return { success: false, error: 'reflection 状态不是 completed' };
      }

      // 更新任务状态为 done
      const now = new Date().toISOString();
      await db.run(
        `UPDATE tasks 
         SET status = ?, completed_at = ?, last_status_change_at = ?, status_change_reason = ?
         WHERE id = ?`,
        ['done', now, now, 'reflection_completed', taskId]
      );

      // 更新任务的 reflection_status
      await db.run(
        'UPDATE tasks SET reflection_status = ? WHERE id = ?',
        ['completed', taskId]
      );

      console.log(`[TaskStateTransition] ✅ 任务 ${taskId} 已流转至 done 状态`);
      
      return {
        success: true,
        taskId,
        from: task.status,
        to: 'done',
        reflectionStatus: 'completed'
      };
    } catch (error) {
      console.error(`[TaskStateTransition] 任务 ${taskId} 完成状态流转失败:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 当 reflection 被跳过时，将任务状态流转到 done
   */
  static async onReflectionSkipped(taskId, reason = 'reflection_skipped') {
    console.log(`[TaskStateTransition] 任务 ${taskId} 的 reflection 被跳过，触发到 done 的流转`);
    
    try {
      // 检查任务是否存在
      const task = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!task) {
        console.error(`[TaskStateTransition] 任务 ${taskId} 不存在`);
        return { success: false, error: '任务不存在' };
      }

      // 更新任务状态为 done
      const now = new Date().toISOString();
      await db.run(
        `UPDATE tasks 
         SET status = ?, completed_at = ?, last_status_change_at = ?, status_change_reason = ?
         WHERE id = ?`,
        ['done', now, now, reason, taskId]
      );

      // 更新任务的 reflection_status
      await db.run(
        'UPDATE tasks SET reflection_status = ? WHERE id = ?',
        ['skipped', taskId]
      );

      // 如果没有 reflection 记录，创建一个表示跳过的记录
      const existingReflection = await db.get(
        'SELECT id FROM task_reflections WHERE task_id = ?',
        [taskId]
      );

      if (!existingReflection) {
        const reflectionId = db.generateId('ref');
        await db.run(
          `INSERT INTO task_reflections (
            id, task_id, status, template, skipped_reason, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            reflectionId,
            taskId,
            'skipped',
            JSON.stringify({}),
            reason,
            now,
            now
          ]
        );
      } else {
        // 更新现有的 reflection 状态为 skipped
        await db.run(
          `UPDATE task_reflections 
           SET status = ?, skipped_reason = ?, updated_at = ? 
           WHERE task_id = ?`,
          ['skipped', reason, now, taskId]
        );
      }

      console.log(`[TaskStateTransition] ✅ 任务 ${taskId} 已流转至 done 状态（reflection 跳过）`);
      
      return {
        success: true,
        taskId,
        from: task.status,
        to: 'done',
        reflectionStatus: 'skipped'
      };
    } catch (error) {
      console.error(`[TaskStateTransition] 任务 ${taskId} 跳过状态流转失败:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 检查任务是否满足进入 reflection_pending 的条件
   */
  static async canTransitionToReflectionPending(taskId) {
    try {
      const task = await db.get('SELECT status FROM tasks WHERE id = ?', [taskId]);
      if (!task) {
        return { canTransition: false, reason: '任务不存在' };
      }

      if (task.status !== 'completed') {
        return { canTransition: false, reason: `任务状态为 ${task.status}，不是 completed` };
      }

      return { canTransition: true, reason: '任务状态为 completed' };
    } catch (error) {
      return { canTransition: false, reason: error.message };
    }
  }

  /**
   * 检查任务是否满足进入 done 的条件
   */
  static async canTransitionToDone(taskId) {
    try {
      const task = await db.get('SELECT status, reflection_status FROM tasks WHERE id = ?', [taskId]);
      if (!task) {
        return { canTransition: false, reason: '任务不存在' };
      }

      if (task.status !== 'completed' && task.status !== 'reflection_pending') {
        return { canTransition: false, reason: `任务状态为 ${task.status}，不能直接进入 done` };
      }

      if (task.reflection_status !== 'completed' && task.reflection_status !== 'skipped') {
        return { canTransition: false, reason: `任务 reflection_status 为 ${task.reflection_status}，不是 completed 或 skipped` };
      }

      return { canTransition: true, reason: '任务满足进入 done 的条件' };
    } catch (error) {
      return { canTransition: false, reason: error.message };
    }
  }

  /**
   * 获取任务当前的完整状态信息
   */
  static async getTaskFullStatus(taskId) {
    try {
      const task = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!task) {
        return null;
      }

      const reflection = await db.get(
        'SELECT * FROM task_reflections WHERE task_id = ? ORDER BY created_at DESC LIMIT 1',
        [taskId]
      );

      return {
        taskId: task.id,
        taskStatus: task.status,
        reflectionStatus: task.reflection_status,
        reflection: reflection,
        canTransitionToDone: await this.canTransitionToDone(taskId),
        canTransitionToReflectionPending: await this.canTransitionToReflectionPending(taskId)
      };
    } catch (error) {
      console.error(`[TaskStateTransition] 获取任务 ${taskId} 完整状态失败:`, error.message);
      return null;
    }
  }
}

module.exports = TaskStateTransition;