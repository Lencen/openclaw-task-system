#!/usr/bin/env node
/**
 * Task Checklist Check - 任务检查清单验证
 * 
 * 功能:
 * - 检查任务是否通过所有检查项
 * - 生成检查报告
 * - 自动补充缺失信息
 * 
 * 用法: node task-checklist-check.js <task_id>
 */

const path = require('path');
const fs = require('fs');
const http = require('http');

const DATA_DIR = path.join(__dirname, '../data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const AUDIT_LOG = path.join(DATA_DIR, 'write-audit.log');
const REFLECTION_LOG = path.join(DATA_DIR, 'self-evolution/apply-log.jsonl');

// 检查项定义
const CHECKLIST = [
  { id: 1, name: '任务意图检测', phase: 'creation', auto: true },
  { id: 2, name: '任务数据完整', phase: 'creation', auto: true },
  { id: 3, name: '关联文档填充', phase: 'creation', auto: false },
  { id: 4, name: '步骤拆分正常', phase: 'execution', auto: true },
  { id: 5, name: '执行日志记录', phase: 'execution', auto: true },
  { id: 6, name: '监控与问题', phase: 'execution', auto: false },
  { id: 7, name: '审计日志完整', phase: 'execution', auto: true },
  { id: 8, name: '成果输出', phase: 'completion', auto: true },
  { id: 9, name: '验收测试', phase: 'completion', auto: false },
  { id: 10, name: '反思记录', phase: 'completion', auto: false }
];

// 辅助函数
function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

function apiGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${process.env.TASK_SYSTEM_URL || 'http://localhost:8081'}${path}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', reject);
  });
}

// 检查函数
async function checkTask(taskId) {
  const results = [];
  
  // 读取任务
  const tasks = readJson(TASKS_FILE) || [];
  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    console.log(`任务不存在: ${taskId}`);
    return null;
  }
  
  console.log(`\n任务检查报告`);
  console.log(`============`);
  console.log(`任务ID: ${taskId}`);
  console.log(`标题: ${task.title}`);
  console.log(`状态: ${task.status}`);
  console.log(`\n检查结果:`);
  
  // 检查 1: 任务意图检测（任务存在即为通过）
  results.push({
    id: 1,
    name: '任务意图检测',
    passed: true,
    detail: '任务已创建'
  });
  
  // 检查 2: 任务数据完整
  const hasTitle = !!task.title;
  const hasDesc = !!task.description;
  const hasPriority = !!task.priority;
  const hasStatus = !!task.status;
  const dataComplete = hasTitle && hasDesc && hasPriority && hasStatus;
  results.push({
    id: 2,
    name: '任务数据完整',
    passed: dataComplete,
    detail: dataComplete 
      ? 'title, description, priority, status 已填充'
      : `缺失: ${!hasTitle ? 'title ' : ''}${!hasDesc ? 'description ' : ''}${!hasPriority ? 'priority ' : ''}${!hasStatus ? 'status' : ''}`
  });
  
  // 检查 3: 关联文档填充
  const hasRelatedDocs = task.related_docs && task.related_docs.length > 0;
  results.push({
    id: 3,
    name: '关联文档填充',
    passed: hasRelatedDocs,
    detail: hasRelatedDocs 
      ? `${task.related_docs.length} 个文档`
      : '未填充 related_docs'
  });
  
  // 检查 4: 步骤拆分正常
  const hasBreakdown = task.breakdown && task.breakdown.length > 0;
  results.push({
    id: 4,
    name: '步骤拆分正常',
    passed: hasBreakdown,
    detail: hasBreakdown 
      ? `${task.breakdown.length} 个步骤`
      : '未拆分步骤'
  });
  
  // 检查 5: 执行日志记录
  const hasExecutionLog = task.execution_log && task.execution_log.length > 0;
  results.push({
    id: 5,
    name: '执行日志记录',
    passed: hasExecutionLog,
    detail: hasExecutionLog 
      ? `${task.execution_log.length} 条记录`
      : '无执行日志'
  });
  
  // 检查 6: 监控与问题
  const hasIssues = task.issues && task.issues.length > 0;
  const issuesResolved = hasIssues && task.issues.every(i => i.status === 'resolved');
  results.push({
    id: 6,
    name: '监控与问题',
    passed: hasIssues,
    detail: hasIssues 
      ? `${task.issues.length} 个问题，${issuesResolved ? '全部已解决' : '有未解决问题'}`
      : '无问题记录'
  });
  
  // 检查 7: 审计日志完整
  const auditLog = fs.existsSync(AUDIT_LOG) 
    ? fs.readFileSync(AUDIT_LOG, 'utf8').trim().split('\n')
    : [];
  const taskAudits = auditLog.filter(line => line.includes(taskId));
  results.push({
    id: 7,
    name: '审计日志完整',
    passed: taskAudits.length > 0,
    detail: taskAudits.length > 0 
      ? `${taskAudits.length} 条审计记录`
      : '无审计日志'
  });
  
  // 检查 8: 成果输出
  const outputs = [];
  if (task.related_docs) {
    for (const doc of task.related_docs) {
      const fullPath = path.join(DATA_DIR, '..', doc);
      if (fs.existsSync(fullPath)) {
        outputs.push(doc);
      }
    }
  }
  results.push({
    id: 8,
    name: '成果输出',
    passed: outputs.length > 0,
    detail: outputs.length > 0 
      ? `${outputs.length} 个文件可访问`
      : '无成果文件'
  });
  
  // 检查 9: 验收测试
  const hasAcceptance = task.test_acceptance && task.test_acceptance.results;
  results.push({
    id: 9,
    name: '验收测试',
    passed: hasAcceptance,
    detail: hasAcceptance 
      ? '验收测试已执行'
      : '未执行验收测试'
  });
  
  // 检查 10: 反思记录
  const reflections = readJsonl(REFLECTION_LOG);
  const taskReflections = reflections.filter(r => r.task_id === taskId);
  results.push({
    id: 10,
    name: '反思记录',
    passed: taskReflections.length > 0,
    detail: taskReflections.length > 0 
      ? '反思已记录'
      : '无反思记录'
  });
  
  // 输出结果
  results.forEach(r => {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.id}. ${r.name}`);
    if (r.detail) {
      console.log(`      ${r.detail}`);
    }
  });
  
  // 统计
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const passRate = Math.round(passed / total * 100);
  
  console.log(`\n通过率: ${passed}/${total} (${passRate}%)`);
  console.log(`状态: ${passRate === 100 ? '✅ 通过' : passRate >= 70 ? '⚠️ 部分通过' : '❌ 不通过'}`);
  
  return {
    taskId,
    title: task.title,
    status: task.status,
    results,
    passed,
    total,
    passRate
  };
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const taskId = args[0];
  
  if (!taskId) {
    console.log(`
任务检查清单工具

用法: node task-checklist-check.js <task_id>

示例:
  node task-checklist-check.js b6ff416a-b126-4766-8442-0f47835b0773
    `);
    return;
  }
  
  await checkTask(taskId);
}

main().catch(console.error);