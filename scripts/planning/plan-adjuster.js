#!/usr/bin/env node
/**
 * Plan Adjuster - 动态重规划器
 * 实现 Google Planning 模式的动态调整机制
 * 
 * 功能:
 * - analyzeFailure(failedStep, error) - 分析失败原因
 * - generateRecovery(analysis, task) - 生成恢复方案
 * - adjustSteps(failedStepIndex, recovery) - 调整后续步骤
 * - executeRecovery(recovery) - 执行恢复方案
 * 
 * 文档: docs/planning-validation-design.md
 * 
 * 用法: node plan-adjuster.js <command> [options]
 */

const fs = require('fs');
const path = require('path');

// 配置
const RECOVERY_PLANS_DIR = path.join(__dirname, '../../data/planning/recovery-plans');
const ADJUSTMENT_HISTORY_FILE = path.join(__dirname, '../../data/planning/adjustment-history.jsonl');

// 确保目录存在
if (!fs.existsSync(RECOVERY_PLANS_DIR)) {
    fs.mkdirSync(RECOVERY_PLANS_DIR, { recursive: true });
}

/**
 * 恢复策略枚举
 */
const RecoveryStrategy = {
    RETRY: 'retry',                 // 重试当前步骤
    SKIP: 'skip',                   // 跳过当前步骤
    ALTERNATIVE: 'alternative',     // 使用替代方案
    ROLLBACK: 'rollback',           // 回滚并重新规划
    ESCALATE: 'escalate'            // 升级到人工处理
};

/**
 * 失败原因类型枚举
 */
const FailureReason = {
    TEMPORARY: 'temporary',         // 临时性错误（网络、资源）
    PERMISSION: 'permission',       // 权限问题
    DEPENDENCY: 'dependency',       // 依赖缺失
    LOGIC: 'logic',                 // 逻辑错误
    RESOURCE: 'resource',           // 资源不足
    TIMEOUT: 'timeout',             // 超时
    UNKNOWN: 'unknown'              // 未知错误
};

/**
 * 动态重规划器类
 */
class PlanAdjuster {
    constructor() {
        this.failurePatterns = this.loadFailurePatterns();
        this.recoveryStrategies = this.loadRecoveryStrategies();
    }

    /**
     * 加载失败模式
     */
    loadFailurePatterns() {
        return [
            // 网络错误
            {
                pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|网络/i,
                reason: FailureReason.TEMPORARY,
                recoverable: true,
                maxRetries: 3
            },
            // 权限错误
            {
                pattern: /EACCES|EPERM|permission|权限|denied/i,
                reason: FailureReason.PERMISSION,
                recoverable: true,
                maxRetries: 1
            },
            // 依赖错误
            {
                pattern: /Cannot find module|dependency|依赖|not found/i,
                reason: FailureReason.DEPENDENCY,
                recoverable: true,
                maxRetries: 1
            },
            // 资源错误
            {
                pattern: /ENOMEM|ENOSPC|memory|disk|空间|内存/i,
                reason: FailureReason.RESOURCE,
                recoverable: false,
                maxRetries: 0
            },
            // 超时错误
            {
                pattern: /timeout|超时|ETIMEDOUT/i,
                reason: FailureReason.TIMEOUT,
                recoverable: true,
                maxRetries: 2
            },
            // 逻辑错误
            {
                pattern: /TypeError|ReferenceError|SyntaxError|undefined|null/i,
                reason: FailureReason.LOGIC,
                recoverable: false,
                maxRetries: 0
            }
        ];
    }

    /**
     * 加载恢复策略
     */
    loadRecoveryStrategies() {
        return {
            [FailureReason.TEMPORARY]: {
                strategy: RecoveryStrategy.RETRY,
                delay: 5000, // 5秒后重试
                maxRetries: 3,
                fallbackStrategy: RecoveryStrategy.ESCALATE
            },
            [FailureReason.PERMISSION]: {
                strategy: RecoveryStrategy.ALTERNATIVE,
                alternatives: ['use-user-dir', 'request-permission', 'skip-step'],
                maxRetries: 1,
                fallbackStrategy: RecoveryStrategy.ESCALATE
            },
            [FailureReason.DEPENDENCY]: {
                strategy: RecoveryStrategy.ALTERNATIVE,
                alternatives: ['install-dependency', 'use-alternative', 'skip-step'],
                maxRetries: 1,
                fallbackStrategy: RecoveryStrategy.ESCALATE
            },
            [FailureReason.RESOURCE]: {
                strategy: RecoveryStrategy.ESCALATE,
                message: '资源不足，需要人工干预',
                maxRetries: 0
            },
            [FailureReason.TIMEOUT]: {
                strategy: RecoveryStrategy.RETRY,
                delay: 10000,
                maxRetries: 2,
                fallbackStrategy: RecoveryStrategy.SKIP
            },
            [FailureReason.LOGIC]: {
                strategy: RecoveryStrategy.ROLLBACK,
                maxRetries: 0,
                fallbackStrategy: RecoveryStrategy.ESCALATE
            },
            [FailureReason.UNKNOWN]: {
                strategy: RecoveryStrategy.ESCALATE,
                maxRetries: 0
            }
        };
    }

    /**
     * 分析失败原因
     * @param {Object} failedStep - 失败的步骤
     * @param {Error} error - 错误信息
     * @returns {Object} { reason, recoverable, analysis }
     */
    analyzeFailure(failedStep, error) {
        console.log(`\n[PlanAdjuster] 分析失败原因: ${failedStep.title || failedStep.id}`);
        
        const errorMessage = error.message || error.toString();
        const errorStack = error.stack || '';
        
        const analysis = {
            stepId: failedStep.id,
            stepTitle: failedStep.title,
            error: errorMessage,
            timestamp: new Date().toISOString(),
            reason: FailureReason.UNKNOWN,
            recoverable: false,
            maxRetries: 0,
            pattern: null,
            suggestions: []
        };

        // 匹配失败模式
        for (const pattern of this.failurePatterns) {
            if (pattern.pattern.test(errorMessage) || pattern.pattern.test(errorStack)) {
                analysis.reason = pattern.reason;
                analysis.recoverable = pattern.recoverable;
                analysis.maxRetries = pattern.maxRetries;
                analysis.pattern = pattern.pattern.source;
                break;
            }
        }

        // 获取对应的恢复策略
        const strategy = this.recoveryStrategies[analysis.reason];
        analysis.strategy = strategy.strategy;
        analysis.delay = strategy.delay || 0;
        analysis.fallbackStrategy = strategy.fallbackStrategy;

        // 生成建议
        analysis.suggestions = this.generateFailureSuggestions(analysis);

        console.log(`[PlanAdjuster] 分析结果:`);
        console.log(`  原因: ${analysis.reason}`);
        console.log(`  可恢复: ${analysis.recoverable}`);
        console.log(`  策略: ${analysis.strategy}`);
        console.log(`  最大重试: ${analysis.maxRetries}`);

        return analysis;
    }

    /**
     * 生成恢复方案
     * @param {Object} analysis - 失败分析
     * @param {Object} task - 任务对象
     * @returns {Object} { strategy, action, newSteps, estimatedDelay }
     */
    generateRecovery(analysis, task) {
        console.log(`\n[PlanAdjuster] 生成恢复方案`);
        
        const recovery = {
            id: `recovery-${Date.now()}`,
            stepId: analysis.stepId,
            strategy: analysis.strategy,
            action: null,
            newSteps: [],
            estimatedDelay: 0,
            fallbackStrategy: analysis.fallbackStrategy,
            createdAt: new Date().toISOString()
        };

        switch (analysis.strategy) {
            case RecoveryStrategy.RETRY:
                recovery.action = 'retry-current-step';
                recovery.estimatedDelay = analysis.delay || 5000;
                recovery.newSteps = [{
                    index: task.steps.findIndex(s => s.id === analysis.stepId),
                    action: 'retry',
                    reason: 'temporary failure',
                    delay: recovery.estimatedDelay
                }];
                break;

            case RecoveryStrategy.SKIP:
                recovery.action = 'skip-current-step';
                recovery.newSteps = [{
                    index: task.steps.findIndex(s => s.id === analysis.stepId),
                    action: 'skip',
                    reason: 'non-critical step failed'
                }];
                break;

            case RecoveryStrategy.ALTERNATIVE:
                recovery.action = 'use-alternative-step';
                const alternatives = this.recoveryStrategies[analysis.reason].alternatives || [];
                recovery.newSteps = this.generateAlternativeSteps(analysis, alternatives);
                recovery.estimatedDelay = 3000;
                break;

            case RecoveryStrategy.ROLLBACK:
                recovery.action = 'rollback-and-replan';
                recovery.newSteps = [{
                    index: 0,
                    action: 'rollback',
                    reason: 'critical failure'
                }];
                recovery.estimatedDelay = 10000;
                break;

            case RecoveryStrategy.ESCALATE:
                recovery.action = 'escalate-to-human';
                recovery.newSteps = [{
                    index: task.steps.findIndex(s => s.id === analysis.stepId),
                    action: 'pause',
                    reason: 'unable to auto-recover'
                }];
                break;
        }

        console.log(`[PlanAdjuster] 恢复方案:`);
        console.log(`  策略: ${recovery.strategy}`);
        console.log(`  动作: ${recovery.action}`);
        console.log(`  预计延迟: ${recovery.estimatedDelay}ms`);

        // 保存恢复方案
        this.saveRecoveryPlan(recovery);

        return recovery;
    }

    /**
     * 生成替代步骤
     */
    generateAlternativeSteps(analysis, alternatives) {
        const altSteps = [];

        for (let i = 0; i < alternatives.length; i++) {
            const alt = alternatives[i];
            let step = {
                index: i,
                action: 'alternative',
                type: alt,
                reason: `alternative option ${i + 1}`
            };

            // 根据替代类型生成具体步骤
            switch (alt) {
                case 'use-user-dir':
                    step.title = '使用用户目录';
                    step.description = '将操作切换到用户目录';
                    step.params = { path: '~/workspace' };
                    break;
                case 'request-permission':
                    step.title = '请求权限';
                    step.description = '向用户请求必要的权限';
                    step.params = { interactive: true };
                    break;
                case 'install-dependency':
                    step.title = '安装依赖';
                    step.description = '自动安装缺失的依赖';
                    step.params = { autoInstall: true };
                    break;
                case 'use-alternative':
                    step.title = '使用替代工具';
                    step.description = '使用备选工具完成任务';
                    step.params = { alternative: true };
                    break;
                case 'skip-step':
                    step.title = '跳过步骤';
                    step.description = '跳过非关键步骤';
                    step.params = { skip: true };
                    break;
            }

            altSteps.push(step);
        }

        return altSteps;
    }

    /**
     * 调整后续步骤
     * @param {Object} task - 任务对象
     * @param {number} failedStepIndex - 失败步骤索引
     * @param {Object} recovery - 恢复方案
     * @returns {Object} 调整后的计划
     */
    adjustSteps(task, failedStepIndex, recovery) {
        console.log(`\n[PlanAdjuster] 调整后续步骤`);
        
        const adjustedPlan = {
            taskId: task.id,
            originalSteps: [...task.steps],
            adjustedSteps: [],
            adjustments: [],
            adjustedAt: new Date().toISOString()
        };

        const steps = [...task.steps];

        // 根据恢复策略调整步骤
        switch (recovery.strategy) {
            case RecoveryStrategy.RETRY:
                // 重试：在失败步骤前插入延迟
                steps[failedStepIndex].retryCount = (steps[failedStepIndex].retryCount || 0) + 1;
                steps[failedStepIndex].delay = recovery.estimatedDelay;
                adjustedPlan.adjustments.push({
                    type: 'retry',
                    stepIndex: failedStepIndex,
                    reason: 'retry after temporary failure'
                });
                break;

            case RecoveryStrategy.SKIP:
                // 跳过：标记步骤为跳过
                steps[failedStepIndex].skipped = true;
                steps[failedStepIndex].skipReason = 'non-critical failure';
                adjustedPlan.adjustments.push({
                    type: 'skip',
                    stepIndex: failedStepIndex,
                    reason: 'non-critical step failed'
                });
                break;

            case RecoveryStrategy.ALTERNATIVE:
                // 替代：插入替代步骤
                const altSteps = recovery.newSteps.map((s, i) => ({
                    ...s,
                    id: `alt-${failedStepIndex}-${i}`,
                    originalStepId: steps[failedStepIndex].id,
                    isAlternative: true
                }));
                steps.splice(failedStepIndex, 1, ...altSteps);
                adjustedPlan.adjustments.push({
                    type: 'alternative',
                    stepIndex: failedStepIndex,
                    reason: 'use alternative approach',
                    alternativeCount: altSteps.length
                });
                break;

            case RecoveryStrategy.ROLLBACK:
                // 回滚：重置所有步骤状态
                for (const step of steps) {
                    step.status = 'pending';
                    step.result = null;
                }
                adjustedPlan.adjustments.push({
                    type: 'rollback',
                    reason: 'critical failure, restart from beginning'
                });
                break;

            case RecoveryStrategy.ESCALATE:
                // 升级：暂停任务
                task.status = 'paused';
                task.pausedReason = '需要人工干预';
                adjustedPlan.adjustments.push({
                    type: 'escalate',
                    reason: 'unable to auto-recover'
                });
                break;
        }

        adjustedPlan.adjustedSteps = steps;

        // 记录调整历史
        this.logAdjustment(adjustedPlan);

        console.log(`[PlanAdjuster] 调整完成:`);
        console.log(`  原始步骤数: ${adjustedPlan.originalSteps.length}`);
        console.log(`  调整后步骤数: ${adjustedPlan.adjustedSteps.length}`);
        console.log(`  调整类型: ${adjustedPlan.adjustments.map(a => a.type).join(', ')}`);

        return adjustedPlan;
    }

    /**
     * 执行恢复方案
     * @param {Object} recovery - 恢复方案
     * @param {Object} task - 任务对象
     * @returns {Object} 执行结果
     */
    async executeRecovery(recovery, task) {
        console.log(`\n[PlanAdjuster] 执行恢复方案: ${recovery.strategy}`);
        
        const result = {
            recoveryId: recovery.id,
            strategy: recovery.strategy,
            success: false,
            message: '',
            executedAt: new Date().toISOString()
        };

        try {
            switch (recovery.strategy) {
                case RecoveryStrategy.RETRY:
                    // 延迟后重试
                    await this.delay(recovery.estimatedDelay);
                    result.success = true;
                    result.message = `已安排重试，延迟 ${recovery.estimatedDelay}ms`;
                    break;

                case RecoveryStrategy.SKIP:
                    result.success = true;
                    result.message = '步骤已跳过';
                    break;

                case RecoveryStrategy.ALTERNATIVE:
                    result.success = true;
                    result.message = '替代步骤已插入';
                    break;

                case RecoveryStrategy.ROLLBACK:
                    result.success = true;
                    result.message = '任务已回滚，将重新开始';
                    break;

                case RecoveryStrategy.ESCALATE:
                    result.success = false;
                    result.message = '已升级到人工处理';
                    // 发送通知
                    await this.notifyHuman(recovery, task);
                    break;
            }
        } catch (err) {
            result.success = false;
            result.message = `执行恢复失败: ${err.message}`;
        }

        console.log(`[PlanAdjuster] 执行结果: ${result.success ? '成功' : '失败'}`);
        console.log(`  消息: ${result.message}`);

        return result;
    }

    /**
     * 生成失败建议
     */
    generateFailureSuggestions(analysis) {
        const suggestions = [];

        switch (analysis.reason) {
            case FailureReason.TEMPORARY:
                suggestions.push('检查网络连接');
                suggestions.push('确认目标服务是否可用');
                break;
            case FailureReason.PERMISSION:
                suggestions.push('检查文件/目录权限');
                suggestions.push('考虑使用用户目录');
                suggestions.push('请求管理员权限');
                break;
            case FailureReason.DEPENDENCY:
                suggestions.push('安装缺失的依赖');
                suggestions.push('检查依赖版本兼容性');
                break;
            case FailureReason.RESOURCE:
                suggestions.push('释放磁盘空间');
                suggestions.push('增加系统内存');
                break;
            case FailureReason.TIMEOUT:
                suggestions.push('增加超时时间');
                suggestions.push('检查网络延迟');
                break;
            case FailureReason.LOGIC:
                suggestions.push('检查代码逻辑');
                suggestions.push('验证输入参数');
                break;
        }

        return suggestions;
    }

    /**
     * 保存恢复方案
     */
    saveRecoveryPlan(recovery) {
        const filePath = path.join(RECOVERY_PLANS_DIR, `${recovery.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(recovery, null, 2));
    }

    /**
     * 记录调整历史
     */
    logAdjustment(adjustedPlan) {
        const entry = {
            taskId: adjustedPlan.taskId,
            adjustmentCount: adjustedPlan.adjustments.length,
            adjustments: adjustedPlan.adjustments,
            timestamp: adjustedPlan.adjustedAt
        };
        fs.appendFileSync(ADJUSTMENT_HISTORY_FILE, JSON.stringify(entry) + '\n');
    }

    /**
     * 延迟函数
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 通知人工处理
     */
    async notifyHuman(recovery, task) {
        console.log(`\n[PlanAdjuster] 🔔 需要人工干预!`);
        console.log(`  任务: ${task.title || task.id}`);
        console.log(`  步骤: ${recovery.stepId}`);
        console.log(`  策略: ${recovery.strategy}`);
        
        // 这里可以集成飞书通知或其他通知渠道
        // 暂时只输出日志
    }

    /**
     * 获取调整统计
     */
    getStats(days = 7) {
        if (!fs.existsSync(ADJUSTMENT_HISTORY_FILE)) {
            return { total: 0, byStrategy: {} };
        }

        const lines = fs.readFileSync(ADJUSTMENT_HISTORY_FILE, 'utf8').split('\n').filter(l => l.trim());
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

        const stats = {
            total: 0,
            byStrategy: {},
            successRate: 0
        };

        for (const line of lines.slice(-1000)) {
            try {
                const entry = JSON.parse(line);
                if (new Date(entry.timestamp).getTime() >= cutoff) {
                    stats.total++;
                    for (const adj of entry.adjustments) {
                        stats.byStrategy[adj.type] = (stats.byStrategy[adj.type] || 0) + 1;
                    }
                }
            } catch (e) {
                // 忽略解析错误
            }
        }

        return stats;
    }
}

// CLI 入口
function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const adjuster = new PlanAdjuster();

    const parseArgs = (args) => {
        const options = {};
        for (let i = 0; i < args.length; i += 2) {
            const key = args[i].replace(/^--/, '');
            options[key] = args[i + 1];
        }
        return options;
    };

    switch (command) {
        case 'analyze': {
            const options = parseArgs(args.slice(1));
            const step = JSON.parse(options.step || '{}');
            const error = new Error(options.error || 'Unknown error');
            const analysis = adjuster.analyzeFailure(step, error);
            console.log(JSON.stringify(analysis, null, 2));
            break;
        }

        case 'recover': {
            const options = parseArgs(args.slice(1));
            const analysis = JSON.parse(options.analysis || '{}');
            const task = JSON.parse(options.task || '{}');
            const recovery = adjuster.generateRecovery(analysis, task);
            console.log(JSON.stringify(recovery, null, 2));
            break;
        }

        case 'adjust': {
            const options = parseArgs(args.slice(1));
            const task = JSON.parse(options.task || '{}');
            const failedStepIndex = parseInt(options.index) || 0;
            const recovery = JSON.parse(options.recovery || '{}');
            const adjusted = adjuster.adjustSteps(task, failedStepIndex, recovery);
            console.log(JSON.stringify(adjusted, null, 2));
            break;
        }

        case 'stats': {
            const stats = adjuster.getStats(7);
            console.log(JSON.stringify(stats, null, 2));
            break;
        }

        default:
            console.log(`
用法: node plan-adjuster.js <command> [options]

命令:
  analyze     分析失败原因
    --step        步骤 JSON 字符串
    --error       错误消息
    
  recover     生成恢复方案
    --analysis    失败分析 JSON
    --task        任务 JSON
    
  adjust      调整后续步骤
    --task        任务 JSON
    --index       失败步骤索引
    --recovery    恢复方案 JSON
    
  stats       获取调整统计（最近7天）

示例:
  node plan-adjuster.js analyze --step '{"id":"step-1"}' --error "ECONNREFUSED"
  node plan-adjuster.js recover --analysis '{"reason":"temporary"}' --task '{"id":"task-1"}'
  node plan-adjuster.js stats
`);
    }
}

// 导出模块
module.exports = {
    PlanAdjuster,
    RecoveryStrategy,
    FailureReason
};

// 如果直接运行，则执行 CLI
if (require.main === module) {
    main();
}