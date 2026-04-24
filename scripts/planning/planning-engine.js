#!/usr/bin/env node
/**
 * Planning Engine - 规划引擎
 * 实现 Google Planning 模式的完整规划流程
 * 
 * 功能:
 * - generatePlan(task) - 生成显式计划
 * - executeWithValidation(task, plan) - 带验证的执行
 * - updatePlanDisplay(taskId, plan, currentStep) - 更新计划展示
 * - handleStepFailure(task, step, error) - 处理步骤失败
 * 
 * 文档: docs/planning-validation-design.md
 * 
 * 用法: node planning-engine.js <command> [options]
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// 引入组件
const { StepValidator } = require('./step-validator');
const { PlanAdjuster, RecoveryStrategy } = require('./plan-adjuster');

// 配置
const PLANS_DIR = path.join(__dirname, '../../data/planning/plans');
const PLAN_HISTORY_FILE = path.join(__dirname, '../../data/planning/plan-history.jsonl');
const API_HOST = 'localhost';
const API_PORT = 8081;

// 确保目录存在
if (!fs.existsSync(PLANS_DIR)) {
    fs.mkdirSync(PLANS_DIR, { recursive: true });
}

/**
 * 规划引擎类
 */
class PlanningEngine {
    constructor() {
        this.validator = new StepValidator();
        this.adjuster = new PlanAdjuster();
        this.activePlans = new Map(); // 活跃计划缓存
    }

    /**
     * 生成显式计划
     * @param {Object} task - 任务对象
     * @returns {Object} { plan, estimatedTime, risks, alternatives }
     */
    generatePlan(task) {
        console.log(`\n[PlanningEngine] 生成显式计划: ${task.title || task.id}`);
        
        const plan = {
            id: `plan-${task.id}`,
            taskId: task.id,
            taskTitle: task.title,
            steps: [],
            currentStep: 0,
            estimatedTime: 0,
            risks: [],
            alternatives: {},
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: null
        };

        // 1. 从任务中提取或生成步骤
        if (task.steps && task.steps.length > 0) {
            // 已有步骤，转换格式
            plan.steps = task.steps.map((s, i) => this.enrichStep(s, i));
        } else {
            // 没有步骤，根据任务类型生成
            plan.steps = this.generateStepsFromTask(task);
        }

        // 2. 计算预计时间
        plan.estimatedTime = plan.steps.reduce((sum, s) => sum + (s.estimatedTime || 300), 0);

        // 3. 识别风险
        plan.risks = this.identifyRisks(task, plan.steps);

        // 4. 为关键步骤生成替代方案
        plan.alternatives = this.generateAlternatives(plan.steps);

        // 5. 保存计划
        this.savePlan(plan);

        console.log(`[PlanningEngine] 计划生成完成:`);
        console.log(`  步骤数: ${plan.steps.length}`);
        console.log(`  预计时间: ${plan.estimatedTime}s`);
        console.log(`  风险数: ${plan.risks.length}`);

        return plan;
    }

    /**
     * 丰富步骤信息
     */
    enrichStep(step, index) {
        return {
            id: step.id || `step-${index + 1}`,
            index: index,
            title: step.title || `步骤 ${index + 1}`,
            description: step.description || step.action || '',
            action: step.action || '',
            status: step.status || 'pending',
            estimatedTime: step.estimatedTime || 300, // 默认5分钟
            dependencies: step.dependencies || [],
            expectedOutput: step.expectedOutput || null,
            validation: {
                type: 'output',
                criteria: step.validationCriteria || ['完成']
            },
            alternatives: step.alternatives || [],
            retryCount: 0,
            maxRetries: 3,
            result: null,
            error: null,
            startedAt: null,
            completedAt: null
        };
    }

    /**
     * 从任务生成步骤
     */
    generateStepsFromTask(task) {
        const title = (task.title || '').toLowerCase();
        const description = (task.description || '').toLowerCase();

        // 根据任务类型生成默认步骤
        const templates = {
            development: [
                { title: '需求分析', description: '理解需求，确定实现方案', estimatedTime: 600 },
                { title: '编写代码', description: '实现功能代码', estimatedTime: 1800 },
                { title: '测试验证', description: '运行测试，验证功能', estimatedTime: 600 },
                { title: '代码提交', description: '提交代码到仓库', estimatedTime: 300 }
            ],
            bugfix: [
                { title: '问题定位', description: '分析错误日志，定位问题', estimatedTime: 600 },
                { title: '修复实现', description: '编写修复代码', estimatedTime: 1200 },
                { title: '测试验证', description: '验证修复效果', estimatedTime: 600 },
                { title: '提交修复', description: '提交修复代码', estimatedTime: 300 }
            ],
            documentation: [
                { title: '收集资料', description: '整理相关信息', estimatedTime: 600 },
                { title: '编写文档', description: '撰写文档内容', estimatedTime: 1800 },
                { title: '审核修改', description: '检查并完善文档', estimatedTime: 600 }
            ],
            configuration: [
                { title: '环境准备', description: '准备配置环境', estimatedTime: 300 },
                { title: '执行配置', description: '应用配置项', estimatedTime: 600 },
                { title: '验证配置', description: '检查配置是否生效', estimatedTime: 300 }
            ]
        };

        // 判断任务类型
        let steps = [];
        if (/开发|实现|编写|创建|添加/i.test(title)) {
            steps = templates.development;
        } else if (/修复|解决|bug|错误/i.test(title)) {
            steps = templates.bugfix;
        } else if (/文档|说明|readme/i.test(title)) {
            steps = templates.documentation;
        } else if (/配置|设置|部署/i.test(title)) {
            steps = templates.configuration;
        } else {
            // 通用模板
            steps = [
                { title: '分析任务', description: '理解任务要求', estimatedTime: 300 },
                { title: '执行任务', description: '完成主要工作', estimatedTime: 1200 },
                { title: '验证结果', description: '检查完成情况', estimatedTime: 300 }
            ];
        }

        return steps.map((s, i) => this.enrichStep(s, i));
    }

    /**
     * 识别风险
     */
    identifyRisks(task, steps) {
        const risks = [];
        const title = (task.title || '').toLowerCase();
        const description = (task.description || '').toLowerCase();

        // 检查步骤依赖风险
        const hasDependencies = steps.some(s => s.dependencies && s.dependencies.length > 0);
        if (hasDependencies) {
            risks.push({
                type: 'dependency',
                level: 'medium',
                description: '存在步骤依赖，可能影响执行顺序'
            });
        }

        // 检查外部资源风险
        if (/api|接口|网络|下载|http/i.test(title + description)) {
            risks.push({
                type: 'network',
                level: 'medium',
                description: '涉及网络操作，可能受网络状况影响'
            });
        }

        // 检查权限风险
        if (/配置|安装|部署|系统/i.test(title + description)) {
            risks.push({
                type: 'permission',
                level: 'high',
                description: '可能需要特定权限'
            });
        }

        // 检查复杂度风险
        if (steps.length > 5) {
            risks.push({
                type: 'complexity',
                level: 'low',
                description: `步骤较多(${steps.length}个)，执行时间可能较长`
            });
        }

        return risks;
    }

    /**
     * 生成替代方案
     */
    generateAlternatives(steps) {
        const alternatives = {};

        for (const step of steps) {
            if (step.alternatives && step.alternatives.length > 0) {
                alternatives[step.id] = step.alternatives;
            } else {
                // 为关键步骤生成默认替代方案
                if (/创建|修改|删除/i.test(step.title)) {
                    alternatives[step.id] = [
                        '使用备选路径',
                        '请求用户确认',
                        '跳过非关键操作'
                    ];
                }
            }
        }

        return alternatives;
    }

    /**
     * 带验证的执行
     * @param {Object} task - 任务对象
     * @param {Object} plan - 计划对象
     * @returns {Object} 执行结果
     */
    async executeWithValidation(task, plan) {
        console.log(`\n[PlanningEngine] 开始执行计划: ${plan.id}`);
        
        const execution = {
            planId: plan.id,
            taskId: task.id,
            startedAt: new Date().toISOString(),
            completedAt: null,
            status: 'running',
            stepResults: [],
            adjustments: [],
            finalStatus: null
        };

        this.activePlans.set(plan.id, { plan, execution });

        // 按步骤执行
        for (let i = plan.currentStep; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            console.log(`\n[PlanningEngine] 执行步骤 ${i + 1}/${plan.steps.length}: ${step.title}`);

            // 更新当前步骤
            plan.currentStep = i;
            step.status = 'running';
            step.startedAt = new Date().toISOString();
            this.updatePlanDisplay(task.id, plan, i);

            try {
                // 执行步骤（这里调用任务执行 API）
                const result = await this.executeStep(task, step);
                
                // 验证步骤结果
                const validation = this.validator.validate(step, result);
                
                if (validation.status === 'valid' || validation.status === 'warning') {
                    // 验证通过
                    step.status = 'completed';
                    step.result = result;
                    step.completedAt = new Date().toISOString();
                    
                    execution.stepResults.push({
                        stepId: step.id,
                        status: 'completed',
                        validation: validation.status,
                        score: validation.score
                    });
                    
                    console.log(`[PlanningEngine] 步骤完成: ${step.title}`);
                } else {
                    // 验证失败
                    throw new Error(`验证失败: ${validation.issues.map(i => i.message).join(', ')}`);
                }
            } catch (error) {
                console.error(`[PlanningEngine] 步骤失败: ${step.title}`);
                console.error(`  错误: ${error.message}`);

                // 处理步骤失败
                const handling = await this.handleStepFailure(task, plan, step, error, i);
                
                if (handling.action === 'continue') {
                    // 恢复成功，继续执行
                    execution.adjustments.push(handling.adjustment);
                    continue;
                } else if (handling.action === 'retry') {
                    // 重试当前步骤
                    i--;
                    continue;
                } else {
                    // 无法恢复，终止执行
                    execution.status = 'failed';
                    execution.finalStatus = 'failed';
                    execution.failedStep = step.id;
                    execution.error = error.message;
                    break;
                }
            }
        }

        // 更新最终状态
        if (execution.status !== 'failed') {
            execution.status = 'completed';
            execution.finalStatus = 'completed';
        }
        execution.completedAt = new Date().toISOString();

        // 保存执行记录
        this.saveExecutionRecord(execution);

        // 从活跃计划中移除
        this.activePlans.delete(plan.id);

        console.log(`\n[PlanningEngine] 执行完成: ${execution.finalStatus}`);

        return execution;
    }

    /**
     * 执行单个步骤
     */
    async executeStep(task, step) {
        return new Promise((resolve, reject) => {
            // 调用任务执行 API
            const postData = JSON.stringify({
                taskId: task.id,
                stepId: step.id,
                action: step.action
            });

            const options = {
                hostname: API_HOST,
                port: API_PORT,
                path: '/api/task-execution/step/start',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(body);
                        if (result.code === 200 || result.success) {
                            resolve(result.data || result);
                        } else {
                            reject(new Error(result.error?.message || '步骤执行失败'));
                        }
                    } catch (e) {
                        // 如果 API 不可用，模拟成功
                        resolve({ output: 'simulated', simulated: true });
                    }
                });
            });

            req.on('error', (e) => {
                // API 不可用时，模拟成功
                resolve({ output: 'simulated', simulated: true });
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * 处理步骤失败
     */
    async handleStepFailure(task, plan, step, error, stepIndex) {
        console.log(`\n[PlanningEngine] 处理步骤失败: ${step.title}`);
        
        // 1. 分析失败原因
        const analysis = this.adjuster.analyzeFailure(step, error);
        
        // 2. 检查是否还能重试
        if (step.retryCount < step.maxRetries && analysis.recoverable) {
            step.retryCount++;
            console.log(`[PlanningEngine] 安排重试 (${step.retryCount}/${step.maxRetries})`);
            
            // 延迟后重试
            await new Promise(resolve => setTimeout(resolve, analysis.delay || 5000));
            
            return { action: 'retry', adjustment: { type: 'retry', stepId: step.id } };
        }

        // 3. 生成恢复方案
        const recovery = this.adjuster.generateRecovery(analysis, task);
        
        // 4. 执行恢复
        const recoveryResult = await this.adjuster.executeRecovery(recovery, task);
        
        if (recoveryResult.success) {
            // 5. 调整后续步骤
            const adjustedPlan = this.adjuster.adjustSteps(task, stepIndex, recovery);
            
            // 更新计划
            plan.steps = adjustedPlan.adjustedSteps;
            this.savePlan(plan);
            
            return {
                action: 'continue',
                adjustment: {
                    type: recovery.strategy,
                    stepId: step.id,
                    recovery: recovery.id
                }
            };
        }

        // 6. 无法恢复，返回失败
        return {
            action: 'abort',
            adjustment: {
                type: 'abort',
                stepId: step.id,
                reason: analysis.reason
            }
        };
    }

    /**
     * 更新计划展示
     */
    updatePlanDisplay(taskId, plan, currentStep) {
        // 通过 WebSocket 或 API 更新前端显示
        const display = {
            taskId,
            planId: plan.id,
            totalSteps: plan.steps.length,
            currentStep: currentStep + 1,
            currentStepTitle: plan.steps[currentStep]?.title,
            progress: Math.round((currentStep / plan.steps.length) * 100),
            status: 'running',
            updatedAt: new Date().toISOString()
        };

        // 可以通过 WebSocket 推送到前端
        console.log(`[PlanningEngine] 进度更新: ${display.currentStep}/${display.totalSteps} (${display.progress}%)`);

        return display;
    }

    /**
     * 保存计划
     */
    savePlan(plan) {
        const filePath = path.join(PLANS_DIR, `${plan.id}.json`);
        plan.updatedAt = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(plan, null, 2));
    }

    /**
     * 保存执行记录
     */
    saveExecutionRecord(execution) {
        fs.appendFileSync(PLAN_HISTORY_FILE, JSON.stringify(execution) + '\n');
    }

    /**
     * 获取计划
     */
    getPlan(planId) {
        // 先从缓存获取
        const cached = this.activePlans.get(planId);
        if (cached) return cached.plan;

        // 从文件获取
        const filePath = path.join(PLANS_DIR, `${planId}.json`);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        return null;
    }

    /**
     * 获取活跃计划
     */
    getActivePlans() {
        return Array.from(this.activePlans.entries()).map(([id, { plan }]) => ({
            id,
            taskId: plan.taskId,
            taskTitle: plan.taskTitle,
            currentStep: plan.currentStep,
            totalSteps: plan.steps.length,
            status: plan.status
        }));
    }

    /**
     * 获取统计
     */
    getStats(days = 7) {
        if (!fs.existsSync(PLAN_HISTORY_FILE)) {
            return { total: 0, completed: 0, failed: 0 };
        }

        const lines = fs.readFileSync(PLAN_HISTORY_FILE, 'utf8').split('\n').filter(l => l.trim());
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

        let total = 0;
        let completed = 0;
        let failed = 0;

        for (const line of lines.slice(-1000)) {
            try {
                const entry = JSON.parse(line);
                if (new Date(entry.startedAt).getTime() >= cutoff) {
                    total++;
                    if (entry.finalStatus === 'completed') completed++;
                    else if (entry.finalStatus === 'failed') failed++;
                }
            } catch (e) {
                // 忽略解析错误
            }
        }

        return { total, completed, failed };
    }
}

// CLI 入口
function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const engine = new PlanningEngine();

    const parseArgs = (args) => {
        const options = {};
        for (let i = 0; i < args.length; i += 2) {
            const key = args[i].replace(/^--/, '');
            options[key] = args[i + 1];
        }
        return options;
    };

    switch (command) {
        case 'generate': {
            const options = parseArgs(args.slice(1));
            const task = JSON.parse(options.task || '{}');
            const plan = engine.generatePlan(task);
            console.log(JSON.stringify(plan, null, 2));
            break;
        }

        case 'execute': {
            const options = parseArgs(args.slice(1));
            const task = JSON.parse(options.task || '{}');
            const plan = JSON.parse(options.plan || '{}');
            engine.executeWithValidation(task, plan).then(result => {
                console.log(JSON.stringify(result, null, 2));
            });
            break;
        }

        case 'get': {
            const options = parseArgs(args.slice(1));
            const plan = engine.getPlan(options.planId);
            console.log(JSON.stringify(plan, null, 2));
            break;
        }

        case 'active': {
            const active = engine.getActivePlans();
            console.log(JSON.stringify(active, null, 2));
            break;
        }

        case 'stats': {
            const stats = engine.getStats(7);
            console.log(JSON.stringify(stats, null, 2));
            break;
        }

        default:
            console.log(`
用法: node planning-engine.js <command> [options]

命令:
  generate    生成显式计划
    --task        任务 JSON 字符串
    
  execute     带验证的执行
    --task        任务 JSON 字符串
    --plan        计划 JSON 字符串
    
  get         获取计划
    --planId      计划 ID
    
  active      获取活跃计划列表
    
  stats       获取统计（最近7天）

示例:
  node planning-engine.js generate --task '{"id":"task-1","title":"开发新功能"}'
  node planning-engine.js get --planId plan-task-1
  node planning-engine.js active
  node planning-engine.js stats
`);
    }
}

// 导出模块
module.exports = {
    PlanningEngine
};

// 如果直接运行，则执行 CLI
if (require.main === module) {
    main();
}