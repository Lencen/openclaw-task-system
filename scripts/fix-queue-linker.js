#!/usr/bin/env node
/**
 * Fix Queue Linker - 修复队列与问题状态联动器
 * 
 * 功能：
 * 1. 修复开始时 → 更新问题状态为 in_progress
 * 2. 修复完成时 → 更新问题状态为 resolved
 * 3. 修复失败时 → 更新问题状态为 open（重试）
 * 4. 问题关闭时 → 从修复队列移除
 * 
 * 调用方式：
 * - 开始修复：node fix-queue-linker.js start <fixId> <issueId>
 * - 完成修复：node fix-queue-linker.js complete <fixId> <issueId> [result]
 * - 修复失败：node fix-queue-linker.js fail <fixId> <issueId> [error]
 * - 关闭问题：node fix-queue-linker.js close <issueId>
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const FIX_QUEUE_FILE = path.join(DATA_DIR, 'fix-queue.json');

// 使用已有的 DAL
const { getIssuesDAL } = require('../src/db/issues-dal');

/**
 * 更新问题状态
 */
function updateIssueStatus(issueId, status, extra = {}) {
    const dal = getIssuesDAL();
    const updateData = { status, ...extra };
    
    if (status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
    }
    if (status === 'closed') {
        updateData.closed_at = new Date().toISOString();
    }
    
    const result = dal.update(issueId, updateData);
    if (result) {
        console.log(`[Linker] 问题 ${issueId} 状态更新为 ${status}`);
    }
    return result;
}

/**
 * 更新修复队列状态
 */
function updateFixQueueStatus(fixId, status, extra = {}) {
    const queue = JSON.parse(fs.readFileSync(FIX_QUEUE_FILE, 'utf-8'));
    const idx = queue.findIndex(item => item.id === fixId);
    
    if (idx === -1) {
        console.error(`[Linker] 修复记录 ${fixId} 不存在`);
        return false;
    }
    
    queue[idx].status = status;
    queue[idx].updated_at = new Date().toISOString();
    
    if (status === 'running') {
        queue[idx].started_at = new Date().toISOString();
    }
    if (status === 'completed') {
        queue[idx].completed_at = new Date().toISOString();
    }
    if (status === 'failed') {
        queue[idx].failed_at = new Date().toISOString();
    }
    
    Object.assign(queue[idx], extra);
    
    fs.writeFileSync(FIX_QUEUE_FILE, JSON.stringify(queue, null, 2));
    console.log(`[Linker] 修复记录 ${fixId} 状态更新为 ${status}`);
    return true;
}

/**
 * 从修复队列移除
 */
function removeFromQueue(issueId) {
    const queue = JSON.parse(fs.readFileSync(FIX_QUEUE_FILE, 'utf-8'));
    const newQueue = queue.filter(item => item.issueId !== issueId);
    fs.writeFileSync(FIX_QUEUE_FILE, JSON.stringify(newQueue, null, 2));
    console.log(`[Linker] 问题 ${issueId} 已从修复队列移除`);
}

// CLI 入口
const [,, action, fixId, issueId, ...args] = process.argv;

if (!action) {
    console.log(`
用法：
  node fix-queue-linker.js start <fixId> <issueId>     开始修复
  node fix-queue-linker.js complete <fixId> <issueId>  完成修复
  node fix-queue-linker.js fail <fixId> <issueId>      修复失败
  node fix-queue-linker.js close <issueId>             关闭问题
`);
    process.exit(0);
}

switch (action) {
    case 'start':
        updateFixQueueStatus(fixId, 'running');
        updateIssueStatus(issueId, 'in_progress');
        break;
        
    case 'complete':
        const result = args.join(' ') || '修复完成';
        updateFixQueueStatus(fixId, 'completed', { result: { summary: result } });
        updateIssueStatus(issueId, 'resolved', { solution: result });
        break;
        
    case 'fail':
        const error = args.join(' ') || '修复失败';
        updateFixQueueStatus(fixId, 'failed', { error });
        updateIssueStatus(issueId, 'open');  // 重新打开，允许重试
        break;
        
    case 'close':
        updateIssueStatus(issueId, 'closed');
        removeFromQueue(issueId);
        break;
        
    default:
        console.error('未知操作:', action);
        process.exit(1);
}

console.log('[Linker] 联动完成');
