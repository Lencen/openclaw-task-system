/**
 * Enhanced Reflection Processor Service
 * 
 * 集成 Google Reflection 模式，处理任务完成后的反思流程
 * 当任务完成后自动触发反思分析，并根据质量自动应用到系统
 */

const db = require('../db');
const { generateShortId } = require('../db/uuid-generator');

// 引入 Reflection Engine 和 Applier
const ReflectionEngine = require('../../scripts/self-evolution/reflection-engine');
const ReflectionApplier = require('../../scripts/self-evolution/reflection-applier');

class ReflectionProcessor {
  /**
   * 处理已完成的任务，触发反思流程
   */
  static async processCompletedTask(taskId) {
    try {
      console.log(`[ReflectionProcessor] 开始处理任务 ${taskId} 的反思`);
      
      // 读取任务详情
      const task = db.tasks.get(taskId);
      if (!task) {
        console.error(`[ReflectionProcessor] 任务不存在: ${taskId}`);
        return false;
      }

      if (task.status !== 'done') {
        console.warn(`[ReflectionProcessor] 任务 ${taskId} 状态不是 'done': ${task.status}`);
        return false;
      }

      // 检查是否已经有反思记录
      const existingReflection = db.get(
        'SELECT id FROM task_reflections WHERE task_id = ?', 
        [taskId]
      );

      if (existingReflection) {
        console.log(`[ReflectionProcessor] 任务 ${taskId} 已存在反思记录，跳过`);
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
            completion_result: task.completed_result
          })
        ]
      );

      console.log(`[ReflectionProcessor] ✅ 已创建反思记录: ${reflectionId} for task ${taskId}`);

      // 异步处理反思内容（模拟实际的反思分析过程）
      setTimeout(() => {
        this.performReflectionAnalysis(reflectionId, task);
      }, 1000); // 延迟1秒处理，避免阻塞

      return true;
    } catch (error) {
      console.error(`[ReflectionProcessor] 处理任务反思失败:`, error);
      return false;
    }
  }

  /**
   * 执行反思分析
   */
  static async performReflectionAnalysis(reflectionId, task) {
    try {
      console.log(`[ReflectionProcessor] 开始分析反思: ${reflectionId}`);

      // 模拟反思分析过程（实际应用中这里会调用LLM或其他分析逻辑）
      const analysis = await this.analyzeTaskOutcome(task);

      // 更新反思记录
      const now = new Date().toISOString();
      
      db.run(
        `UPDATE task_reflections 
         SET status = 'completed', 
             completed_at = ?, 
             reflection_data = ?,
             improvements = ?
         WHERE id = ?`,
        [
          now,
          JSON.stringify(analysis.fullAnalysis),
          JSON.stringify(analysis.improvements),
          reflectionId
        ]
      );

      console.log(`[ReflectionProcessor] ✅ 反思分析完成: ${reflectionId}`);

      // 如果有改进项，触发演化流程
      if (analysis.improvements && analysis.improvements.length > 0) {
        this.triggerEvolutionIfNeeded(reflectionId, analysis.improvements);
      }

      return true;
    } catch (error) {
      console.error(`[ReflectionProcessor] 反思分析失败:`, error);

      // 更新为失败状态
      try {
        db.run(
          `UPDATE task_reflections SET status = 'failed' WHERE id = ?`,
          [reflectionId]
        );
      } catch (updateError) {
        console.error(`[ReflectionProcessor] 更新失败状态失败:`, updateError);
      }

      return false;
    }
  }

  /**
   * 分析任务结果
   */
  static async analyzeTaskOutcome(task) {
    // 模拟分析逻辑，实际应用中这里会更复杂
    const analysis = {
      task_title: task.title,
      task_outcome: task.status === 'done' ? '成功完成' : '未完成',
      execution_summary: task.completed_result || '无结果描述',
      challenges_faced: this.extractChallenges(task),
      lessons_learned: this.extractLessons(task),
      suggestions_for_improvement: this.generateSuggestions(task)
    };

    const improvements = this.extractImprovements(analysis);

    return {
      fullAnalysis: analysis,
      improvements: improvements
    };
  }

  /**
   * 提取挑战
   */
  static extractChallenges(task) {
    const challenges = [];
    
    // 从执行日志中提取可能的挑战
    if (task.execution_log && Array.isArray(task.execution_log)) {
      for (const log of task.execution_log) {
        if (log.detail && (log.detail.toLowerCase().includes('error') || 
                          log.detail.toLowerCase().includes('failed') ||
                          log.detail.toLowerCase().includes('retry'))) {
          challenges.push(log.detail);
        }
      }
    }

    return challenges.slice(0, 5); // 最多返回5个挑战
  }

  /**
   * 提取经验教训
   */
  static extractLessons(task) {
    const lessons = [];
    
    // 基于任务类型和执行情况提取经验
    if (task.breakdown && task.breakdown.steps) {
      const completedSteps = task.breakdown.steps.filter(step => step.status === 'completed');
      const pendingSteps = task.breakdown.steps.filter(step => step.status === 'pending');
      
      if (completedSteps.length > 0) {
        lessons.push(`完成了 ${completedSteps.length} 个步骤，成功率为 ${Math.round((completedSteps.length / task.breakdown.steps.length) * 100)}%`);
      }
      
      if (pendingSteps.length > 0) {
        lessons.push(`剩余 ${pendingSteps.length} 个步骤未完成`);
      }
    }

    return lessons;
  }

  /**
   * 生成改进建议
   */
  static generateSuggestions(task) {
    const suggestions = [];
    
    // 根据任务类型生成建议
    if (task.title.toLowerCase().includes('bug') || task.title.toLowerCase().includes('修复')) {
      suggestions.push('考虑增加相关测试用例，防止问题再次发生');
      suggestions.push('完善错误处理机制');
    }
    
    if (task.title.toLowerCase().includes('性能') || task.title.toLowerCase().includes('优化')) {
      suggestions.push('建立性能监控指标');
      suggestions.push('定期进行性能评估');
    }

    return suggestions;
  }

  /**
   * 提取改进项
   */
  static extractImprovements(analysis) {
    const improvements = [];
    
    if (analysis.challenges_faced && analysis.challenges_faced.length > 0) {
      improvements.push(...analysis.challenges_faced.map(challenge => ({
        type: 'challenge_address',
        description: `应对挑战: ${challenge}`,
        priority: 'medium'
      })));
    }

    if (analysis.suggestions_for_improvement && analysis.suggestions_for_improvement.length > 0) {
      improvements.push(...analysis.suggestions_for_improvement.map(suggestion => ({
        type: 'process_improvement',
        description: suggestion,
        priority: 'low'
      })));
    }

    return improvements;
  }

  /**
   * 触发演化流程（如果有改进项）
   */
  static triggerEvolutionIfNeeded(reflectionId, improvements) {
    try {
      if (improvements.length > 0) {
        console.log(`[ReflectionProcessor] 触发演化流程，发现 ${improvements.length} 个改进项`);
        
        // 更新反思记录，标记需要演化
        db.run(
          `UPDATE task_reflections SET evolution_trigger = ? WHERE id = ?`,
          [JSON.stringify({ triggered: true, improvement_count: improvements.length }), reflectionId]
        );

        // 这里可以触发进一步的演化流程
        // 例如：创建改进任务、更新系统配置等
      }
    } catch (error) {
      console.error(`[ReflectionProcessor] 触发演化流程失败:`, error);
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
      console.error(`[ReflectionProcessor] 获取反思状态失败:`, error);
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
      console.error(`[ReflectionProcessor] 获取待处理反思失败:`, error);
      return [];
    }
  }
}

module.exports = ReflectionProcessor;