/**
 * 任务反思集成层 - 连接所有反思相关组件
 * 
 * 功能：
 * 1. 统一管理任务完成时的反思流程
 * 2. 协调状态流转和反思执行
 * 3. 提供统一的API接口
 * 
 * @version 1.0.0
 * @created 2026-04-06
 */

const path = require('path');
const { db } = require('../database/db');
const TaskStateTransition = require('../services/task-state-transition');
const { reflect } = require('../../scripts/self-evolution/reflection-engine');
const { applyWithNotification } = require('../../scripts/self-evolution/reflection-applier');

class TaskReflectionIntegration {
  /**
   * 处理任务完成事件 - 主入口函数
   * @param {string} taskId - 任务ID
   * @returns {Object} 处理结果
   */
  static async handleTaskCompletion(taskId) {
    console.log(`\n[TaskReflectionIntegration] 处理任务完成事件: ${taskId}`);
    
    try {
      // 1. 验证任务状态
      const validationResult = await this.validateTaskForCompletion(taskId);
      if (!validationResult.isValid) {
        console.error(`[TaskReflectionIntegration] 任务验证失败:`, validationResult.reason);
        return {
          success: false,
          error: validationResult.reason,
          step: 'validation'
        };
      }
      
      // 2. 将任务流转到 reflection_pending 状态
      const transitionResult = await TaskStateTransition.onTaskCompleted(taskId);
      if (!transitionResult.success) {
        console.error(`[TaskReflectionIntegration] 任务状态流转失败:`, transitionResult.error);
        return {
          success: false,
          error: transitionResult.error,
          step: 'state-transition'
        };
      }
      
      // 3. 获取完整任务信息用于反思
      const fullTask = await this.getFullTask(taskId);
      if (!fullTask) {
        return {
          success: false,
          error: '无法获取完整任务信息',
          step: 'task-data'
        };
      }
      
      // 4. 执行反思流程
      const reflectionResult = await this.executeReflection(fullTask);
      if (!reflectionResult.success) {
        // 检查是否是"重复反思"导致的空结果
        if (reflectionResult.error === '反思引擎未生成有效反思') {
          console.log(`[TaskReflectionIntegration] 检测到重复反思，标记为已完成（无需创建重复内容）`);
          // 重复反思视为已完成，因为已有类似反思存在
          await this.markReflectionAsCompleted(taskId, { status: 'completed', error: '已存在相似反思，跳过创建' });
        } else {
          console.warn(`[TaskReflectionIntegration] 反思执行失败，但仍标记为完成:`, reflectionResult.error);
          // 真正失败时也标记为 completed 以便任务可以进入 done 状态
          await this.markReflectionAsCompleted(taskId, { status: 'completed', error: reflectionResult.error });
        }
      } else {
        // 反思成功，应用反思结果
        await this.applyReflectionResult(reflectionResult.reflection);
        // 标记反思已完成
        await this.markReflectionAsCompleted(taskId, { status: 'completed' });
      }
      
      // 5. 将任务流转到 done 状态
      const finalTransitionResult = await TaskStateTransition.onReflectionCompleted(taskId);
      if (!finalTransitionResult.success) {
        console.error(`[TaskReflectionIntegration] 最终状态流转失败:`, finalTransitionResult.error);
        return {
          success: false,
          error: finalTransitionResult.error,
          step: 'final-transition'
        };
      }
      
      console.log(`[TaskReflectionIntegration] ✅ 任务完成处理成功: ${taskId}`);
      return {
        success: true,
        taskId,
        step: 'complete',
        reflectionResult: reflectionResult.success ? reflectionResult.reflection : null
      };
      
    } catch (error) {
      console.error(`[TaskReflectionIntegration] 处理任务完成事件失败:`, error);
      return {
        success: false,
        error: error.message,
        step: 'exception'
      };
    }
  }
  
  /**
   * 验证任务是否可以进入完成流程
   */
  static async validateTaskForCompletion(taskId) {
    try {
      const task = await db.get('SELECT id, status FROM tasks WHERE id = ?', [taskId]);
      if (!task) {
        return {
          isValid: false,
          reason: '任务不存在'
        };
      }
      
      if (task.status !== 'completed') {
        return {
          isValid: false,
          reason: `任务状态为 ${task.status}，不是 completed`
        };
      }
      
      return {
        isValid: true,
        reason: '任务状态有效'
      };
    } catch (error) {
      return {
        isValid: false,
        reason: error.message
      };
    }
  }
  
  /**
   * 获取完整任务信息
   */
  static async getFullTask(taskId) {
    try {
      const task = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!task) {
        return null;
      }
      
      // 解析JSON字段
      function parseJsonField(value, defaultValue = null) {
        if (value === null || value === undefined) {
          return defaultValue;
        }
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return defaultValue;
          }
        }
        return value;
      }
      
      return {
        ...task,
        analysis: parseJsonField(task.analysis, {}),
        breakdown: parseJsonField(task.breakdown, []),
        execution_log: parseJsonField(task.execution_log, []),
        completed_steps: parseJsonField(task.completed_steps, []),
        issues: parseJsonField(task.issues, []),
        related_docs: parseJsonField(task.related_docs, []),
        test_acceptance: parseJsonField(task.test_acceptance, {}),
        process_validation: parseJsonField(task.process_validation, {}),
        quality_acceptance: parseJsonField(task.quality_acceptance, {}),
        reflection: parseJsonField(task.reflection, {}),
        audit_monitor: parseJsonField(task.audit_monitor, {}),
        tags: parseJsonField(task.tags, [])
      };
    } catch (error) {
      console.error(`[TaskReflectionIntegration] 获取完整任务信息失败:`, error);
      return null;
    }
  }
  
  /**
   * 执行反思流程
   */
  static async executeReflection(task) {
    try {
      console.log(`[TaskReflectionIntegration] 开始执行任务反思: ${task.id}`);
      
      const reflection = await reflect(task, 3);
      
      if (!reflection) {
        console.log(`[TaskReflectionIntegration] 反思引擎返回空结果`);
        return {
          success: false,
          error: '反思引擎未生成有效反思',
          reflection: null
        };
      }
      
      console.log(`[TaskReflectionIntegration] 反思生成成功: ${reflection.id}, Score: ${reflection.score}`);
      
      return {
        success: true,
        reflection
      };
    } catch (error) {
      console.error(`[TaskReflectionIntegration] 执行反思失败:`, error);
      return {
        success: false,
        error: error.message,
        reflection: null
      };
    }
  }
  
  /**
   * 应用反思结果
   */
  static async applyReflectionResult(reflection) {
    if (!reflection) {
      console.log(`[TaskReflectionIntegration] 无反思结果需要应用`);
      return { success: false, reason: 'no reflection' };
    }
    
    try {
      console.log(`[TaskReflectionIntegration] 应用反思结果: ${reflection.id}`);
      
      const applyResult = await applyWithNotification(reflection, 'auto');
      
      console.log(`[TaskReflectionIntegration] 反思应用结果:`, applyResult);
      
      return applyResult;
    } catch (error) {
      console.error(`[TaskReflectionIntegration] 应用反思结果失败:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 标记反思为完成状态
   */
  static async markReflectionAsCompleted(taskId, result) {
    try {
      const now = new Date().toISOString();
      
      // 检查是否已存在 reflection 记录
      const existingReflection = await db.get(
        'SELECT id FROM task_reflections WHERE task_id = ?',
        [taskId]
      );
      
      if (existingReflection) {
        // 更新现有记录
        await db.run(
          `UPDATE task_reflections 
           SET status = ?, updated_at = ?, error_message = ?
           WHERE task_id = ?`,
          [result.status || 'completed', now, result.error || null, taskId]
        );
      } else {
        // 创建新记录
        const reflectionId = db.generateId('ref');
        await db.run(
          `INSERT INTO task_reflections (
            id, task_id, status, template, error_message, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            reflectionId,
            taskId,
            result.status || 'completed',
            JSON.stringify({}),
            result.error || null,
            now,
            now
          ]
        );
      }
      
      // 更新任务的 reflection_status
      await db.run(
        'UPDATE tasks SET reflection_status = ? WHERE id = ?',
        [result.status || 'completed', taskId]
      );
      
      console.log(`[TaskReflectionIntegration] 反思状态已更新: ${taskId}, Status: ${result.status || 'completed'}`);
    } catch (error) {
      console.error(`[TaskReflectionIntegration] 更新反思状态失败:`, error);
    }
  }
  
  /**
   * 跳过反思流程（特殊情况）
   */
  static async skipReflection(taskId, reason = 'manual_skip') {
    console.log(`[TaskReflectionIntegration] 跳过反思流程: ${taskId}, Reason: ${reason}`);
    
    try {
      // 将任务流转到 done 状态（跳过反思）
      const result = await TaskStateTransition.onReflectionSkipped(taskId, reason);
      
      return result;
    } catch (error) {
      console.error(`[TaskReflectionIntegration] 跳过反思失败:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 获取任务反思状态
   */
  static async getTaskReflectionStatus(taskId) {
    try {
      const fullStatus = await TaskStateTransition.getTaskFullStatus(taskId);
      return fullStatus;
    } catch (error) {
      console.error(`[TaskReflectionIntegration] 获取任务反思状态失败:`, error);
      return null;
    }
  }
  
  /**
   * 手动触发反思（用于调试）
   */
  static async manualTriggerReflection(taskId) {
    console.log(`[TaskReflectionIntegration] 手动触发反思: ${taskId}`);
    
    try {
      const fullTask = await this.getFullTask(taskId);
      if (!fullTask) {
        return {
          success: false,
          error: '无法获取任务信息'
        };
      }
      
      const result = await this.executeReflection(fullTask);
      
      if (result.success) {
        await this.applyReflectionResult(result.reflection);
        await this.markReflectionAsCompleted(taskId, { status: 'completed' });
      }
      
      return result;
    } catch (error) {
      console.error(`[TaskReflectionIntegration] 手动触发反思失败:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = TaskReflectionIntegration;