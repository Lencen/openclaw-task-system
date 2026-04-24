#!/usr/bin/env node
/**
 * Project Checklist Check - 项目检查清单验证
 * 
 * 功能:
 * - 检查项目是否通过所有检查项
 * - 生成检查报告
 * - 自动补充缺失信息
 * 
 * 用法: node project-checklist-check.js <project_id>
 */

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../data');
const PROJECTS_FILE = path.join(DATA_DIR, 'devops/projects/index.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const REFLECTION_LOG = path.join(DATA_DIR, 'self-evolution/apply-log.jsonl');

// 检查项定义
const CHECKLIST = [
  { id: 1, name: '项目基本信息完整', phase: 'creation', severity: 'high', auto: true },
  { id: 2, name: '项目 ID 格式正确', phase: 'creation', severity: 'high', auto: true },
  { id: 3, name: '项目范围定义', phase: 'creation', severity: 'medium', auto: false },
  { id: 4, name: '项目技术栈定义', phase: 'creation', severity: 'medium', auto: false },
  { id: 5, name: '项目文档目录创建', phase: 'creation', severity: 'high', auto: true },
  { id: 6, name: '里程碑定义完整', phase: 'execution', severity: 'high', auto: false },
  { id: 7, name: '项目任务关联', phase: 'execution', severity: 'high', auto: true },
  { id: 8, name: '项目文档完整性', phase: 'execution', severity: 'medium', auto: false },
  { id: 9, name: '规范文档引用', phase: 'execution', severity: 'medium', auto: true },
  { id: 10, name: '项目进度同步', phase: 'execution', severity: 'medium', auto: true },
  { id: 11, name: '所有任务完成', phase: 'completion', severity: 'high', auto: true },
  { id: 12, name: '验收报告生成', phase: 'completion', severity: 'high', auto: false },
  { id: 13, name: '项目总结文档', phase: 'completion', severity: 'medium', auto: false },
  { id: 14, name: '项目归档处理', phase: 'completion', severity: 'low', auto: true },
  { id: 15, name: '项目复盘记录', phase: 'completion', severity: 'medium', auto: false }
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

// 检查函数
async function checkProject(projectId) {
  const results = [];
  
  // 读取项目
  const projects = readJson(PROJECTS_FILE) || [];
  const project = projects.find(p => p.id === projectId);
  
  if (!project) {
    console.log(`项目不存在: ${projectId}`);
    return null;
  }
  
  // 读取任务
  const tasks = readJson(TASKS_FILE) || [];
  const projectTasks = tasks.filter(t => t.projectId === projectId);
  
  console.log(`\n项目检查报告`);
  console.log(`============`);
  console.log(`项目ID: ${projectId}`);
  console.log(`名称: ${project.name}`);
  console.log(`状态: ${project.status}`);
  console.log(`\n检查结果:`);
  
  // 检查 1: 项目基本信息完整
  const hasId = !!project.id;
  const hasName = !!project.name;
  const hasStatus = !!project.status;
  const hasPriority = !!project.priority;
  const basicInfoComplete = hasId && hasName && hasStatus && hasPriority;
  results.push({
    id: 1,
    name: '项目基本信息完整',
    passed: basicInfoComplete,
    severity: 'high',
    detail: basicInfoComplete 
      ? 'id, name, status, priority 已填充'
      : `缺失: ${!hasId ? 'id ' : ''}${!hasName ? 'name ' : ''}${!hasStatus ? 'status ' : ''}${!hasPriority ? 'priority' : ''}`
  });
  
  // 检查 2: 项目 ID 格式正确
  const idFormatCorrect = /^proj(-\d{8})?-[a-z0-9]+$/.test(project.id);
  results.push({
    id: 2,
    name: '项目 ID 格式正确',
    passed: idFormatCorrect,
    severity: 'high',
    detail: idFormatCorrect 
      ? `ID 格式正确: ${project.id}`
      : `ID 格式不正确: ${project.id}`
  });
  
  // 检查 3: 项目范围定义
  const hasScope = project.in_scope && project.in_scope.length > 0;
  results.push({
    id: 3,
    name: '项目范围定义',
    passed: hasScope,
    severity: 'medium',
    detail: hasScope 
      ? `${project.in_scope.length} 个范围项`
      : '未定义项目范围'
  });
  
  // 检查 4: 项目技术栈定义
  const hasTechStack = project.tech_stack && (project.tech_stack.language || project.tech_stack.framework);
  results.push({
    id: 4,
    name: '项目技术栈定义',
    passed: hasTechStack,
    severity: 'medium',
    detail: hasTechStack 
      ? `语言: ${project.tech_stack.language || '未指定'}, 框架: ${project.tech_stack.framework || '未指定'}`
      : '未定义技术栈'
  });
  
  // 检查 5: 项目文档目录创建
  const docDir = path.join(DATA_DIR, '../docs/projects', projectId);
  const docDirExists = fs.existsSync(docDir);
  results.push({
    id: 5,
    name: '项目文档目录创建',
    passed: docDirExists,
    severity: 'high',
    detail: docDirExists 
      ? `文档目录已创建`
      : '文档目录不存在'
  });
  
  // 检查 6: 里程碑定义完整
  const hasMilestones = project.milestones && project.milestones.length > 0;
  results.push({
    id: 6,
    name: '里程碑定义完整',
    passed: hasMilestones,
    severity: 'high',
    detail: hasMilestones 
      ? `${project.milestones.length} 个里程碑`
      : '无里程碑定义'
  });
  
  // 检查 7: 项目任务关联
  const hasTasks = projectTasks.length > 0;
  results.push({
    id: 7,
    name: '项目任务关联',
    passed: hasTasks,
    severity: 'high',
    detail: hasTasks 
      ? `${projectTasks.length} 个关联任务`
      : '无关联任务'
  });
  
  // 检查 8: 项目文档完整性
  const prdPath = path.join(docDir, 'PRD.md');
  const archPath = path.join(docDir, 'ARCHITECTURE.md');
  const hasPRD = fs.existsSync(prdPath);
  const hasArch = fs.existsSync(archPath);
  const docsComplete = hasPRD && hasArch;
  results.push({
    id: 8,
    name: '项目文档完整性',
    passed: docsComplete,
    severity: 'medium',
    detail: docsComplete 
      ? 'PRD 和架构文档存在'
      : `缺失: ${!hasPRD ? 'PRD.md ' : ''}${!hasArch ? 'ARCHITECTURE.md' : ''}`
  });
  
  // 检查 9: 规范文档引用
  const hasRelatedDocs = project.related_docs && project.related_docs.length > 0;
  results.push({
    id: 9,
    name: '规范文档引用',
    passed: hasRelatedDocs,
    severity: 'medium',
    detail: hasRelatedDocs 
      ? `${project.related_docs.length} 个关联文档`
      : '无关联文档'
  });
  
  // 检查 10: 项目进度同步
  const projectProgress = project.progress || 0;
  const calculatedProgress = projectTasks.length > 0 
    ? Math.round(projectTasks.filter(t => t.status === 'completed').length / projectTasks.length * 100)
    : 0;
  const progressSynced = projectProgress === calculatedProgress;
  results.push({
    id: 10,
    name: '项目进度同步',
    passed: progressSynced,
    severity: 'medium',
    detail: progressSynced 
      ? `进度正确: ${projectProgress}%`
      : `进度不一致: 项目 ${projectProgress}%, 计算 ${calculatedProgress}%`
  });
  
  // 检查 11: 所有任务完成（仅 completed 状态检查）
  if (project.status === 'completed') {
    const allTasksCompleted = projectTasks.every(t => t.status === 'completed');
    results.push({
      id: 11,
      name: '所有任务完成',
      passed: allTasksCompleted,
      severity: 'high',
      detail: allTasksCompleted 
        ? '所有任务已完成'
        : `还有 ${projectTasks.filter(t => t.status !== 'completed').length} 个未完成任务`
    });
  } else {
    results.push({
      id: 11,
      name: '所有任务完成',
      passed: true,
      severity: 'high',
      detail: '项目未完成，跳过此检查'
    });
  }
  
  // 检查 12: 验收报告生成
  const acceptancePath = path.join(docDir, 'ACCEPTANCE.md');
  const hasAcceptance = fs.existsSync(acceptancePath);
  results.push({
    id: 12,
    name: '验收报告生成',
    passed: hasAcceptance || project.status !== 'completed',
    severity: 'high',
    detail: hasAcceptance 
      ? '验收报告已生成'
      : project.status !== 'completed' 
        ? '项目未完成，跳过此检查'
        : '验收报告未生成'
  });
  
  // 检查 13: 项目总结文档
  const summaryPath = path.join(docDir, 'SUMMARY.md');
  const hasSummary = fs.existsSync(summaryPath) || project.summary;
  results.push({
    id: 13,
    name: '项目总结文档',
    passed: hasSummary || project.status !== 'completed',
    severity: 'medium',
    detail: hasSummary 
      ? '项目总结已编写'
      : project.status !== 'completed' 
        ? '项目未完成，跳过此检查'
        : '项目总结未编写'
  });
  
  // 检查 14: 项目归档处理
  const isArchived = project.archived === true;
  results.push({
    id: 14,
    name: '项目归档处理',
    passed: !isArchived || project.status !== 'completed',
    severity: 'low',
    detail: isArchived 
      ? '项目已归档'
      : '项目未归档'
  });
  
  // 检查 15: 项目复盘记录
  const reflections = readJsonl(REFLECTION_LOG);
  const projectReflections = reflections.filter(r => r.project_id === projectId);
  results.push({
    id: 15,
    name: '项目复盘记录',
    passed: projectReflections.length > 0 || project.status !== 'completed',
    severity: 'medium',
    detail: projectReflections.length > 0 
      ? '复盘已记录'
      : project.status !== 'completed' 
        ? '项目未完成，跳过此检查'
        : '无复盘记录'
  });
  
  // 输出结果
  results.forEach(r => {
    const icon = r.passed ? '✅' : (r.severity === 'high' ? '🔴' : r.severity === 'medium' ? '🟡' : '🟢');
    console.log(`  ${icon} ${r.id}. ${r.name}`);
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
    projectId,
    name: project.name,
    status: project.status,
    results,
    passed,
    total,
    passRate
  };
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const projectId = args[0];
  
  if (!projectId) {
    console.log(`
项目检查清单工具

用法: node project-checklist-check.js <project_id>

示例:
  node project-checklist-check.js proj-20260326-xxx
    `);
    return;
  }
  
  await checkProject(projectId);
}

main().catch(console.error);