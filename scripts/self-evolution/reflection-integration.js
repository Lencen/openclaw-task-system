#!/usr/bin/env node
/**
 * Reflection 自动化流程集成器
 * 实现任务完成时自动触发反思机制
 * 
 * 功能:
 * - 监听任务完成事件
 * - 自动触发反思流程
 * - 应用高质量反思到系统
 * - 记录反思结果
 */

const path = require('path');
const fs = require('fs');

// 配置
const DATA_DIR = path.join(__dirname, '../../data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const REFLECTIONS_DIR = path.join(__dirname, '../../data/self-evolution/reflections');

// 引入 Reflection 模块
const ReflectionEngine = require('./reflection-engine');
const ReflectionApplier = require('./reflection-applier');

class ReflectionIntegration {
    constructor() {
        this.tasksFile = TASKS_FILE;
        this.reflectionsDir = REFLECTIONS_DIR;
        
        // 确保目录存在
        if (!fs.existsSync(this.reflectionsDir)) {
            fs.mkdirSync(this.reflectionsDir, { recursive: true });
        }
    }

    /**
     * 任务完成后触发反思
     * @param {Object} task - 完成的任务对象
     * @returns {Object|null} 反思结果
     */
    async onTaskCompleted(task) {
        console.log(`\n[ReflectionIntegration] 任务完成，触发反思: ${task.title}`);
        console.log(`  任务ID: ${task.id}`);
        console.log(`  状态: ${task.status}`);
        console.log(`  完成时间: ${task.completed_at || new Date().toISOString()}`);
        
        try {
            // 1. 准备任务数据用于反思
            const reflectionTask = this.prepareTaskForReflection(task);
            
            // 2. 执行反思流程
            const reflection = await this.executeReflection(reflectionTask);
            
            if (!reflection) {
                console.log('[ReflectionIntegration] 反思流程跳过（重复或验证失败）');
                return null;
            }
            
            // 3. 应用高质量反思
            await this.applyQualityReflection(reflection);
            
            console.log(`[ReflectionIntegration] 任务反思完成: ${reflection.id}`);
            return reflection;
            
        } catch (error) {
            console.error(`[ReflectionIntegration] 反思处理失败: ${error.message}`);
            return null;
        }
    }

    /**
     * 准备任务数据用于反思
     */
    prepareTaskForReflection(task) {
        return {
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
            steps: task.steps || [],
            result: task.result || 'unknown',
            metrics: task.metrics || {}
        };
    }

    /**
     * 执行反思流程
     */
    async executeReflection(task) {
        console.log(`\n[ReflectionIntegration] 开始执行反思流程`);
        
        try {
            // 调用 ReflectionEngine 进行完整反思流程
            const reflection = await ReflectionEngine.reflect(task, 3);
            
            if (!reflection) {
                console.log('[ReflectionIntegration] 反思流程返回 null（可能因为重复或验证失败）');
                return null;
            }
            
            console.log(`[ReflectionIntegration] 反思生成成功`);
            console.log(`  ID: ${reflection.id}`);
            console.log(`  Score: ${reflection.score}/10`);
            console.log(`  Round: ${reflection.round}`);
            console.log(`  Improvable: ${reflection.improvable}`);
            
            return reflection;
        } catch (error) {
            console.error(`[ReflectionIntegration] 反思执行失败: ${error.message}`);
            return null;
        }
    }

    /**
     * 应用高质量反思
     */
    async applyQualityReflection(reflection) {
        console.log(`\n[ReflectionIntegration] 检查反思质量并决定是否应用`);
        
        // 检查反思质量（评分 >= 8 且不可再改进）
        if (reflection.score >= 8 && !reflection.improvable) {
            console.log(`[ReflectionIntegration] 反思质量合格 (Score: ${reflection.score}), 开始应用`);
            
            try {
                // 调用 ReflectionApplier 应用反思
                const applyResult = await ReflectionApplier.applyWithNotification(
                    reflection, 
                    'auto' // 自动选择目标文件
                );
                
                if (applyResult.success) {
                    console.log(`[ReflectionIntegration] 反思应用成功: ${reflection.id}`);
                    console.log(`  应用到: ${applyResult.applied_to}`);
                    
                    // 更新任务记录中的反思信息
                    await this.updateTaskWithReflection(reflection);
                } else {
                    console.log(`[ReflectionIntegration] 反思应用失败: ${applyResult.reason || applyResult.error}`);
                }
            } catch (error) {
                console.error(`[ReflectionIntegration] 反思应用过程出错: ${error.message}`);
            }
        } else {
            console.log(`[ReflectionIntegration] 反思质量不足，跳过自动应用`);
            console.log(`  评分: ${reflection.score}/10 (需要 >= 8)`);
            console.log(`  可改进: ${reflection.improvable} (需要 false)`);
        }
    }

    /**
     * 更新任务记录中的反思信息
     */
    async updateTaskWithReflection(reflection) {
        try {
            if (!fs.existsSync(this.tasksFile)) {
                console.log('[ReflectionIntegration] 任务文件不存在，跳过更新');
                return;
            }
            
            const tasksData = JSON.parse(fs.readFileSync(this.tasksFile, 'utf8'));
            const tasks = tasksData.tasks || [];
            
            // 查找对应任务并添加反思信息
            const taskIndex = tasks.findIndex(t => t.id === reflection.task_id);
            if (taskIndex !== -1) {
                tasks[taskIndex].reflection = {
                    id: reflection.id,
                    score: reflection.score,
                    applied: reflection.applied,
                    applied_at: reflection.applied_at,
                    context: reflection.context,
                    lesson: reflection.lesson
                };
                
                // 保存更新后的任务数据
                tasksData.tasks = tasks;
                fs.writeFileSync(this.tasksFile, JSON.stringify(tasksData, null, 2));
                
                console.log(`[ReflectionIntegration] 任务记录已更新，包含反思信息`);
            } else {
                console.log(`[ReflectionIntegration] 未找到对应任务: ${reflection.task_id}`);
            }
        } catch (error) {
            console.error(`[ReflectionIntegration] 更新任务记录失败: ${error.message}`);
        }
    }

    /**
     * 手动触发任务反思（用于测试）
     */
    async triggerManualReflection(taskId) {
        console.log(`[ReflectionIntegration] 手动触发任务反思: ${taskId}`);
        
        try {
            if (!fs.existsSync(this.tasksFile)) {
                throw new Error('任务文件不存在');
            }
            
            const tasksData = JSON.parse(fs.readFileSync(this.tasksFile, 'utf8'));
            const tasks = tasksData.tasks || [];
            
            const task = tasks.find(t => t.id === taskId);
            if (!task) {
                throw new Error(`未找到任务: ${taskId}`);
            }
            
            // 执行反思
            return await this.onTaskCompleted(task);
        } catch (error) {
            console.error(`[ReflectionIntegration] 手动触发反思失败: ${error.message}`);
            return null;
        }
    }

    /**
     * 获取反思统计信息
     */
    getReflectionStats() {
        try {
            const files = fs.readdirSync(this.reflectionsDir);
            const reflections = files.filter(f => f.endsWith('.json')).length;
            
            // 统计应用情况
            let appliedCount = 0;
            let totalScore = 0;
            let highQualityCount = 0;
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const content = fs.readFileSync(path.join(this.reflectionsDir, file), 'utf8');
                        const reflection = JSON.parse(content);
                        
                        if (reflection.applied) appliedCount++;
                        if (reflection.score) {
                            totalScore += reflection.score;
                            if (reflection.score >= 8) highQualityCount++;
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
            
            const avgScore = reflections > 0 ? totalScore / reflections : 0;
            
            return {
                totalReflections: reflections,
                appliedCount,
                highQualityCount,
                avgScore: parseFloat(avgScore.toFixed(2)),
                applicationRate: reflections > 0 ? parseFloat((appliedCount / reflections * 100).toFixed(2)) : 0
            };
        } catch (error) {
            console.error(`[ReflectionIntegration] 获取统计信息失败: ${error.message}`);
            return {
                totalReflections: 0,
                appliedCount: 0,
                highQualityCount: 0,
                avgScore: 0,
                applicationRate: 0
            };
        }
    }
}

// CLI 入口
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const integration = new ReflectionIntegration();
    
    switch (command) {
        case 'trigger':
            // 手动触发任务反思
            const taskId = args[1];
            if (!taskId) {
                console.error('用法: node reflection-integration.js trigger <task-id>');
                process.exit(1);
            }
            
            integration.triggerManualReflection(taskId)
                .then(result => {
                    if (result) {
                        console.log('\n✅ 反思执行成功:');
                        console.log(`ID: ${result.id}`);
                        console.log(`Score: ${result.score}/10`);
                        console.log(`Applied: ${result.applied}`);
                    } else {
                        console.log('\n❌ 反思执行失败或跳过');
                    }
                })
                .catch(err => {
                    console.error('执行错误:', err.message);
                    process.exit(1);
                });
            break;
            
        case 'stats':
            // 获取统计信息
            const stats = integration.getReflectionStats();
            console.log('\n📊 Reflection 统计信息:');
            console.log(`总反思数: ${stats.totalReflections}`);
            console.log(`已应用数: ${stats.appliedCount} (${stats.applicationRate}%)`);
            console.log(`高质量反思数 (≥8分): ${stats.highQualityCount}`);
            console.log(`平均评分: ${stats.avgScore}/10`);
            break;
            
        case 'help':
        default:
            console.log(`
Reflection 自动化流程集成器

用法: node reflection-integration.js <command>

命令:
  trigger <task-id>    手动触发指定任务的反思
  stats               显示反思统计信息
  help                显示帮助信息

示例:
  node reflection-integration.js trigger task-123
  node reflection-integration.js stats
`);
    }
}

// 导出模块
module.exports = ReflectionIntegration;

// 如果直接运行，则执行 CLI
if (require.main === module) {
    main();
}