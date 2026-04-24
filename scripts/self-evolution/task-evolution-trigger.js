#!/usr/bin/env node
/**
 * 任务进化触发器 - 触发任务完成后的反思和进化流程
 * 
 * 功能：
 * 1. 接收任务数据
 * 2. 执行反思分析
 * 3. 应用改进到系统
 * 4. 记录进化日志
 * 
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');

// 配置路径
const REFLECTION_ENGINE_PATH = path.join(__dirname, './reflection-engine');
const REFLECTION_APPLIER_PATH = path.join(__dirname, './reflection-applier');

// 导入反射引擎和应用器
const { reflect } = require(REFLECTION_ENGINE_PATH);
const { applyWithNotification } = require(REFLECTION_APPLIER_PATH);

// 数据库操作（使用相对路径）
const db = require('../../db');

/**
 * 主处理函数
 * @param {Object} task - 任务对象
 */
async function processTaskEvolution(task) {
    console.log(`\n[TaskEvolution] 开始处理任务进化: ${task.title || task.id}`);
    console.log(`  任务ID: ${task.id}`);
    console.log(`  任务状态: ${task.status}`);
    console.log(`  执行者: ${task.assigned_agent || 'N/A'}`);
    console.log(`  完成时间: ${task.completed_at || 'N/A'}`);
    
    try {
        // 1. 检查任务是否已完成
        if (task.status !== 'completed' && task.status !== 'done') {
            console.log(`[TaskEvolution] 任务未完成，跳过反思: ${task.status}`);
            return { success: false, reason: 'task_not_completed' };
        }

        // 2. 检查是否已有反思记录
        const existingReflection = db.get(
            'SELECT id FROM task_reflections WHERE task_id = ?', 
            [task.id]
        );
        
        if (existingReflection) {
            console.log(`[TaskEvolution] 任务已有反思记录，跳过: ${task.id}`);
            return { success: true, reason: 'already_reflected' };
        }

        // 3. 执行反思流程
        console.log(`[TaskEvolution] 开始执行反思流程...`);
        
        const reflection = await reflect(task, 3);
        
        if (!reflection) {
            console.log(`[TaskEvolution] 反思引擎返回空结果，可能因为重复或验证失败`);
            return { success: false, reason: 'reflection_engine_returned_null' };
        }

        console.log(`[TaskEvolution] 反思生成成功`);
        console.log(`  ID: ${reflection.id}`);
        console.log(`  评分: ${reflection.score}/10`);
        console.log(`  教训: ${reflection.lesson.substring(0, 100)}...`);

        // 4. 根据反思质量决定是否自动应用
        let applied = false;
        let applied_to = null;
        
        if (reflection.score >= 8 && !reflection.improvable) {
            console.log(`[TaskEvolution] 反思质量合格 (Score: ${reflection.score}), 开始自动应用...`);
            
            try {
                const applyResult = await applyWithNotification(reflection, 'auto');
                
                if (applyResult.success) {
                    applied = true;
                    applied_to = applyResult.applied_to;
                    console.log(`[TaskEvolution] ✅ 反思应用成功: ${reflection.id}`);
                    console.log(`  应用到: ${applyResult.applied_to}`);
                } else {
                    console.log(`[TaskEvolution] ❌ 反思应用失败: ${applyResult.reason || applyResult.error}`);
                }
            } catch (applyError) {
                console.error(`[TaskEvolution] 反思应用过程出错:`, applyError);
            }
        } else {
            console.log(`[TaskEvolution] 反思质量不足，跳过自动应用`);
            console.log(`  评分: ${reflection.score}/10 (需要 >= 8)`);
            console.log(`  可改进: ${reflection.improvable} (需要 false)`);
        }

        // 5. 记录反思结果
        await recordReflectionResult(task, reflection, applied, applied_to);

        // 6. 更新任务状态（如果需要）
        await updateTaskStatusAfterReflection(task.id);

        console.log(`\n[TaskEvolution] 任务进化流程完成: ${task.id}`);
        console.log(`  反思ID: ${reflection.id}`);
        console.log(`  应用状态: ${applied ? '成功' : '跳过'}`);
        console.log(`  评分: ${reflection.score}/10`);

        return {
            success: true,
            reflectionId: reflection.id,
            applied,
            appliedTo: applied_to,
            score: reflection.score
        };

    } catch (error) {
        console.error(`[TaskEvolution] 任务进化处理失败:`, error);
        console.error(`  任务: ${task.id}`);
        console.error(`  错误: ${error.message}`);
        
        return {
            success: false,
            error: error.message,
            task: task.id
        };
    }
}

/**
 * 记录反思结果
 */
async function recordReflectionResult(task, reflection, applied, appliedTo) {
    const now = new Date().toISOString();
    
    try {
        // 检查是否已存在反思记录
        const existing = db.get('SELECT id FROM task_reflections WHERE task_id = ? AND id = ?', [task.id, reflection.id]);
        
        if (!existing) {
            db.run(
                `INSERT INTO task_reflections 
                 (id, task_id, status, triggered_at, completed_at, reflection_data, improvements, applied, applied_to) 
                 VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?)`,
                [
                    reflection.id,
                    task.id,
                    now,
                    now,
                    JSON.stringify({
                        context: reflection.context,
                        reflection: reflection.reflection,
                        lesson: reflection.lesson,
                        score: reflection.score,
                        round: reflection.round
                    }),
                    JSON.stringify([]), // 简单起见，这里暂时为空
                    applied ? 1 : 0,
                    appliedTo
                ]
            );
            
            console.log(`[TaskEvolution] 反思记录已保存到数据库: ${reflection.id}`);
        } else {
            console.log(`[TaskEvolution] 反思记录已存在，跳过插入: ${reflection.id}`);
        }
    } catch (error) {
        console.error(`[TaskEvolution] 保存反思记录失败:`, error);
    }
}

/**
 * 更新任务状态（在反思完成后）
 */
async function updateTaskStatusAfterReflection(taskId) {
    try {
        // 获取任务当前状态
        const task = db.tasks.get(taskId);
        if (!task) {
            console.error(`[TaskEvolution] 任务不存在: ${taskId}`);
            return;
        }

        // 如果任务状态是 reflection_pending，将其更新为 done
        if (task.status === 'reflection_pending') {
            const updatedTask = await db.tasks.update(taskId, {
                status: 'done',
                reflection_status: 'completed',
                last_status_change_at: new Date().toISOString(),
                status_change_reason: '反思完成，任务结束'
            });
            
            console.log(`[TaskEvolution] 任务状态已更新为 done: ${taskId}`);
        } else if (task.status === 'completed') {
            // 如果任务状态仍是 completed，更新为 reflection_pending
            const updatedTask = await db.tasks.update(taskId, {
                status: 'reflection_pending',
                reflection_status: 'completed', // 反思已完成
                last_status_change_at: new Date().toISOString(),
                status_change_reason: '反思已完成，等待标记为 done'
            });
            
            console.log(`[TaskEvolution] 任务状态已更新为 reflection_pending: ${taskId}`);
        }
    } catch (error) {
        console.error(`[TaskEvolution] 更新任务状态失败:`, error);
    }
}

/**
 * 主入口函数
 */
async function main() {
    // 从命令行参数获取任务数据
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('用法: node task-evolution-trigger.js <task-json-string>');
        console.log('');
        console.log('示例:');
        console.log('  node task-evolution-trigger.js \'{"id":"task123","title":"测试任务","status":"completed","completed_at":"2023-01-01T00:00:00Z"}\'');
        process.exit(1);
    }
    
    try {
        const taskData = JSON.parse(args[0]);
        const result = await processTaskEvolution(taskData);
        
        console.log('\n[TaskEvolution] 最终结果:', result);
        
        // 根据结果设置退出码
        process.exit(result.success ? 0 : 1);
    } catch (error) {
        console.error('[TaskEvolution] 解析任务数据失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(error => {
        console.error('[TaskEvolution] 主程序执行失败:', error);
        process.exit(1);
    });
}

// 导出函数供其他模块使用
module.exports = {
    processTaskEvolution,
    recordReflectionResult,
    updateTaskStatusAfterReflection
};