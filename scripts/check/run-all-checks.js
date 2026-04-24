#!/usr/bin/env node
/**
 * 统一检查运行器
 * 执行所有检查脚本，生成检查记录
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCRIPTS_DIR = path.join(__dirname);
const RECORDS_DIR = path.join(__dirname, '../../data/check-records');

// 确保记录目录存在
if (!fs.existsSync(RECORDS_DIR)) {
  fs.mkdirSync(RECORDS_DIR, { recursive: true });
}

// 检查脚本列表
const CHECK_SCRIPTS = [
  { file: 'automation-flow-check.js', name: '全链路自动化', category: 'business' },
  { file: 'field-completeness-check.js', name: '字段完整性', category: 'data' },
  { file: 'token-stats-check.js', name: 'Token统计', category: 'data' },
  { file: 'page-access-check.js', name: '页面访问', category: 'display' },
  { file: 'dashboard-data-check.js', name: '监控数据', category: 'display' }
];

async function runAllChecks() {
  console.log('========================================');
  console.log('开始执行系统全面检查');
  console.log(`时间: ${new Date().toISOString()}`);
  console.log('========================================\n');
  
  // 清除所有检查脚本的缓存
  CHECK_SCRIPTS.forEach(script => {
    const scriptPath = require.resolve(path.join(SCRIPTS_DIR, script.file));
    delete require.cache[scriptPath];
  });
  
  const record = {
    id: `check-${Date.now()}`,
    timestamp: new Date().toISOString(),
    triggeredBy: 'manual',
    checks: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0
    },
    overallStatus: 'pending',
    duration: 0
  };
  
  const startTime = Date.now();
  
  for (const script of CHECK_SCRIPTS) {
    console.log(`\n>>> 执行: ${script.name}...`);
    
    const scriptPath = path.join(SCRIPTS_DIR, script.file);
    
    if (!fs.existsSync(scriptPath)) {
      console.log(`    脚本不存在: ${script.file}`);
      record.checks.push({
        name: script.name,
        category: script.category,
        status: 'skip',
        message: '脚本不存在'
      });
      continue;
    }
    
    try {
      // 支持同步和异步脚本
      let result = require(scriptPath).runAllChecks();
      if (result instanceof Promise) {
        result = await result;
      }
      
      if (!result || !result.summary) {
        throw new Error('脚本返回结果格式错误');
      }
      
      record.checks.push({
        name: script.name,
        category: script.category,
        status: result.overallStatus,
        message: result.overallMessage,
        summary: result.summary,
        items: result.items,
        details: result.stats || result.analysis || null
      });
      
      record.summary.total += result.summary.total || 0;
      record.summary.passed += result.summary.passed || 0;
      record.summary.failed += result.summary.failed || 0;
      record.summary.warnings += result.summary.warnings || 0;
      
      console.log(`    结果: ${result.overallStatus} - ${result.overallMessage}`);
      
    } catch (e) {
      console.log(`    执行失败: ${e.message}`);
      record.checks.push({
        name: script.name,
        category: script.category,
        status: 'error',
        message: `执行失败: ${e.message}`
      });
    }
  }
  
  record.duration = Date.now() - startTime;
  
  // 计算总体状态
  if (record.summary.failed > 0) {
    record.overallStatus = 'fail';
    record.overallMessage = `发现 ${record.summary.failed} 个严重问题`;
  } else if (record.summary.warnings > 0) {
    record.overallStatus = 'warn';
    record.overallMessage = `发现 ${record.summary.warnings} 个警告`;
  } else {
    record.overallStatus = 'pass';
    record.overallMessage = '系统检查全部通过';
  }
  
  // 保存记录
  const recordFile = path.join(RECORDS_DIR, `${record.id}.json`);
  fs.writeFileSync(recordFile, JSON.stringify(record, null, 2));
  
  // 更新索引
  updateIndex(record);
  
  console.log('\n========================================');
  console.log('检查完成');
  console.log(`总计: ${record.summary.total} 项`);
  console.log(`通过: ${record.summary.passed} 项`);
  console.log(`失败: ${record.summary.failed} 项`);
  console.log(`警告: ${record.summary.warnings} 项`);
  console.log(`耗时: ${record.duration}ms`);
  console.log(`记录文件: ${recordFile}`);
  console.log('========================================');
  
  return record;
}

// 更新索引文件
function updateIndex(record) {
  const indexFile = path.join(RECORDS_DIR, 'index.json');
  
  let index = [];
  if (fs.existsSync(indexFile)) {
    try {
      index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    } catch (e) {}
  }
  
  // 添加新记录（只保留摘要）
  index.unshift({
    id: record.id,
    timestamp: record.timestamp,
    overallStatus: record.overallStatus,
    overallMessage: record.overallMessage,
    summary: record.summary,
    duration: record.duration
  });
  
  // 只保留最近 50 条
  if (index.length > 50) {
    index = index.slice(0, 50);
  }
  
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
}

// 获取检查记录列表
function getRecords(limit = 20) {
  const indexFile = path.join(RECORDS_DIR, 'index.json');
  
  if (!fs.existsSync(indexFile)) {
    return [];
  }
  
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  return index.slice(0, limit);
}

// 获取单条记录详情
function getRecordDetail(recordId) {
  const recordFile = path.join(RECORDS_DIR, `${recordId}.json`);
  
  if (!fs.existsSync(recordFile)) {
    return null;
  }
  
  return JSON.parse(fs.readFileSync(recordFile, 'utf8'));
}

// 主入口
if (require.main === module) {
  runAllChecks();
}

module.exports = {
  runAllChecks,
  getRecords,
  getRecordDetail
};