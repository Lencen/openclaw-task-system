#!/usr/bin/env node
/**
 * Step Validator - 步骤级验证器
 * 实现 Google Planning 模式的步骤验证机制
 * 
 * 功能:
 * - validate(step, result) - 验证步骤执行结果
 * - checkOutput(expected, actual) - 检查输出
 * - checkSideEffects(step, before, after) - 检查副作用
 * - checkDependencies(step) - 检查依赖
 * 
 * 文档: docs/planning-validation-design.md
 * 
 * 用法: node step-validator.js <command> [options]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 配置
const VALIDATION_RULES_DIR = path.join(__dirname, '../../data/planning/validation-rules');
const VALIDATION_HISTORY_FILE = path.join(__dirname, '../../data/planning/validation-history.jsonl');

// 确保目录存在
if (!fs.existsSync(VALIDATION_RULES_DIR)) {
    fs.mkdirSync(VALIDATION_RULES_DIR, { recursive: true });
}

/**
 * 验证类型枚举
 */
const ValidationType = {
    OUTPUT: 'output',           // 输出验证
    STATE: 'state',             // 状态验证
    DEPENDENCY: 'dependency',   // 依赖验证
    SIDE_EFFECT: 'side-effect'  // 副作用验证
};

/**
 * 验证状态枚举
 */
const ValidationStatus = {
    VALID: 'valid',
    INVALID: 'invalid',
    WARNING: 'warning',
    SKIP: 'skip'
};

/**
 * 步骤验证器类
 */
class StepValidator {
    constructor() {
        this.rules = this.loadDefaultRules();
    }

    /**
     * 加载默认验证规则
     */
    loadDefaultRules() {
        return {
            // 文件操作规则
            'file-create': {
                type: ValidationType.OUTPUT,
                checks: [
                    { name: 'file_exists', fn: (result) => fs.existsSync(result.output) },
                    { name: 'file_not_empty', fn: (result) => fs.existsSync(result.output) && fs.statSync(result.output).size > 0 }
                ]
            },
            'file-modify': {
                type: ValidationType.OUTPUT,
                checks: [
                    { name: 'file_exists', fn: (result) => fs.existsSync(result.output) },
                    { name: 'content_changed', fn: (result) => result.changed === true }
                ]
            },
            'file-delete': {
                type: ValidationType.OUTPUT,
                checks: [
                    { name: 'file_not_exists', fn: (result) => !fs.existsSync(result.output) }
                ]
            },
            // API 操作规则
            'api-call': {
                type: ValidationType.OUTPUT,
                checks: [
                    { name: 'response_ok', fn: (result) => result.status >= 200 && result.status < 300 },
                    { name: 'has_data', fn: (result) => result.data !== undefined }
                ]
            },
            // 命令执行规则
            'command-exec': {
                type: ValidationType.OUTPUT,
                checks: [
                    { name: 'exit_code_zero', fn: (result) => result.exitCode === 0 },
                    { name: 'no_error_output', fn: (result) => !result.stderr || result.stderr.length === 0 }
                ]
            },
            // 通用规则
            'general': {
                type: ValidationType.OUTPUT,
                checks: [
                    { name: 'has_output', fn: (result) => result.output !== undefined && result.output !== null }
                ]
            }
        };
    }

    /**
     * 验证步骤执行结果
     * @param {Object} step - 步骤对象
     * @param {Object} result - 执行结果
     * @returns {Object} { status, issues, suggestions, score }
     */
    validate(step, result) {
        console.log(`\n[StepValidator] 开始验证步骤: ${step.title || step.id}`);
        
        const validationResult = {
            stepId: step.id,
            stepTitle: step.title,
            timestamp: new Date().toISOString(),
            status: ValidationStatus.VALID,
            issues: [],
            suggestions: [],
            score: 10,
            checks: []
        };

        // 1. 确定验证规则
        const ruleKey = this.determineRuleKey(step);
        const rule = this.rules[ruleKey] || this.rules['general'];
        
        console.log(`[StepValidator] 使用规则: ${ruleKey}`);

        // 2. 执行验证检查
        for (const check of rule.checks) {
            try {
                const checkResult = check.fn(result);
                const checkEntry = {
                    name: check.name,
                    passed: checkResult,
                    message: checkResult ? '通过' : '未通过'
                };
                
                validationResult.checks.push(checkEntry);
                
                if (!checkResult) {
                    validationResult.issues.push({
                        type: 'check_failed',
                        check: check.name,
                        message: `检查项 "${check.name}" 未通过`
                    });
                    validationResult.score -= 2;
                }
            } catch (err) {
                validationResult.checks.push({
                    name: check.name,
                    passed: false,
                    message: `检查异常: ${err.message}`
                });
                validationResult.issues.push({
                    type: 'check_error',
                    check: check.name,
                    message: err.message
                });
                validationResult.score -= 1;
            }
        }

        // 3. 检查依赖
        const dependencyResult = this.checkDependencies(step);
        if (!dependencyResult.valid) {
            validationResult.issues.push(...dependencyResult.issues);
            validationResult.score -= 3;
        }

        // 4. 检查副作用（如果提供了 before/after）
        if (step.checkSideEffects) {
            const sideEffectResult = this.checkSideEffects(step, result.before, result.after);
            if (sideEffectResult.hasUnexpectedEffects) {
                validationResult.issues.push(...sideEffectResult.issues);
                validationResult.suggestions.push(...sideEffectResult.suggestions);
                validationResult.score -= 2;
            }
        }

        // 5. 确定最终状态
        if (validationResult.issues.length === 0) {
            validationResult.status = ValidationStatus.VALID;
        } else if (validationResult.score < 5) {
            validationResult.status = ValidationStatus.INVALID;
        } else {
            validationResult.status = ValidationStatus.WARNING;
        }

        // 6. 生成建议
        validationResult.suggestions.push(...this.generateSuggestions(validationResult));

        // 7. 记录验证历史
        this.logValidation(validationResult);

        console.log(`[StepValidator] 验证完成: ${validationResult.status}, 评分: ${validationResult.score}/10`);
        validationResult.issues.forEach(issue => {
            console.log(`  - ${issue.type}: ${issue.message}`);
        });

        return validationResult;
    }

    /**
     * 确定使用的规则键
     */
    determineRuleKey(step) {
        const title = (step.title || '').toLowerCase();
        const action = (step.action || '').toLowerCase();
        const combined = title + ' ' + action;

        if (/创建|新建|create|new/i.test(combined) && /文件|file/i.test(combined)) {
            return 'file-create';
        }
        if (/修改|更新|modify|update/i.test(combined) && /文件|file/i.test(combined)) {
            return 'file-modify';
        }
        if (/删除|移除|delete|remove/i.test(combined) && /文件|file/i.test(combined)) {
            return 'file-delete';
        }
        if (/api|接口|请求|request/i.test(combined)) {
            return 'api-call';
        }
        if (/命令|执行|command|exec|run/i.test(combined)) {
            return 'command-exec';
        }

        return 'general';
    }

    /**
     * 检查输出是否符合预期
     * @param {Object} expected - 预期输出
     * @param {Object} actual - 实际输出
     * @returns {Object} { match: boolean, differences: [] }
     */
    checkOutput(expected, actual) {
        const result = {
            match: true,
            differences: []
        };

        // 检查类型
        if (typeof expected !== typeof actual) {
            result.match = false;
            result.differences.push({
                field: 'type',
                expected: typeof expected,
                actual: typeof actual
            });
            return result;
        }

        // 对象比较
        if (typeof expected === 'object' && expected !== null) {
            const expectedKeys = Object.keys(expected);
            const actualKeys = Object.keys(actual);

            // 检查缺失字段
            for (const key of expectedKeys) {
                if (!(key in actual)) {
                    result.match = false;
                    result.differences.push({
                        field: key,
                        expected: expected[key],
                        actual: undefined,
                        type: 'missing'
                    });
                } else if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) {
                    result.match = false;
                    result.differences.push({
                        field: key,
                        expected: expected[key],
                        actual: actual[key],
                        type: 'mismatch'
                    });
                }
            }

            // 检查多余字段
            for (const key of actualKeys) {
                if (!(key in expected)) {
                    result.differences.push({
                        field: key,
                        expected: undefined,
                        actual: actual[key],
                        type: 'extra'
                    });
                }
            }
        } else {
            // 简单值比较
            if (expected !== actual) {
                result.match = false;
                result.differences.push({
                    field: 'value',
                    expected,
                    actual
                });
            }
        }

        return result;
    }

    /**
     * 检查步骤是否有意外副作用
     * @param {Object} step - 步骤对象
     * @param {Object} before - 执行前状态
     * @param {Object} after - 执行后状态
     * @returns {Object} { hasUnexpectedEffects, issues, suggestions }
     */
    checkSideEffects(step, before, after) {
        const result = {
            hasUnexpectedEffects: false,
            issues: [],
            suggestions: []
        };

        if (!before || !after) {
            return result;
        }

        // 检查文件变化
        if (before.files && after.files) {
            const beforeFiles = new Set(before.files);
            const afterFiles = new Set(after.files);

            // 新增文件
            for (const file of afterFiles) {
                if (!beforeFiles.has(file)) {
                    const isExpected = step.expectedFiles && step.expectedFiles.includes(file);
                    if (!isExpected) {
                        result.hasUnexpectedEffects = true;
                        result.issues.push({
                            type: 'unexpected_file_created',
                            file,
                            message: `意外创建文件: ${file}`
                        });
                    }
                }
            }

            // 删除文件
            for (const file of beforeFiles) {
                if (!afterFiles.has(file)) {
                    const isExpected = step.deletedFiles && step.deletedFiles.includes(file);
                    if (!isExpected) {
                        result.hasUnexpectedEffects = true;
                        result.issues.push({
                            type: 'unexpected_file_deleted',
                            file,
                            message: `意外删除文件: ${file}`
                        });
                    }
                }
            }
        }

        // 检查进程变化
        if (before.processes && after.processes) {
            const newProcesses = after.processes.filter(p => !before.processes.includes(p));
            for (const proc of newProcesses) {
                result.issues.push({
                    type: 'new_process',
                    process: proc,
                    message: `启动新进程: ${proc}`
                });
                result.suggestions.push({
                    type: 'cleanup',
                    message: `确保在任务完成后清理进程: ${proc}`
                });
            }
        }

        return result;
    }

    /**
     * 检查步骤依赖是否满足
     * @param {Object} step - 步骤对象
     * @returns {Object} { valid: boolean, issues: [] }
     */
    checkDependencies(step) {
        const result = {
            valid: true,
            issues: []
        };

        if (!step.dependencies || step.dependencies.length === 0) {
            return result;
        }

        for (const dep of step.dependencies) {
            // 文件依赖
            if (dep.type === 'file') {
                if (!fs.existsSync(dep.path)) {
                    result.valid = false;
                    result.issues.push({
                        type: 'dependency_missing',
                        dependency: dep,
                        message: `依赖文件不存在: ${dep.path}`
                    });
                }
            }

            // 环境变量依赖
            if (dep.type === 'env') {
                if (!process.env[dep.name]) {
                    result.valid = false;
                    result.issues.push({
                        type: 'dependency_missing',
                        dependency: dep,
                        message: `环境变量未设置: ${dep.name}`
                    });
                }
            }

            // API 依赖
            if (dep.type === 'api') {
                try {
                    execSync(`curl -s -o /dev/null -w "%{http_code}" ${dep.url}`, { timeout: 5000 });
                } catch (err) {
                    result.valid = false;
                    result.issues.push({
                        type: 'dependency_unreachable',
                        dependency: dep,
                        message: `API 不可达: ${dep.url}`
                    });
                }
            }
        }

        return result;
    }

    /**
     * 生成改进建议
     */
    generateSuggestions(validationResult) {
        const suggestions = [];

        for (const issue of validationResult.issues) {
            switch (issue.type) {
                case 'check_failed':
                    suggestions.push({
                        type: 'retry',
                        message: `建议重试步骤或检查参数`
                    });
                    break;
                case 'dependency_missing':
                    suggestions.push({
                        type: 'fix_dependency',
                        message: `先解决依赖问题: ${issue.message}`
                    });
                    break;
                case 'unexpected_file_created':
                    suggestions.push({
                        type: 'cleanup',
                        message: `检查是否需要清理意外创建的文件`
                    });
                    break;
                default:
                    suggestions.push({
                        type: 'review',
                        message: `请检查: ${issue.message}`
                    });
            }
        }

        return suggestions;
    }

    /**
     * 记录验证历史
     */
    logValidation(validationResult) {
        const entry = {
            stepId: validationResult.stepId,
            stepTitle: validationResult.stepTitle,
            status: validationResult.status,
            score: validationResult.score,
            issueCount: validationResult.issues.length,
            timestamp: validationResult.timestamp
        };

        fs.appendFileSync(VALIDATION_HISTORY_FILE, JSON.stringify(entry) + '\n');
    }

    /**
     * 添加自定义验证规则
     */
    addRule(ruleKey, rule) {
        this.rules[ruleKey] = rule;
        console.log(`[StepValidator] 添加规则: ${ruleKey}`);
    }

    /**
     * 获取验证统计
     */
    getStats(days = 7) {
        if (!fs.existsSync(VALIDATION_HISTORY_FILE)) {
            return { total: 0, valid: 0, invalid: 0, warning: 0 };
        }

        const lines = fs.readFileSync(VALIDATION_HISTORY_FILE, 'utf8').split('\n').filter(l => l.trim());
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

        let total = 0;
        let valid = 0;
        let invalid = 0;
        let warning = 0;

        for (const line of lines.slice(-1000)) { // 最多统计最近 1000 条
            try {
                const entry = JSON.parse(line);
                if (new Date(entry.timestamp).getTime() >= cutoff) {
                    total++;
                    if (entry.status === ValidationStatus.VALID) valid++;
                    else if (entry.status === ValidationStatus.INVALID) invalid++;
                    else if (entry.status === ValidationStatus.WARNING) warning++;
                }
            } catch (e) {
                // 忽略解析错误
            }
        }

        return { total, valid, invalid, warning };
    }
}

// CLI 入口
function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const validator = new StepValidator();

    const parseArgs = (args) => {
        const options = {};
        for (let i = 0; i < args.length; i += 2) {
            const key = args[i].replace(/^--/, '');
            options[key] = args[i + 1];
        }
        return options;
    };

    switch (command) {
        case 'validate': {
            const options = parseArgs(args.slice(1));
            const step = JSON.parse(options.step || '{}');
            const result = JSON.parse(options.result || '{}');
            const validationResult = validator.validate(step, result);
            console.log(JSON.stringify(validationResult, null, 2));
            break;
        }

        case 'check-output': {
            const options = parseArgs(args.slice(1));
            const expected = JSON.parse(options.expected || '{}');
            const actual = JSON.parse(options.actual || '{}');
            const outputResult = validator.checkOutput(expected, actual);
            console.log(JSON.stringify(outputResult, null, 2));
            break;
        }

        case 'check-deps': {
            const options = parseArgs(args.slice(1));
            const step = JSON.parse(options.step || '{}');
            const depsResult = validator.checkDependencies(step);
            console.log(JSON.stringify(depsResult, null, 2));
            break;
        }

        case 'stats': {
            const stats = validator.getStats(7);
            console.log(JSON.stringify(stats, null, 2));
            break;
        }

        default:
            console.log(`
用法: node step-validator.js <command> [options]

命令:
  validate        验证步骤执行结果
    --step        步骤 JSON 字符串
    --result      执行结果 JSON 字符串
    
  check-output    检查输出是否符合预期
    --expected    预期输出 JSON
    --actual      实际输出 JSON
    
  check-deps      检查依赖是否满足
    --step        步骤 JSON 字符串
    
  stats           获取验证统计（最近7天）

示例:
  node step-validator.js validate --step '{"id":"step-1","title":"创建文件"}' --result '{"output":"/tmp/test.txt"}'
  node step-validator.js check-output --expected '{"a":1}' --actual '{"a":1,"b":2}'
  node step-validator.js stats
`);
    }
}

// 导出模块
module.exports = {
    StepValidator,
    ValidationType,
    ValidationStatus
};

// 如果直接运行，则执行 CLI
if (require.main === module) {
    main();
}