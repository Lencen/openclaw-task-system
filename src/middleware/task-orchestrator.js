/**
 * 任务调度中心 (Task Orchestrator)
 * 功能：监听任务事件，广播通知，自动分派角色，驱动全链路自动化流程
 * 核心原则：事件驱动，异步非阻塞，自动认领
 * 
 * 2026-03-27: 迁移到 SQLite，使用 DAL，移除 tasks.json 依赖
 */

const fs = require('fs');
const path = require('path');
const db = require('../db');

// 配置
const LOGS_FILE = path.join(__dirname, '../data/logs.json');

// 辅助函数：添加执行日志（使用 fs 直接读写，不影响任务数据）
function addExecutionLog(taskId, action, detail, agent = 'system') {
  const logs = [];
  try {
    if (fs.existsSync(LOGS_FILE)) {
      const content = fs.readFileSync(LOGS_FILE, 'utf8');
      if (content.trim()) {
        logs.push(...JSON.parse(content));
      }
    }
  } catch (err) {
    // 日志文件读取失败，继续执行
  }
  
  const now = new Date();
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  
  logs.unshift({
    id: `log-${Date.now()}`,
    task_id: taskId,
    time: timeStr,
    action,
    detail,
    agent,
    timestamp: now.toISOString()
  });
  
  // 保留最近 200 条日志
  if (logs.length > 200) logs.splice(200);
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
}

/**
 * 任务调度中心类
 */
class TaskOrchestrator {
  constructor() {
    this.isProcessing = false; // 防止重入
    this.scanInterval = 5000;  // 每 5 秒扫描一次（模拟守护进程）
    this.start();
    console.log('🤖 TaskOrchestrator 已启动 (全链路自动化引擎)');
  }

  /**
   * 启动守护进程：轮询任务状态，自动分派
   */
  start() {
    setInterval(() => {
      if (this.isProcessing) return; // 避免重叠执行
      this.isProcessing = true;
      
      try {
        this.processTasks();
      } catch (error) {
        console.error('[TaskOrchestrator] 处理任务时出错:', error);
      } finally {
        this.isProcessing = false;
      }
    }, this.scanInterval);
  }

  /**
   * 核心逻辑：扫描任务，驱动状态流转
   */
  processTasks() {
    const tasks = db.tasks.list();
    if (!tasks.length) return;

    console.log(`[TaskOrchestrator] 扫描任务 | 总数: ${tasks.length} | doing: ${tasks.filter(t => t.status === 'doing').length} | pending: ${tasks.filter(t => t.status === 'pending').length} | assigned: ${tasks.filter(t => t.status === 'assigned').length}`);

    // 1. 寻找 pending 任务 -> 指派给 Deep (分析)
    const pendingTask = tasks.find(t => t.status === 'pending' && !t.assignedTo);
    if (pendingTask) {
      console.log(`🔍 发现待分析任务: ${pendingTask.title} (ID: ${pendingTask.id})`);
      this.assignTask(pendingTask, 'deep', 'analyzing');
      return; // 一次只处理一个，避免并发冲突
    }

    // 2. 寻找 analyzing 任务 -> 指派给 Coder (执行)
    // 注意：这里简化逻辑，假设分析完成后自动流转
    const analyzingTask = tasks.find(t => t.status === 'analyzing' && t.breakdown && t.breakdown.length > 0);
    if (analyzingTask && !analyzingTask.assignedTo?.includes('coder')) {
       // 如果已有 breakdown 但还没人领，指派给 Coder
       // 实际场景中可能需要检查 analysis 字段是否完成
       console.log(`🔨 发现待执行任务: ${analyzingTask.title} (ID: ${analyzingTask.id})`);
       // 这里暂不自动流转，等待 Deep 完成分析后显式更新状态
    }
    
    // 3. 寻找 doing 任务 -> 模拟 Coder 执行步骤
    const doingTask = tasks.find(t => t.status === 'doing' && t.breakdown && t.breakdown.length > 0);
    if (doingTask) {
      this.simulateCoderExecution(doingTask);
    }
  }

  /**
   * 分配任务
   */
  assignTask(task, agent, nextStatus) {
    // 使用 DAL 更新任务
    db.tasks.update(task.id, {
      assignedTo: agent,
      status: nextStatus
    });
    
    // 记录日志
    addExecutionLog(task.id, `ASSIGN`, `任务已分配给 ${agent}, 状态流转至 ${nextStatus}`, 'orchestrator');
    
    console.log(`✅ 任务 ${task.id} 已分配给 ${agent}, 状态: ${nextStatus}`);
    
    // 广播通知 (模拟)
    this.broadcastNotification('TASK_ASSIGNED', { taskId: task.id, agent, status: nextStatus });
  }

  /**
   * 模拟 Coder 执行步骤 (自动化演示用)
   */
  simulateCoderExecution(task) {
    // 从数据库获取最新任务数据
    const currentTask = db.tasks.get(task.id);
    if (!currentTask) return;

    const steps = currentTask.breakdown || [];
    const completedSteps = steps.filter(s => s.status === 'completed').length;

    if (completedSteps < steps.length) {
      // 找到第一个未完成的步骤
      const nextStepIdx = steps.findIndex(s => s.status !== 'completed');
      if (nextStepIdx !== -1) {
        const step = steps[nextStepIdx];
        step.status = 'doing';
        
        addExecutionLog(task.id, 'STEP_START', `开始执行步骤 ${nextStepIdx + 1}: ${step.action}`, 'coder');
        console.log(`🏃 Coder 开始执行步骤 ${nextStepIdx + 1}/${steps.length}: ${step.action}`);
        
        // 模拟执行延迟后完成
        setTimeout(() => {
          step.status = 'completed';
          
          // 重新获取任务以确保并发安全
          const latestTask = db.tasks.get(task.id);
          if (latestTask) {
            const newCompletedSteps = (latestTask.completed_steps || 0) + 1;
            const newTotalSteps = latestTask.total_steps || steps.length;
            
            // 更新任务
            db.tasks.update(task.id, {
              breakdown: latestTask.breakdown,
              completed_steps: newCompletedSteps,
              status: newCompletedSteps === newTotalSteps ? 'completed' : 'pending'
            });
            
            addExecutionLog(task.id, 'STEP_COMPLETE', `完成步骤 ${nextStepIdx + 1}: ${step.action}`, 'coder');
            console.log(`✅ Coder 完成步骤 ${nextStepIdx + 1}/${steps.length}`);
            
            // 如果所有步骤完成，更新状态
            if (newCompletedSteps === newTotalSteps) {
              addExecutionLog(task.id, 'TASK_COMPLETE', '所有步骤完成，任务已关闭', 'system');
              console.log(`🎉 任务 ${task.id} 已完成！`);
            }
          }
        }, 2000); // 2 秒后完成步骤
      }
    }
  }

  /**
   * 广播通知 (预留接口，可对接 sessions_send 或 WebSocket)
   */
  broadcastNotification(event, data) {
    console.log(`📢 [BROADCAST] ${event}:`, JSON.stringify(data));
    // TODO: 这里可以调用 sessions_send 通知所有 Agent
    // 例如：通知 Fast 发送飞书，通知 Chat 更新前端
  }
}

// 单例模式
let orchestrator = null;

function getOrchestrator() {
  if (!orchestrator) {
    orchestrator = new TaskOrchestrator();
  }
  return orchestrator;
}

module.exports = { TaskOrchestrator, getOrchestrator };
