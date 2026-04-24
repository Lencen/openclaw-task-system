/**
 * Reflection 自动化流程 - 完整实现
 * 
 * 实现任务完成时自动触发反思机制
 * 1. 任务完成 -> 触发反思
 * 2. 反思分析 -> 生成改进项
 * 3. 质量评估 -> 自动应用或人工确认
 * 4. 系统更新 -> 应用改进到系统
 */

const path = require('path');
const fs = require('fs');
const db = require('../src/db');

// 引入 Reflection 模块
const ReflectionEngine = require('./self-evolution/reflection-engine');
const ReflectionApplier = require('./self-evolution/reflection-applier');

class ReflectionAutomationFlow {
    constructor() {
        this.dataDir = path.join(__dirname, '../data');
        this.reflectionsDir = path.join(this.dataDir, 'self-evolution', 'reflections');
        
        // 确保目录存在
        if (!fs.existsSync(this.reflectionsDir)) {
            fs.mkdirSync(this.reflectionsDir, { recursive: true });
        }
    }

    /**
     * 任务完成时触发反思自动化流程
     * @param {string} taskId - 任务ID
     */
    async onTaskCompleted(taskId) {
        console.log(`\n[ReflectionAutomation] 🔄 任务完成，启动反思自动化流程: ${taskId}`);
        
        try {
            // 1. 获取任务详情
            const task = await this.getTask(taskId);
            if (!task) {
                throw new Error(`任务不存在: ${taskId}`);
            }
            
            console.log(`[ReflectionAutomation] 任务详情:`);
            console.log(`  标题: ${task.title}`);
            console.log(`  状态: ${task.status}`);
            console.log(`  执行日志: ${(task.execution_log || []).length} 条`);
            console.log(`  错误记录: ${(task.errors || []).length} 条`);
            
            // 2. 生成反思
            const reflection = await this.generateReflection(task);
            if (!reflection) {
                console.log(`[ReflectionAutomation] ❌ 反思生成失败或被跳过`);
                return null;
            }
            
            // 3. 评估反思质量
            const qualityAssessment = await this.assessQuality(reflection);
            console.log(`[ReflectionAutomation] 反思质量评估: ${qualityAssessment.score}/10`);
            
            // 4. 根据质量决定处理方式
            if (qualityAssessment.score >= 8 && qualityAssessment.isApplicable) {
                console.log(`[ReflectionAutomation] ✅ 高质量反思，自动应用`);
                const applyResult = await this.autoApply(reflection);
                
                // 更新任务记录
                await this.updateTaskReflectionStatus(taskId, {
                    status: 'completed',
                    applied: true,
                    applied_at: new Date().toISOString(),
                    quality_score: qualityAssessment.score
                });
                
                return {
                    reflection,
                    quality: qualityAssessment,
                    applied: true,
                    result: applyResult
                };
            } else {
                console.log(`[ReflectionAutomation] ⚠️ 低质量反思，需人工确认`);
                
                // 更新任务记录为待确认
                await this.updateTaskReflectionStatus(taskId, {
                    status: 'pending_confirmation',
                    applied: false,
                    quality_score: qualityAssessment.score,
                    requires_review: true
                });
                
                return {
                    reflection,
                    quality: qualityAssessment,
                    applied: false,
                    requiresReview: true
                };
            }
        } catch (error) {
            console.error(`[ReflectionAutomation] ❌ 反思自动化流程失败:`, error.message);
            
            // 即使失败也更新任务状态
            try {
                await this.updateTaskReflectionStatus(taskId, {
                    status: 'failed',
                    error: error.message,
                    failed_at: new Date().toISOString()
                });
            } catch (updateError) {
                console.error(`[ReflectionAutomation] 更新任务状态失败:`, updateError.message);
            }
            
            return null;
        }
    }

    /**
     * 获取任务详情
     */
    async getTask(taskId) {
        return db.tasks.get(taskId);
    }

    /**
     * 生成反思
     */
    async generateReflection(task) {
        console.log(`\n[ReflectionAutomation] 🧠 开始生成反思`);
        
        try {
            // 准备任务数据用于反思
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
                steps: task.steps || [],
                result: task.result || 'unknown',
                metrics: task.metrics || {},
                breakdown: task.breakdown || {},
                analysis: task.analysis || {}
            };
            
            // 调用 ReflectionEngine 生成反思
            const reflection = await ReflectionEngine.reflect(reflectionTask, 3);
            
            if (!reflection) {
                console.log(`[ReflectionAutomation] ℹ️ 反思生成被跳过（可能因重复或验证失败）`);
                return null;
            }
            
            console.log(`[ReflectionAutomation] ✅ 反思生成成功: ${reflection.id.substring(0, 12)}...`);
            console.log(`  评分: ${reflection.score}/10`);
            console.log(`  轮次: ${reflection.round}`);
            console.log(`  可改进: ${reflection.improvable}`);
            
            return reflection;
        } catch (error) {
            console.error(`[ReflectionAutomation] 生成反思失败:`, error.message);
            return null;
        }
    }

    /**
     * 评估反思质量
     */
    async assessQuality(reflection) {
        console.log(`\n[ReflectionAutomation] 📊 评估反思质量`);
        
        // 评分维度
        const assessment = {
            score: reflection.score || 0,
            criteria: {
                clarity: 0,      // 清晰度
                relevance: 0,    // 相关性
                actionability: 0, // 可执行性
                depth: 0,        // 深度
                novelty: 0       // 新颖性
            },
            isApplicable: true,
            issues: []
        };
        
        // 评估清晰度
        if (reflection.lesson && reflection.lesson.length > 20) {
            assessment.criteria.clarity = 8;
        } else if (reflection.lesson && reflection.lesson.length > 10) {
            assessment.criteria.clarity = 5;
        } else {
            assessment.criteria.clarity = 2;
            assessment.issues.push('反思内容过于简短');
        }
        
        // 评估相关性
        if (reflection.context && reflection.reflection && 
            (reflection.context.toLowerCase().includes(reflection.reflection.toLowerCase().substring(0, 20)) ||
             reflection.reflection.toLowerCase().includes(reflection.context.toLowerCase().substring(0, 20)))) {
            assessment.criteria.relevance = 8;
        } else {
            assessment.criteria.relevance = 5;
        }
        
        // 评估可执行性
        const actionablePhrases = ['应该', '需要', '必须', '改进', '优化', '避免', '提高', '加强'];
        if (actionablePhrases.some(phrase => reflection.lesson.toLowerCase().includes(phrase))) {
            assessment.criteria.actionability = 9;
        } else if (reflection.lesson.toLowerCase().includes('建议')) {
            assessment.criteria.actionability = 7;
        } else {
            assessment.criteria.actionability = 4;
            assessment.issues.push('缺乏可执行的改进建议');
        }
        
        // 评估深度
        if (reflection.round >= 3) {
            assessment.criteria.depth = 9;
        } else if (reflection.round >= 2) {
            assessment.criteria.depth = 7;
        } else {
            assessment.criteria.depth = 5;
        }
        
        // 评估新颖性（通过去重检查）
        const duplicateCheck = await ReflectionEngine.checkDuplicate(reflection.lesson);
        if (duplicateCheck.isDuplicate) {
            assessment.criteria.novelty = 3;
            assessment.issues.push('反思内容与其他反思重复');
            assessment.isApplicable = false;
        } else {
            assessment.criteria.novelty = 8;
        }
        
        // 计算综合评分
        const avgScore = Object.values(assessment.criteria).reduce((sum, val) => sum + val, 0) / 5;
        assessment.score = Math.min(10, Math.max(0, avgScore));
        
        console.log(`[ReflectionAutomation] 质量评估结果:`);
        console.log(`  综合评分: ${assessment.score}/10`);
        console.log(`  清晰度: ${assessment.criteria.clarity}/10`);
        console.log(`  相关性: ${assessment.criteria.relevance}/10`);
        console.log(`  可执行性: ${assessment.criteria.actionability}/10`);
        console.log(`  深度: ${assessment.criteria.depth}/10`);
        console.log(`  新颖性: ${assessment.criteria.novelty}/10`);
        console.log(`  问题: ${assessment.issues.length} 项`);
        
        return assessment;
    }

    /**
     * 自动应用高质量反思
     */
    async autoApply(reflection) {
        console.log(`\n[ReflectionAutomation] 🚀 自动应用反思: ${reflection.id.substring(0, 12)}...`);
        
        try {
            // 检查是否可以应用
            const canApplyResult = await ReflectionApplier.canApply(reflection);
            if (!canApplyResult.canApply) {
                console.log(`[ReflectionAutomation] ❌ 无法自动应用:`, canApplyResult.reason.join(', '));
                return { success: false, reason: canApplyResult.reason.join(', ') };
            }
            
            // 应用反思
            const applyResult = await ReflectionApplier.applyWithNotification(reflection, 'auto');
            
            console.log(`[ReflectionAutomation] 应用结果:`, applyResult.success ? '✅ 成功' : '❌ 失败');
            
            return applyResult;
        } catch (error) {
            console.error(`[ReflectionAutomation] 自动应用失败:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * 更新任务的反思状态
     */
    async updateTaskReflectionStatus(taskId, reflectionStatus) {
        try {
            // 获取当前任务
            const currentTask = await this.getTask(taskId);
            if (!currentTask) {
                throw new Error(`任务不存在: ${taskId}`);
            }
            
            // 更新任务的反思字段
            const updates = {
                ...currentTask,
                reflection: {
                    ...currentTask.reflection,
                    ...reflectionStatus,
                    updated_at: new Date().toISOString()
                }
            };
            
            // 同时更新 reflection_status 字段
            const reflectionStatusField = reflectionStatus.status || 'pending';
            
            // 使用数据库更新
            await db.tasks.update(taskId, { 
                reflection: updates.reflection,
                reflection_status: reflectionStatusField
            });
            
            console.log(`[ReflectionAutomation] ✅ 任务反思状态已更新: ${taskId}`);
            console.log(`  - reflection_status: ${reflectionStatusField}`);
        } catch (error) {
            console.error(`[ReflectionAutomation] 更新任务反思状态失败:`, error.message);
            throw error;
        }
    }

    /**
     * 手动处理待确认的反思
     */
    async processPendingReflections() {
        console.log(`\n[ReflectionAutomation] 🔄 处理待确认的反思`);
        
        try {
            // 从数据库获取所有需要确认的反思任务
            const allTasks = await db.tasks.list({});
            const pendingTasks = allTasks.filter(task => 
                task.reflection && 
                (task.reflection.status === 'pending_confirmation' || 
                 task.reflection.requires_review)
            );
            
            console.log(`[ReflectionAutomation] 发现 ${pendingTasks.length} 个待确认任务`);
            
            for (const task of pendingTasks) {
                console.log(`[ReflectionAutomation] 处理待确认任务: ${task.id}`);
                
                // 尝试重新评估
                if (task.reflection && task.reflection.id) {
                    // 从文件系统加载反思详情
                    const reflectionFile = path.join(this.reflectionsDir, `${task.reflection.id}.json`);
                    if (fs.existsSync(reflectionFile)) {
                        const reflection = JSON.parse(fs.readFileSync(reflectionFile, 'utf8'));
                        
                        // 重新评估质量
                        const quality = await this.assessQuality(reflection);
                        
                        if (quality.score >= 7) {
                            console.log(`[ReflectionAutomation] 质量提升，尝试自动应用: ${task.id}`);
                            
                            const applyResult = await this.autoApply(reflection);
                            await this.updateTaskReflectionStatus(task.id, {
                                status: 'completed',
                                applied: applyResult.success,
                                applied_at: new Date().toISOString(),
                                quality_score: quality.score,
                                confirmed_by: 'system_auto'
                            });
                        }
                    }
                }
            }
            
            return { processed: pendingTasks.length, success: true };
        } catch (error) {
            console.error(`[ReflectionAutomation] 处理待确认反思失败:`, error.message);
            return { processed: 0, success: false, error: error.message };
        }
    }

    /**
     * 获取反思统计信息
     */
    async getStatistics() {
        try {
            // 从数据库获取任务统计
            const allTasks = await db.tasks.list({});
            const tasksWithReflection = allTasks.filter(t => t.reflection);
            
            const stats = {
                totalTasks: allTasks.length,
                withReflection: tasksWithReflection.length,
                completedReflections: tasksWithReflection.filter(t => t.reflection.status === 'completed').length,
                pendingConfirmation: tasksWithReflection.filter(t => t.reflection.status === 'pending_confirmation').length,
                failedReflections: tasksWithReflection.filter(t => t.reflection.status === 'failed').length,
                autoApplied: tasksWithReflection.filter(t => t.reflection.applied === true).length,
                avgQualityScore: 0
            };
            
            // 计算平均质量分数
            const qualityScores = tasksWithReflection
                .filter(t => t.reflection && typeof t.reflection.quality_score === 'number')
                .map(t => t.reflection.quality_score);
            
            if (qualityScores.length > 0) {
                stats.avgQualityScore = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
                stats.avgQualityScore = Math.round(stats.avgQualityScore * 100) / 100;
            }
            
            return stats;
        } catch (error) {
            console.error(`[ReflectionAutomation] 获取统计信息失败:`, error.message);
            return null;
        }
    }
}

// CLI 入口
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const flow = new ReflectionAutomationFlow();
    
    switch (command) {
        case 'process':
            // 处理指定任务的反思
            const taskId = args[1];
            if (!taskId) {
                console.error('用法: node reflection-automation-flow.js process <task-id>');
                process.exit(1);
            }
            
            flow.onTaskCompleted(taskId)
                .then(result => {
                    if (result) {
                        console.log('\n✅ 反思自动化流程完成');
                        console.log(`应用状态: ${result.applied ? '已应用' : '待确认'}`);
                        console.log(`质量评分: ${result.quality.score}/10`);
                    } else {
                        console.log('\n❌ 反思自动化流程失败或跳过');
                    }
                })
                .catch(err => {
                    console.error('执行错误:', err.message);
                    process.exit(1);
                });
            break;
            
        case 'process-pending':
            // 处理所有待确认的反思
            flow.processPendingReflections()
                .then(result => {
                    console.log('\n📊 待确认反思处理完成');
                    console.log(`处理数量: ${result.processed}`);
                    console.log(`成功: ${result.success}`);
                })
                .catch(err => {
                    console.error('执行错误:', err.message);
                    process.exit(1);
                });
            break;
            
        case 'stats':
            // 获取统计信息
            flow.getStatistics()
                .then(stats => {
                    if (stats) {
                        console.log('\n📈 Reflection 自动化流程统计:');
                        console.log(`总任务数: ${stats.totalTasks}`);
                        console.log(`有反思任务: ${stats.withReflection}`);
                        console.log(`完成反思: ${stats.completedReflections}`);
                        console.log(`待确认: ${stats.pendingConfirmation}`);
                        console.log(`失败反思: ${stats.failedReflections}`);
                        console.log(`自动应用: ${stats.autoApplied}`);
                        console.log(`平均质量分: ${stats.avgQualityScore}`);
                    }
                })
                .catch(err => {
                    console.error('获取统计失败:', err.message);
                    process.exit(1);
                });
            break;
            
        case 'help':
        default:
            console.log(`
Reflection 自动化流程管理器

用法: node reflection-automation-flow.js <command>

命令:
  process <task-id>        处理指定任务的反思
  process-pending         处理所有待确认的反思
  stats                   显示统计信息
  help                    显示帮助信息

示例:
  node reflection-automation-flow.js process task-123abc
  node reflection-automation-flow.js process-pending
  node reflection-automation-flow.js stats
`);
    }
}

// 导出类
module.exports = ReflectionAutomationFlow;

// 如果直接运行，则执行 CLI
if (require.main === module) {
    main();
}