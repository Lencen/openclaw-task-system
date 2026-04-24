/**
 * Enhanced Reflection Processor Service
 * 
 * 集成 Google Reflection 模式，处理任务完成后的反思流程
 * 当任务完成后自动触发反思分析，并根据质量自动应用到系统
 */

const db = require('../db');
const { generateShortId } = require('../db/uuid-generator');
const path = require('path');

// 引入 Reflection Engine 和 Applier
const ReflectionEngine = require('../../scripts/self-evolution/reflection-engine');
const ReflectionApplier = require('../../scripts/self-evolution/reflection-applier');

class EnhancedReflectionProcessor {
  /**
   * 处理已完成的任务，触发反思流程
   */
  static async processCompletedTask(taskId) {
    try {
      console.log(`\n[EnhancedReflectionProcessor] 开始处理任务 ${taskId} 的反思`);
      
      // 读取任务详情
      const task = db.tasks.get(taskId);
      if (!task) {
        console.error(`[EnhancedReflectionProcessor] 任务不存在: ${taskId}`);
        return false;
      }

      if (task.status !== 'done') {
        console.warn(`[EnhancedReflectionProcessor] 任务 ${taskId} 状态不是 'done': ${task.status}`);
        return false;
      }

      // 检查是否已经有反思记录
      const existingReflection = db.get(
        'SELECT id FROM task_reflections WHERE task_id = ?', 
        [taskId]
      );

      if (existingReflection) {
        console.log(`[EnhancedReflectionProcessor] 任务 ${taskId} 已存在反思记录，跳过`);
        return true;
      }

      // 创建反思记录
      const reflectionId = generateShortId('ref');
      const now = new Date().toISOString();
      
      db.run(
        `INSERT INTO task_reflections 
         (id, task_id, status, triggered_at, reflection_data) 
         VALUES (?, ?, 'processing', ?, ?)`,
        [
          reflectionId, 
          taskId, 
          now,
          JSON.stringify({
            task_title: task.title,
            task_description: task.description,
            task_status: task.status,
            completion_time: task.completed_at,
            completion_result: task.completed_result,
            execution_log: task.execution_log || [],
            breakdown: task.breakdown || {}
          })
        ]
      );

      console.log(`[EnhancedReflectionProcessor] ✅ 已创建反思记录: ${reflectionId} for task ${taskId}`);

      // 异步处理反思内容（使用 Google Reflection 模式）
      setTimeout(() => {
        this.performEnhancedReflectionAnalysis(reflectionId, task);
      }, 1000); // 延迟1秒处理，避免阻塞

      return true;
    } catch (error) {
      console.error(`[EnhancedReflectionProcessor] 处理任务反思失败:`, error);
      return false;
    }
  }

  /**
   * 执行增强的反思分析（集成 Google Reflection 模式）
   */
  static async performEnhancedReflectionAnalysis(reflectionId, task) {
    try {
      console.log(`\n[EnhancedReflectionProcessor] 开始执行增强反思分析: ${reflectionId}`);
      
      // 准备任务数据用于 Reflection Engine
      const reflectionTask = {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        created_at: task.created_at,
        completed_at: task.completed_at || new Date().toISOString(),
        assigned_agent: task.assigned_agent,
        execution_log: task.execution_log || [],
        errors: task.errors || [],
        steps: task.breakdown ? task.breakdown.steps || [] : [],
        result: task.completed_result || 'unknown',
        metrics: task.metrics || {}
      };

      // 使用 Reflection Engine 进行完整反思流程
      const reflection = await ReflectionEngine.reflect(reflectionTask, 3);
      
      if (!reflection) {
        console.log(`[EnhancedReflectionProcessor] Reflection Engine 返回 null，跳过应用`);
        
        // 更新反思记录为完成状态（但无应用）
        const now = new Date().toISOString();
        db.run(
          `UPDATE task_reflections 
           SET status = 'completed', 
               completed_at = ?, 
               reflection_data = ?,
               improvements = ?,
               quality_score = ?
           WHERE id = ?`,
          [
            now,
            JSON.stringify({ 
              ...JSON.parse(db.get('SELECT reflection_data FROM task_reflections WHERE id = ?', [reflectionId]).reflection_data),
              reflection_skipped: true,
              reason: 'Reflection Engine returned null (possibly duplicate or validation failed)'
            }),
            JSON.stringify([]),
            0, // 质量分数
            reflectionId
          ]
        );
        
        return true;
      }

      console.log(`[EnhancedReflectionProcessor] Reflection 生成成功`);
      console.log(`  ID: ${reflection.id}`);
      console.log(`  Score: ${reflection.score}/10`);
      console.log(`  Context: ${reflection.context.substring(0, 50)}...`);
      console.log(`  Lesson: ${reflection.lesson.substring(0, 50)}...`);

      // 检查反思质量（评分 >= 8 且不可再改进）
      let applied = false;
      let applied_to = null;
      
      if (reflection.score >= 8 && !reflection.improvable) {
        console.log(`[EnhancedReflectionProcessor] 反思质量合格 (Score: ${reflection.score}), 开始应用`);
        
        try {
          // 使用 Reflection Applier 应用反思
          const applyResult = await ReflectionApplier.applyWithNotification(
            reflection, 
            'auto' // 自动选择目标文件
          );
          
          if (applyResult.success) {
            applied = true;
            applied_to = applyResult.applied_to;
            console.log(`[EnhancedReflectionProcessor] 反思应用成功: ${reflection.id}`);
            console.log(`  应用到: ${applyResult.applied_to}`);
          } else {
            console.log(`[EnhancedReflectionProcessor] 反思应用失败: ${applyResult.reason || applyResult.error}`);
          }
        } catch (applyError) {
          console.error(`[EnhancedReflectionProcessor] 反思应用过程出错:`, applyError);
        }
      } else {
        console.log(`[EnhancedReflectionProcessor] 反思质量不足，跳过自动应用`);
        console.log(`  评分: ${reflection.score}/10 (需要 >= 8)`);
        console.log(`  可改进: ${reflection.improvable} (需要 false)`);
      }

      // 提取改进项
      const improvements = this.extractImprovementsFromReflection(reflection);

      // 更新反思记录
      const now = new Date().toISOString();
      
      db.run(
        `UPDATE task_reflections 
         SET status = 'completed', 
             completed_at = ?, 
             reflection_data = ?,
             improvements = ?,
             quality_score = ?,
             applied = ?,
             applied_to = ?
         WHERE id = ?`,
        [
          now,
          JSON.stringify({
            ...JSON.parse(db.get('SELECT reflection_data FROM task_reflections WHERE id = ?', [reflectionId]).reflection_data),
            reflection_id: reflection.id,
            context: reflection.context,
            reflection_content: reflection.reflection,
            lesson: reflection.lesson,
            score: reflection.score,
            round: reflection.round,
            applied: reflection.applied,
            applied_at: reflection.applied_at
          }),
          JSON.stringify(improvements),
          reflection.score,
          applied,
          applied_to,
          reflectionId
        ]
      );

      console.log(`[EnhancedReflectionProcessor] ✅ 反思分析完成: ${reflectionId}`);
      console.log(`  应用状态: ${applied ? '成功' : '跳过'}`);
      console.log(`  改进项数: ${improvements.length}`);

      // 如果有改进项，触发演化流程
      if (improvements && improvements.length > 0) {
        await this.triggerEvolutionIfNeeded(reflectionId, improvements);
      }

      return true;
    } catch (error) {
      console.error(`[EnhancedReflectionProcessor] 增强反思分析失败:`, error);

      // 更新为失败状态
      try {
        db.run(
          `UPDATE task_reflections SET status = 'failed' WHERE id = ?`,
          [reflectionId]
        );
      } catch (updateError) {
        console.error(`[EnhancedReflectionProcessor] 更新失败状态失败:`, updateError);
      }

      return false;
    }
  }

  /**
   * 从反思中提取改进项
   */
  static extractImprovementsFromReflection(reflection) {
    const improvements = [];
    
    // 从反思的教训中提取改进项
    if (reflection.lesson) {
      improvements.push({
        type: 'process_improvement',
        description: reflection.lesson,
        priority: reflection.score >= 8 ? 'high' : 'medium',
        source: 'reflection_lesson'
      });
    }

    // 从反思内容中提取其他改进点
    if (reflection.reflection) {
      // 简单提取包含"应该"、"需要"、"必须"等关键词的句子
      const sentences = reflection.reflection.split(/[。！？.!?]/);
      for (const sentence of sentences) {
        if (sentence.includes('应该') || sentence.includes('需要') || 
            sentence.includes('必须') || sentence.includes('要') || 
            sentence.includes('建议')) {
          improvements.push({
            type: 'suggestion',
            description: sentence.trim(),
            priority: 'medium',
            source: 'reflection_content'
          });
        }
      }
    }

    return improvements;
  }

  /**
   * 触发演化流程（如果有改进项）
   */
  static async triggerEvolutionIfNeeded(reflectionId, improvements) {
    try {
      if (improvements.length > 0) {
        console.log(`[EnhancedReflectionProcessor] 触发演化流程，发现 ${improvements.length} 个改进项`);
        
        // 更新反思记录，标记需要演化
        db.run(
          `UPDATE task_reflections SET evolution_trigger = ? WHERE id = ?`,
          [JSON.stringify({ 
            triggered: true, 
            improvement_count: improvements.length,
            trigger_time: new Date().toISOString()
          }), reflectionId]
        );

        // 这里可以触发进一步的演化流程
        // 例如：创建改进任务、更新系统配置等
        console.log(`[EnhancedReflectionProcessor] 演化流程已触发，改进项将被处理`);
      }
    } catch (error) {
      console.error(`[EnhancedReflectionProcessor] 触发演化流程失败:`, error);
    }
  }

  /**
   * 获取任务的反思状态
   */
  static getTaskReflectionStatus(taskId) {
    try {
      const reflection = db.get(
        'SELECT * FROM task_reflections WHERE task_id = ? ORDER BY triggered_at DESC LIMIT 1',
        [taskId]
      );
      
      return reflection || null;
    } catch (error) {
      console.error(`[EnhancedReflectionProcessor] 获取反思状态失败:`, error);
      return null;
    }
  }

  /**
   * 获取所有待处理的反思
   */
  static getPendingReflections() {
    try {
      return db.all('SELECT * FROM task_reflections WHERE status = ? OR status = ?', ['pending', 'processing']);
    } catch (error) {
      console.error(`[EnhancedReflectionProcessor] 获取待处理反思失败:`, error);
      return [];
    }
  }

  /**
   * 获取反思统计信息
   */
  static getReflectionStats() {
    try {
      const stats = db.get(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN applied = 1 THEN 1 ELSE 0 END) as applied,
          AVG(quality_score) as avg_quality_score,
          SUM(CASE WHEN evolution_trigger IS NOT NULL THEN 1 ELSE 0 END) as with_evolution
        FROM task_reflections
      `);

      return stats;
    } catch (error) {
      console.error(`[EnhancedReflectionProcessor] 获取反思统计失败:`, error);
      return {
        total: 0,
        completed: 0,
        processing: 0,
        failed: 0,
        applied: 0,
        avg_quality_score: 0,
        with_evolution: 0
      };
    }
  }

  /**
   * 重试失败的反思
   */
  static async retryFailedReflection(reflectionId) {
    try {
      const reflection = db.get('SELECT * FROM task_reflections WHERE id = ? AND status = ?', [reflectionId, 'failed']);
      
      if (!reflection) {
        console.error(`[EnhancedReflectionProcessor] 未找到失败的反思记录或状态不为失败: ${reflectionId}`);
        return false;
      }

      // 重置状态为 pending，以便重新处理
      db.run('UPDATE task_reflections SET status = ?, completed_at = NULL WHERE id = ?', ['pending', reflectionId]);

      // 重新触发处理
      setTimeout(async () => {
        const task = db.tasks.get(reflection.task_id);
        if (task) {
          await this.performEnhancedReflectionAnalysis(reflectionId, task);
        }
      }, 1000);

      console.log(`[EnhancedReflectionProcessor] 反思重试已启动: ${reflectionId}`);
      return true;
    } catch (error) {
      console.error(`[EnhancedReflectionProcessor] 重试反思失败:`, error);
      return false;
    }
  }
}

module.exports = EnhancedReflectionProcessor;