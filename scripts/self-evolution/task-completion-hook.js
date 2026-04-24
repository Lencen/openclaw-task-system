#!/usr/bin/env node
/**
 * 任务完成钩子 - 自动触发反思
 * 当任务完成时调用此脚本以触发反思流程
 * 
 * 用法: node task-completion-hook.js '<task-json>'
 */

const path = require('path');
const fs = require('fs');

// 引入 Reflection Integration
const ReflectionIntegration = require('./reflection-integration');

/**
 * 任务完成钩子主函数
 */
async function taskCompletionHook() {
    try {
        // 解析传入的任务数据
        const taskJson = process.argv[2];
        if (!taskJson) {
            console.error('[TaskHook] 缺少任务数据');
            process.exit(1);
        }
        
        const task = JSON.parse(taskJson);
        console.log(`[TaskHook] 任务完成，触发反思流程: ${task.title}`);
        
        // 创建 Reflection Integration 实例
        const integration = new ReflectionIntegration();
        
        // 触发反思
        const reflection = await integration.onTaskCompleted(task);
        
        if (reflection) {
            console.log(`\n✅ 任务反思完成`);
            console.log(`ID: ${reflection.id}`);
            console.log(`Context: ${reflection.context}`);
            console.log(`Lesson: ${reflection.lesson}`);
            console.log(`Score: ${reflection.score}/10`);
            console.log(`Applied: ${reflection.applied}`);
        } else {
            console.log(`\nℹ️  任务反思跳过或失败`);
        }
        
        // 输出简要统计
        setTimeout(() => {
            const stats = integration.getReflectionStats();
            console.log(`\n📊 当前反思统计:`);
            console.log(`总反思数: ${stats.totalReflections}`);
            console.log(`已应用数: ${stats.appliedCount} (${stats.applicationRate}%)`);
            console.log(`平均评分: ${stats.avgScore}/10`);
        }, 1000);
        
    } catch (error) {
        console.error(`[TaskHook] 任务完成钩子执行失败:`, error.message);
        process.exit(1);
    }
}

// 执行
taskCompletionHook();
