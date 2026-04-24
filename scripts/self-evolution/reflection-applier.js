#!/usr/bin/env node
/**
 * Reflection Applier - 反思自动应用器
 * 实现 Reflection 模式的自动应用和用户通知机制
 * 
 * 功能:
 * - checkConflict(lesson) - 检查现有规则冲突
 * - canApply(reflection) - 判断是否可以自动应用
 * - apply(reflection, target) - 应用反思到目标文件
 * - notify(reflection) - 通知用户应用结果
 * 
 * 文档: projects/self-evolution-reflection-upgrade/proposal.md
 * 
 * 用法: node reflection-applier.js <command> [options]
 *       command: check | can-apply | apply | notify
 */

const path = require('path');
const fs = require('fs');

// 配置
const MEMORY_FILE = path.join(__dirname, '../../MEMORY.md');
const REFLECTIONS_DIR = path.join(__dirname, '../../data/self-evolution/reflections');
const CONFLICTS_DIR = path.join(__dirname, '../../data/self-evolution/conflicts');

// 确保目录存在
if (!fs.existsSync(REFLECTIONS_DIR)) {
    fs.mkdirSync(REFLECTIONS_DIR, { recursive: true });
}
if (!fs.existsSync(CONFLICTS_DIR)) {
    fs.mkdirSync(CONFLICTS_DIR, { recursive: true });
}

/**
 * 检查反思规则与现有规则的冲突
 * @param {string} lesson - 教训总结（要应用的规则）
 * @returns {Object} { hasConflict: boolean, conflicts: Array }
 */
async function checkConflict(lesson) {
    const conflicts = [];
    
    // 1. 从 MEMORY.md 提取现有规则
    const existingRules = await extractRulesFromMemory();
    
    // 2. 检查关键词冲突
    for (const rule of existingRules) {
        const conflict = isConflicting(lesson, rule);
        if (conflict) {
            conflicts.push({
                type: conflict,
                rule,
                lesson
            });
        }
    }
    
    const hasConflict = conflicts.length > 0;
    
    console.log(`[Applier] 冲突检测: ${hasConflict ? '发现冲突' : '无冲突'}, 冲突数: ${conflicts.length}`);
    conflicts.forEach(c => {
        console.log(`  - 冲突类型: ${c.type}`);
        console.log(`    现有规则: ${c.rule.substring(0, 50)}...`);
        console.log(`    新规则: ${c.lesson.substring(0, 50)}...`);
    });
    
    return {
        hasConflict,
        conflicts
    };
}

/**
 * 从 MEMORY.md 提取现有规则
 */
async function extractRulesFromMemory() {
    const rules = [];
    
    try {
        if (!fs.existsSync(MEMORY_FILE)) {
            return rules;
        }
        
        const content = fs.readFileSync(MEMORY_FILE, 'utf8');
        
        // 提取规则（包含"必须"、"禁止"、"不要"等关键词的行）
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            
            // 检测规则模式
            if (trimmed.length > 10 && (trimmed.includes('必须') || 
                trimmed.includes('禁止') || trimmed.includes('不要') || 
                trimmed.includes('不能') || trimmed.includes('禁止'))) {
                // 移除 Markdown 格式
                let rule = trimmed
                    .replace(/^#+\s*/, '')           // 移除标题标记
                    .replace(/[\*\_`]/g, '')         // 移除 Markdown 格式符号
                    .trim();
                
                if (rule.length > 5) {
                    rules.push(rule);
                }
            }
        }
        
        // 提取 AGENTS.md 中的规则
        const agentsFile = path.join(__dirname, '../../AGENTS.md');
        if (fs.existsSync(agentsFile)) {
            const agentsContent = fs.readFileSync(agentsFile, 'utf8');
            const agentLines = agentsContent.split('\n');
            for (const line of agentLines) {
                const trimmed = line.trim();
                if (trimmed.length > 10 && (trimmed.includes('必须') || 
                    trimmed.includes('禁止') || trimmed.includes('不要') || 
                    trimmed.includes('不能') || trimmed.includes('禁止'))) {
                    let rule = trimmed
                        .replace(/^#+\s*/, '')
                        .replace(/[\*\_`]/g, '')
                        .trim();
                    
                    if (rule.length > 5) {
                        rules.push(rule);
                    }
                }
            }
        }
        
    } catch (e) {
        console.warn(`[Applier] 读取 MEMORY.md 失败: ${e.message}`);
    }
    
    console.log(`[Applier] 提取到 ${rules.length} 条现有规则`);
    return rules;
}

/**
 * 判断两段规则是否冲突
 * @param {string} newLesson - 新规则
 * @param {string} existingRule - 现有规则
 * @returns {string|null} 冲突类型，null 表示不冲突
 */
function isConflicting(newLesson, existingRule) {
    // 统一转小写
    const newLower = newLesson.toLowerCase();
    const existingLower = existingRule.toLowerCase();
    
    // 定义否定词模式
    const negationPatterns = ['禁止', '不要', '不能', 'never', "don't", '无法', '不行'];
    const affirmationPatterns = ['必须', '需要', '应该', '要', 'ควร', 'must', 'need to', 'should'];
    
    // 检测否定词
    const hasNegationInNew = negationPatterns.some(p => newLower.includes(p.toLowerCase()));
    const hasNegationInExisting = negationPatterns.some(p => existingLower.includes(p.toLowerCase()));
    
    // 检测肯定词
    const hasAffirmationInNew = affirmationPatterns.some(p => newLower.includes(p.toLowerCase()));
    const hasAffirmationInExisting = affirmationPatterns.some(p => existingLower.includes(p.toLowerCase()));
    
    // 检测相同关键词
    const newKeywords = extractKeywords(newLesson);
    const existingKeywords = extractKeywords(existingRule);
    
    const commonKeywords = newKeywords.filter(k => existingKeywords.includes(k));
    
    // 冲突类型 1: 直接矛盾（一个说必须，一个说禁止，且有共同关键词）
    if (commonKeywords.length > 0) {
        if ((hasAffirmationInNew && hasNegationInExisting) || 
            (hasNegationInNew && hasAffirmationInExisting)) {
            return 'direct-contradiction';
        }
    }
    
    // 冲突类型 2: 语义冲突（关键词相似但方向相反）
    if (commonKeywords.length > 1) {
        if ((hasAffirmationInNew && hasNegationInExisting) || 
            (hasNegationInNew && hasAffirmationInExisting)) {
            return 'semantic-conflict';
        }
    }
    
    // 冲突类型 3: 覆盖冲突（新规则覆盖旧规则）
    if (newKeywords.some(k => existingKeywords.includes(k)) && 
        (hasAffirmationInNew === hasAffirmationInExisting || 
         hasNegationInNew === hasNegationInExisting)) {
        return 'overlap-conflict';
    }
    
    return null;
}

/**
 * 提取关键词（去停用词）
 */
function extractKeywords(text) {
    const stopWords = new Set([
        '的', '是', '在', '有', '和', '就', '都', '而', '及', '与',
        'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has',
        'for', 'of', 'in', 'on', 'to', 'at', 'by', 'from', 'as', 'into',
        '是', '的', '了', '着', '过', '吗', '呢', '吧', '啊', '呀', '嘛', '啦'
    ]);
    
    // 分词（简单按空格和常见分隔符）
    const words = text.split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/).filter(w => w.length > 2);
    
    // 过滤停用词
    return words.filter(w => !stopWords.has(w.toLowerCase()));
}

/**
 * 判断是否可以自动应用反思
 * @param {Object} reflection - 反思对象
 * @returns {Object} { canApply: boolean, reason: string }
 */
async function canApply(reflection) {
    const reason = [];
    
    // 1. 检查评分 (>= 8)
    if (!reflection.score || reflection.score < 8) {
        reason.push(`评分不足 (${reflection.score || 0} < 8)`);
    }
    
    // 2. 检查是否可改进 (improvable = false)
    if (reflection.improvable !== false) {
        reason.push(`反思仍可改进 (improvable = ${reflection.improvable !== false})`);
    }
    
    // 3. 检查冲突
    const conflictCheck = await checkConflict(reflection.lesson || '');
    if (conflictCheck.hasConflict) {
        reason.push(`检测到冲突 (${conflictCheck.conflicts.length} 项)`);
    }
    
    // 4. 检查是否已应用
    if (reflection.applied) {
        reason.push(`已应用 (${reflection.applied_to || 'unknown'})`);
    }
    
    const canApply = reason.length === 0;
    
    console.log(`[Applier] 自动应用判断: ${canApply ? '可以应用' : '不能应用'}`);
    reason.forEach(r => console.log(`  - ${r}`));
    
    return {
        canApply,
        reason
    };
}

/**
 * 应用反思到目标文件
 * @param {Object} reflection - 反思对象
 * @param {string} target - 目标文件路径
 * @returns {Object} { success: boolean, applied_to: string, error?: string }
 */
async function apply(reflection, target = 'auto') {
    console.log(`[Applier] 开始应用反思: ${reflection.id.substring(0, 12)}...`);
    
    // 1. 确定目标文件
    const targetFile = target === 'auto' ? MEMORY_FILE : target;
    console.log(`[Applier] 目标文件: ${targetFile}`);
    
    // 2. 检查冲突（防止应用冲突规则）
    const conflictCheck = await checkConflict(reflection.lesson || '');
    if (conflictCheck.hasConflict) {
        const errorMsg = `检测到冲突，无法自动应用`;
        console.log(`[Applier] 应用失败: ${errorMsg}`);
        
        // 记录冲突反思
        await markAsConflict(reflection, conflictCheck.conflicts);
        
        return {
            success: false,
            applied_to: null,
            error: errorMsg
        };
    }
    
    // 3. 读取目标文件内容
    let content = '';
    if (fs.existsSync(targetFile)) {
        content = fs.readFileSync(targetFile, 'utf8');
    }
    
    // 4. 构建应用内容
    const newRule = buildRuleContent(reflection);
    
    // 5. 应用反思（添加到文件末尾）
    const separator = '\n---\n\n';
    const updatedContent = content + separator + newRule;
    
    try {
        // 确保目录存在
        const dir = path.dirname(targetFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // 写入文件
        fs.writeFileSync(targetFile, updatedContent, 'utf8');
        
        console.log(`[Applier] 成功应用反思到: ${targetFile}`);
        
        // 6. 更新反思记录
        const updatedReflection = {
            ...reflection,
            applied: true,
            applied_to: targetFile,
            applied_at: new Date().toISOString()
        };
        
        await saveReflection(updatedReflection);
        
        return {
            success: true,
            applied_to: targetFile
        };
    } catch (e) {
        console.error(`[Applier] 应用失败: ${e.message}`);
        
        return {
            success: false,
            applied_to: null,
            error: e.message
        };
    }
}

/**
 * 构建规则内容
 */
function buildRuleContent(reflection) {
    const now = new Date().toISOString();
    
    let content = `## 反思规则 - ${reflection.id.substring(0, 8)}\n\n`;
    content += `**创建时间**: ${now}\n\n`;
    content += `**上下文**: ${reflection.context || '未知'}\n\n`;
    content += `**反思内容**: ${reflection.reflection || '无'}\n\n`;
    content += `**教训总结**: ${reflection.lesson || '无'}\n\n`;
    content += `**评分**: ${reflection.score}/10\n\n`;
    content += `**应用状态**: 已自动应用\n\n`;
    content += `---\n\n`;
    
    return content;
}

/**
 * 保存反思记录（更新 applied 状态）
 */
async function saveReflection(reflection) {
    const filePath = path.join(REFLECTIONS_DIR, `${reflection.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(reflection, null, 2));
    console.log(`[Applier] 已更新反思记录: ${filePath}`);
}

/**
 * 标记反思为冲突状态
 */
async function markAsConflict(reflection, conflicts) {
    const conflictFile = path.join(CONFLICTS_DIR, `${reflection.id}-conflict.json`);
    const conflictRecord = {
        reflection_id: reflection.id,
        conflicts,
        created_at: new Date().toISOString()
    };
    fs.writeFileSync(conflictFile, JSON.stringify(conflictRecord, null, 2));
    console.log(`[Applier] 冲突记录已保存: ${conflictFile}`);
}

/**
 * 通知用户应用结果
 * @param {Object} reflection - 反思对象
 * @param {Object} result - 应用结果 { success, applied_to, error? }
 * @returns {Object} { sent: boolean, message: string }
 */
async function notify(reflection, result) {
    const isSuccess = result.success;
    const appliedTo = result.applied_to || 'unknown';
    const errorMsg = result.error || 'unknown';
    
    // 构建通知内容
    let message = '';
    
    if (isSuccess) {
        message = `
✅ **反思已自动应用**

📝 **教训**: ${reflection.lesson || '无'}
📊 **评分**: ${reflection.score}/10
📤 **应用到**: ${appliedTo}

**查看详情**: 
- 反思记录: data/self-evolution/reflections/${reflection.id}.json
- 应用日志: data/self-evolution/apply-log.jsonl
`;
    } else {
        message = `
❌ **反思应用失败**

📝 **教训**: ${reflection.lesson || '无'}
❌ **错误**: ${errorMsg}

**冲突处理**:
- 已标记为"待确认"
- 可在 data/self-evolution/conflicts/${reflection.id}-conflict.json 查看详情
- 需要人工确认后手动应用
`;
    }
    
    // 1. 输出到控制台
    console.log('\n' + message);
    console.log('—'.repeat(60) + '\n');
    
    // 2. 记录到应用日志
    await logApplication(reflection, result);
    
    // 3. 返回通知结果
    return {
        sent: true,
        message
    };
}

/**
 * 记录反思应用日志
 */
async function logApplication(reflection, result) {
    const entry = {
        reflection_id: reflection.id,
        context: reflection.context,
        lesson: reflection.lesson,
        score: reflection.score,
        applied: result.success,
        applied_to: result.applied_to || null,
        error: result.error || null,
        timestamp: new Date().toISOString()
    };
    
    const logFile = path.join(__dirname, '../../data/self-evolution/apply-log.jsonl');
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    console.log(`[Applier] 应用日志已记录: ${logFile}`);
}

/**
 * 完整的应用流程（检查-应用-通知）
 * @param {Object} reflection - 反思对象
 * @param {string} target - 目标文件
 * @returns {Object} 完整流程结果
 */
async function applyWithNotification(reflection, target = 'auto') {
    console.log(`\n[Applier] 开始完整应用流程: ${reflection.id.substring(0, 12)}...`);
    
    // Step 1: 检查可以应用
    const canApplyResult = await canApply(reflection);
    if (!canApplyResult.canApply) {
        console.log(`[Applier] 无法自动应用反思`);
        return {
            step: 'can-apply',
            success: false,
            reason: canApplyResult.reason
        };
    }
    
    // Step 2: 应用反思
    const applyResult = await apply(reflection, target);
    if (!applyResult.success) {
        // Step 3: 通知用户应用失败
        await notify(reflection, applyResult);
        
        return {
            step: 'apply',
            success: false,
            error: applyResult.error
        };
    }
    
    // Step 3: 通知用户应用成功
    await notify(reflection, applyResult);
    
    console.log(`\n[Applier] 完整应用流程完成`);
    console.log(`  ID: ${reflection.id}`);
    console.log(`  应用到: ${applyResult.applied_to}`);
    console.log(`  评分: ${reflection.score}/10`);
    
    return {
        step: 'complete',
        success: true,
        applied_to: applyResult.applied_to
    };
}

// CLI 入口
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const parseArgs = (args) => {
        const options = {};
        for (let i = 0; i < args.length; i += 2) {
            const key = args[i].replace(/^--/, '');
            options[key] = args[i + 1];
        }
        return options;
    };
    
    switch (command) {
        case 'check': {
            const options = parseArgs(args.slice(1));
            const lesson = options.lesson || '';
            checkConflict(lesson).then(r => {
                console.log(JSON.stringify(r, null, 2));
            });
            break;
        }
        
        case 'can-apply': {
            const options = parseArgs(args.slice(1));
            const reflection = JSON.parse(options.reflection || '{}');
            canApply(reflection).then(r => {
                console.log(JSON.stringify(r, null, 2));
            });
            break;
        }
        
        case 'apply': {
            const options = parseArgs(args.slice(1));
            const reflection = JSON.parse(options.reflection || '{}');
            const target = options.target || 'auto';
            apply(reflection, target).then(r => {
                console.log(JSON.stringify(r, null, 2));
            });
            break;
        }
        
        case 'notify': {
            const options = parseArgs(args.slice(1));
            const reflection = JSON.parse(options.reflection || '{}');
            const result = JSON.parse(options.result || '{}');
            notify(reflection, result).then(r => {
                console.log(JSON.stringify(r, null, 2));
            });
            break;
        }
        
        case 'apply-all': {
            const options = parseArgs(args.slice(1));
            const reflection = JSON.parse(options.reflection || '{}');
            const target = options.target || 'auto';
            applyWithNotification(reflection, target).then(r => {
                console.log(JSON.stringify(r, null, 2));
            });
            break;
        }
        
        default:
            console.log(`
用法: node reflection-applier.js <command> [options]

命令:
  check      检查反思是否与现有规则冲突
    --lesson     教训总结
    
  can-apply  判断是否可以自动应用反思
    --reflection   反思 JSON 字符串
    
  apply      应用反思到目标文件
    --reflection   反思 JSON 字符串
    --target       目标文件路径 (默认: auto，使用 MEMORY.md)
    
  notify     通知用户应用结果
    --reflection   反思 JSON 字符串
    --result       应用结果 JSON 字符串
    
  apply-all  完整应用流程（检查-应用-通知）
    --reflection   反思 JSON 字符串
    --target       目标文件路径 (默认: auto)

示例:
  node reflection-applier.js check --lesson '修改配置前必须查阅文档'
  node reflection-applier.js can-apply --reflection '{"lesson":"禁止凭记忆添加配置","score":9,"improvable":false}'
  node reflection-applier.js apply-all --reflection '{"id":"test","lesson":"禁止凭记忆添加配置","score":9,"improvable":false}'
`);
    }
}

// 导出模块
module.exports = {
    checkConflict,
    canApply,
    apply,
    notify,
    applyWithNotification,
    extractRulesFromMemory,
    isConflicting,
    buildRuleContent,
    saveReflection,
    markAsConflict,
    logApplication
};

// 如果直接运行，则执行 CLI
if (require.main === module) {
    main();
}
