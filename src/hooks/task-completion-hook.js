/**
 * 任务完成 Hook
 * 当任务状态变更为 'completed' 时自动触发反思流程
 */

const ReflectionAutomationFlow = require('../../scripts/reflection-automation-flow');

class TaskCompletionHook {
    constructor() {
        this.flow = new ReflectionAutomationFlow();
    }

    /**
     * 任务完成钩子函数
     * @param {string} taskId - 任务ID
     * @param {Object} task - 任务对象
     * @param {Object} updates - 状态更新信息
     */
    async onTaskCompleted(taskId, task, updates) {
        console.log(`\n[TaskCompletionHook] 🔄 检测到任务完成: ${taskId}`);
        console.log(`  任务标题: ${task.title}`);
        console.log(`  旧状态: ${task.status}`);
        console.log(`  新状态: ${updates.status}`);
        
        // 确保任务确实是从非完成状态变为完成状态
        if (task.status !== 'completed' && task.status !== 'done' && 
            updates.status === 'completed') {
            
            console.log(`[TaskCompletionHook] ✅ 任务完成状态变更，触发反思自动化流程`);
            
            try {
                // 异步触发反思流程（不阻塞当前操作）
                setImmediate(async () => {
                    try {
                        const result = await this.flow.onTaskCompleted(taskId);
                        
                        if (result) {
                            console.log(`[TaskCompletionHook] ✅ 反思流程执行完成`);
                            console.log(`  应用状态: ${result.applied ? '自动应用' : '待确认'}`);
                            console.log(`  质量评分: ${result.quality.score}/10`);
                        } else {
                            console.log(`[TaskCompletionHook] ❌ 反思流程执行失败或跳过`);
                        }
                    } catch (error) {
                        console.error(`[TaskCompletionHook] 执行反思流程时出错:`, error.message);
                    }
                });
                
                // 返回一个标识，表示已触发反思流程
                return {
                    hookTriggered: true,
                    reflectionStarted: true,
                    taskId: taskId
                };
            } catch (error) {
                console.error(`[TaskCompletionHook] 触发反思流程失败:`, error.message);
                
                // 即使失败也要返回，不影响原操作
                return {
                    hookTriggered: true,
                    reflectionStarted: false,
                    error: error.message,
                    taskId: taskId
                };
            }
        } else {
            console.log(`[TaskCompletionHook] ℹ️ 状态变更不符合触发条件，跳过`);
            return {
                hookTriggered: false,
                reason: 'status_not_completing'
            };
        }
    }

    /**
     * 验证任务是否需要反思
     * @param {Object} task - 任务对象
     * @returns {boolean} 是否需要反思
     */
    shouldTriggerReflection(task) {
        // 检查任务是否包含足够的信息用于反思
        const hasExecutionInfo = task.execution_log && task.execution_log.length > 0;
        const hasErrors = task.errors && task.errors.length > 0;
        const hasSteps = task.steps && task.steps.length > 0;
        const hasAnalysis = task.analysis && Object.keys(task.analysis).length > 0;
        
        // 基本条件：任务已完成且包含执行信息
        const basicCondition = task.status === 'completed';
        const infoCondition = hasExecutionInfo || hasErrors || hasSteps || hasAnalysis;
        
        const shouldTrigger = basicCondition && infoCondition;
        
        console.log(`[TaskCompletionHook] 反思触发检查:`);
        console.log(`  基本条件(已完成): ${basicCondition}`);
        console.log(`  信息条件(执行日志/错误/步骤/分析): ${infoCondition}`);
        console.log(`  结果: ${shouldTrigger ? '触发' : '跳过'}`);
        
        return shouldTrigger;
    }

    /**
     * 强制触发任务反思（用于补救）
     */
    async forceTriggerReflection(taskId) {
        console.log(`[TaskCompletionHook] 🔄 强制触发任务反思: ${taskId}`);
        
        try {
            const result = await this.flow.onTaskCompleted(taskId);
            return result;
        } catch (error) {
            console.error(`[TaskCompletionHook] 强制触发反思失败:`, error.message);
            return null;
        }
    }
}

module.exports = TaskCompletionHook;