#!/usr/bin/env node
/**
 * Reflection Engine - 反思引擎
 * 实现 Google Reflection 模式的自我进化机制
 * 
 * 功能:
 * - generateInitialReflection(task) - 生成初始反思
 * - refineReflection(reflection) - 细化反思
 * - validateReflection(reflection) - 验证反思
 * - checkDuplicate(lesson) - 去重检查
 * - reflect(task, maxRounds) - 完整反思流程
 * 
 * 文档: projects/self-evolution-reflection-upgrade/proposal.md
 * 
 * 用法: node reflection-engine.js <command> [options]
 *       command: generate | refine | validate | check | reflect
 */

const path = require('path');
const fs = require('fs');

// 配置
const REFLECTIONS_DIR = path.join(__dirname, '../../data/self-evolution/reflections');
const APPLY_LOG_FILE = path.join(__dirname, '../../data/self-evolution/apply-log.jsonl');

// 确保目录存在
if (!fs.existsSync(REFLECTIONS_DIR)) {
    fs.mkdirSync(REFLECTIONS_DIR, { recursive: true });
}

// 确保应用日志文件存在
if (!fs.existsSync(APPLY_LOG_FILE)) {
    fs.writeFileSync(APPLY_LOG_FILE, '');
}

/**
 * 生成初始反思
 * @param {Object} task - 任务对象，包含 title, execution_log, errors 等字段
 * @returns {Object} reflection - 标准反思对象
 */
async function generateInitialReflection(task) {
    const reflection = {
        id: `reflection-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        task_id: task.id || null,
        task_title: task.title || null,
        context: '',
        reflection: '',
        lesson: '',
        score: 1,
        round: 1,
        improvable: true,
        similar_to: [],
        conflicts_with: [],
        applied: false,
        created_at: new Date().toISOString()
    };
    
    // 提取 context（任务上下文）
    if (task.title) {
        reflection.context = task.title.substring(0, 100);
    } else if (task.execution_log && task.execution_log.length > 0) {
        reflection.context = task.execution_log[0].action || '未知任务';
    } else {
        reflection.context = '未知任务';
    }
    
    // 提取 reflection（反思内容）- 发现什么问题
    if (task.errors && task.errors.length > 0) {
        const firstError = task.errors[0];
        reflection.reflection = `发现错误: ${firstError.message || JSON.stringify(firstError)}`;
        if (firstError.context) {
            reflection.reflection += ` (上下文: ${firstError.context})`;
        }
    } else if (task.execution_log && task.execution_log.length > 0) {
        // 从执行日志中提取关键信息
        const criticalLogs = task.execution_log.filter(log => 
            log.action && (log.details?.includes('错误') || log.details?.includes('失败') || log.details?.includes('问题'))
        );
        
        if (criticalLogs.length > 0) {
            reflection.reflection = `执行问题: ${criticalLogs[0].details.substring(0, 100)}`;
        } else {
            // 从成功日志中提取可改进点
            reflection.reflection = `从任务 ${reflection.context} 中提取改进点`;
        }
    } else {
        reflection.reflection = `从任务 ${reflection.context} 中反思改进点`;
    }
    
    // 提取 lesson（教训总结）
    if (task.errors && task.errors.length > 0) {
        const firstError = task.errors[0];
        reflection.lesson = `避免错误: ${firstError.message || JSON.stringify(firstError)}`;
        if (firstError.fix) {
            reflection.lesson += `，修复方案: ${firstError.fix}`;
        }
    } else if (reflection.reflection.includes('错误')) {
        reflection.lesson = `修复错误后总结教训`;
    } else {
        reflection.lesson = `从任务 ${reflection.context} 中总结可改进点`;
    }
    
    // 评分（基于反思质量的初步估计）
    reflection.score = 5; // 初始评分
    reflection.improvable = true;
    
    // 截断过长字段
    reflection.context = truncate(reflection.context, 200);
    reflection.reflection = truncate(reflection.reflection, 500);
    reflection.lesson = truncate(reflection.lesson, 500);
    
    console.log(`[Reflection] 生成初始反思: ${reflection.id.substring(0, 12)}...`);
    console.log(`  Context: ${reflection.context.substring(0, 50)}...`);
    console.log(`  Reflection: ${reflection.reflection.substring(0, 50)}...`);
    console.log(`  Lesson: ${reflection.lesson.substring(0, 50)}...`);
    console.log(`  Score: ${reflection.score}`);
    
    return reflection;
}

/**
 * 细化反思（多轮迭代）
 * @param {Object} reflection - 当前反思对象
 * @param {number} rounds - 迭代轮次
 * @returns {Object} refined reflection - 细化后的反思
 */
async function refineReflection(reflection, rounds = 3) {
    let current = { ...reflection, round: reflection.round || 1 };
    
    for (let i = 1; i < rounds; i++) {
        const previousReflection = current.reflection;
        const previousLesson = current.lesson;
        
        // 模拟多轮反思：尝试从不同角度深化反思
        current.round = i + 1;
        
        // 深化反思内容
        if (!current.reflection.includes('多轮')) {
            current.reflection = `【第${current.round}轮】${previousReflection}`;
        }
        
        // 深化教训总结
        if (!current.lesson.includes('迭代')) {
            current.lesson = `通过多轮反思迭代，${previousLesson}`;
        }
        
        // 提升评分（最多不超过 10）
        if (current.score < 10) {
            current.score = Math.min(10, current.score + 0.5);
        }
        
        console.log(`[Reflection] 迭代第 ${current.round} 轮: ${current.id.substring(0, 12)}...`);
    }
    
    // 标记是否还可以改进（如果评分 < 8 或反思还不够深入）
    current.improvable = current.score < 8;
    
    console.log(`[Reflection] 细化完成: ${current.id.substring(0, 12)}..., Score: ${current.score}, Improvable: ${current.improvable}`);
    
    return current;
}

/**
 * 验证反思
 * @param {Object} reflection - 反思对象
 * @returns {Object} validation result - 验证结果
 */
function validateReflection(reflection) {
    const result = {
        valid: true,
        issues: [],
        scoreAdjustment: 0,
        notes: []
    };
    
    // 必填字段检查
    if (!reflection.id) {
        result.valid = false;
        result.issues.push('缺少 id');
    }
    if (!reflection.context) {
        result.valid = false;
        result.issues.push('缺少 context');
    }
    if (!reflection.reflection) {
        result.valid = false;
        result.issues.push('缺少 reflection');
    }
    if (!reflection.lesson) {
        result.valid = false;
        result.issues.push('缺少 lesson');
    }
    
    // 格式检查
    if (typeof reflection.score !== 'number' || reflection.score < 1 || reflection.score > 10) {
        result.valid = false;
        result.issues.push('score 必须是 1-10 的数字');
    }
    
    // 内容检查
    const minLength = 5;
    if (reflection.context.length < minLength) {
        result.valid = false;
        result.issues.push(`context 太短（至少 ${minLength} 字）`);
    }
    if (reflection.lesson.length < minLength) {
        result.valid = false;
        result.issues.push(`lesson 太短（至少 ${minLength} 字）`);
    }
    
    // 重复内容检查
    if (reflection.reflection === reflection.lesson) {
        result.notes.push('reflection 和 lesson 内容相似，建议区分侧重点');
        result.scoreAdjustment -= 0.5;
    }
    
    // 应用调整
    if (result.scoreAdjustment !== 0) {
        reflection.score = Math.max(1, Math.min(10, reflection.score + result.scoreAdjustment));
    }
    
    // 验证通过？
    if (!result.valid) {
        console.log(`[Reflection] 验证失败: ${reflection.id}, Issues: ${result.issues.join(', ')}`);
    } else {
        console.log(`[Reflection] 验证通过: ${reflection.id}, Score: ${reflection.score}`);
    }
    
    return result;
}

/**
 * 检查是否存在相似反思（去重）
 * @param {string} lesson - 教训总结
 * @returns {Object} { isDuplicate, similar reflections[] }
 */
async function checkDuplicate(lesson) {
    const similar = [];
    
    try {
        // 读取所有反思记录
        const files = fs.readdirSync(REFLECTIONS_DIR);
        
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            
            try {
                const filePath = path.join(REFLECTIONS_DIR, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const existingReflection = JSON.parse(content);
                
                // 跳过已合并的反射
                if (existingReflection.merged) continue;
                
                // 计算相似度（简单关键词匹配）
                const similarity = calculateSimilarity(lesson, existingReflection.lesson || '');
                
                if (similarity >= 0.8) {
                    similar.push({
                        id: existingReflection.id,
                        title: existingReflection.lesson.substring(0, 50),
                        similarity
                    });
                }
            } catch (e) {
                console.warn(`[Reflection] 读取反思文件失败: ${file}, ${e.message}`);
            }
        }
    } catch (e) {
        console.warn(`[Reflection] 读取反思目录失败: ${e.message}`);
    }
    
    const isDuplicate = similar.length > 0;
    
    console.log(`[Reflection] 去重检查: ${isDuplicate ? '发现重复' : '无重复'}, 相似反思数: ${similar.length}`);
    similar.forEach(s => {
        console.log(`  - ${s.id.substring(0, 12)}... (${Math.round(s.similarity * 100)}%) ${s.title}`);
    });
    
    return {
        isDuplicate,
        similar
    };
}

/**
 * 计算两段文本的相似度（简单实现）
 * @param {string} text1 
 * @param {string} text2 
 * @returns {number} 0-1之间的相似度
 */
function calculateSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    
    // 转小写
    const t1 = text1.toLowerCase();
    const t2 = text2.toLowerCase();
    
    // 分词（简单按空格和常见分隔符）
    const words1 = t1.split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(w => w.length > 0);
    const words2 = t2.split(/[^a-z0-0\u4e00-\u9fa5]+/).filter(w => w.length > 0);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    // 计算交集
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    let intersection = 0;
    for (const word of set1) {
        if (set2.has(word)) intersection++;
    }
    
    // 计算 Jaccard 相似度
    const union = set1.size + set2.size - intersection;
    return intersection / union;
}

/**
 * 完整反思流程
 * @param {Object} task - 任务对象
 * @param {number} maxRounds - 最大迭代轮次（默认3）
 * @returns {Object} final reflection - 最终反思
 */
async function reflect(task, maxRounds = 3) {
    console.log('\n[Reflection] 开始完整反思流程');
    console.log(`  Task: ${task.title || task.id}`);
    console.log(`  Max Rounds: ${maxRounds}`);
    
    // Step 1: 生成初始反思
    let reflection = await generateInitialReflection(task);
    
    // Step 2: 去重检查
    const duplicateCheck = await checkDuplicate(reflection.lesson);
    if (duplicateCheck.isDuplicate && duplicateCheck.similar.length > 0) {
        console.log(`[Reflection] 检测到重复反思，跳过创建`);
        return null; // 返回 null 表示不创建重复反思
    }
    
    // Step 3: 多轮细化
    reflection = await refineReflection(reflection, maxRounds);
    
    // Step 4: 验证反思
    const validation = validateReflection(reflection);
    if (!validation.valid) {
        console.log(`[Reflection] 验证失败，放弃反思`);
        return null;
    }
    
    // Step 5: 保存反思
    await saveReflection(reflection);
    
    // Step 6: 记录到应用日志
    await logApplication(reflection);
    
    console.log('\n[Reflection] 完整反思流程完成');
    console.log(`  ID: ${reflection.id}`);
    console.log(`  Score: ${reflection.score}`);
    console.log(`  Round: ${reflection.round}`);
    console.log(`  Improvable: ${reflection.improvable}`);
    console.log(`  Applied: ${reflection.applied}`);
    
    return reflection;
}

/**
 * 保存反思到文件
 */
async function saveReflection(reflection) {
    const filePath = path.join(REFLECTIONS_DIR, `${reflection.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(reflection, null, 2));
    
    console.log(`[Reflection] 已保存: ${filePath}`);
}

/**
 * 记录反思应用日志
 */
async function logApplication(reflection) {
    const entry = {
        reflection_id: reflection.id,
        context: reflection.context,
        lesson: reflection.lesson,
        score: reflection.score,
        timestamp: new Date().toISOString()
    };
    
    fs.appendFileSync(APPLY_LOG_FILE, JSON.stringify(entry) + '\n');
}

/**
 * 截断字符串
 */
function truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
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
        case 'generate': {
            const options = parseArgs(args.slice(1));
            const task = JSON.parse(options.task || '{}');
            generateInitialReflection(task).then(r => console.log(JSON.stringify(r, null, 2)));
            break;
        }
        
        case 'refine': {
            const options = parseArgs(args.slice(1));
            const reflection = JSON.parse(options.reflection || '{}');
            const rounds = parseInt(options.rounds) || 3;
            refineReflection(reflection, rounds).then(r => console.log(JSON.stringify(r, null, 2)));
            break;
        }
        
        case 'validate': {
            const options = parseArgs(args.slice(1));
            const reflection = JSON.parse(options.reflection || '{}');
            const result = validateReflection(reflection);
            console.log(JSON.stringify(result, null, 2));
            break;
        }
        
        case 'check': {
            const options = parseArgs(args.slice(1));
            const lesson = options.lesson || '';
            checkDuplicate(lesson).then(r => console.log(JSON.stringify(r, null, 2)));
            break;
        }
        
        case 'reflect': {
            const options = parseArgs(args.slice(1));
            const task = JSON.parse(options.task || '{}');
            const maxRounds = parseInt(options.rounds) || 3;
            reflect(task, maxRounds).then(r => console.log(JSON.stringify(r, null, 2)));
            break;
        }
        
        default:
            console.log(`
用法: node reflection-engine.js <command> [options]

命令:
  generate   生成初始反思
    --task     任务 JSON 字符串
    
  refine     细化反思（多轮迭代）
    --reflection   反思 JSON 字符串
    --rounds       迭代轮次 (默认 3)
    
  validate   验证反思
    --reflection   反思 JSON 字符串
    
  check      检查是否存在重复反思
    --lesson     教训总结
    
  reflect    完整反思流程
    --task       任务 JSON 字符串
    --rounds     最大迭代轮次 (默认 3)

示例:
  node reflection-engine.js generate --task '{"title":"修复配置","errors":[{"message":"凭记忆添加配置"}]}'
  node reflection-engine.js reflect --task '{"title":"测试任务"}' --rounds 2
`);
    }
}

// 导出模块
module.exports = {
    generateInitialReflection,
    refineReflection,
    validateReflection,
    checkDuplicate,
    reflect,
    saveReflection,
    logApplication
};

// 如果直接运行，则执行 CLI
if (require.main === module) {
    main();
}
