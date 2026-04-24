/**
 * Calendar API - 日历视图数据接口
 * 提供日历视图所需的数据支持
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

// 辅助函数：读取 JSON
const readJSON = (file, defaultVal) => {
  if (!fs.existsSync(file)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return defaultVal;
  }
};

/**
 * GET /api/calendar/dates
 * 获取所有有任务的日期列表
 */
router.get('/dates', (req, res) => {
  try {
    const tasks = db.tasks.list();
    
    // 提取所有有任务的日期
    const datesSet = new Set();
    
    tasks.forEach(task => {
      // 从 created_at 提取日期
      if (task.created_at) {
        const date = task.created_at.split('T')[0];
        if (date) datesSet.add(date);
      }
      
      // 从 completed_at 提取日期
      if (task.completed_at) {
        const date = task.completed_at.split('T')[0];
        if (date) datesSet.add(date);
      }
      
      // 从 deadline 提取日期
      if (task.deadline) {
        const date = task.deadline.split('T')[0];
        if (date) datesSet.add(date);
      }
      
      // 从 started_at 提取日期
      if (task.started_at) {
        const date = task.started_at.split('T')[0];
        if (date) datesSet.add(date);
      }
    });
    
    // 转换为数组并排序
    const dates = Array.from(datesSet).sort();
    
    res.json({
      success: true,
      dates: dates,
      total: dates.length
    });
  } catch (error) {
    console.error('[Calendar API] 获取日期失败:', error);
    res.status(500).json({
      success: false,
      error: '获取日期失败',
      dates: []
    });
  }
});

/**
 * GET /api/calendar/summary/:date
 * 获取指定日期的任务摘要
 */
router.get('/summary/:date', (req, res) => {
  const { date } = req.params;
  
  // 验证日期格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      error: '日期格式错误，应为 YYYY-MM-DD'
    });
  }
  
  try {
    const tasks = db.tasks.list();
    const logs = readJSON(LOGS_FILE, []);
    
    // 筛选该日期的任务
    const dateTasks = tasks.filter(task => {
      const createdDate = task.created_at ? task.created_at.split('T')[0] : null;
      const completedDate = task.completed_at ? task.completed_at.split('T')[0] : null;
      const deadlineDate = task.deadline ? task.deadline.split('T')[0] : null;
      const startedDate = task.started_at ? task.started_at.split('T')[0] : null;
      
      return createdDate === date || 
             completedDate === date || 
             deadlineDate === date ||
             startedDate === date;
    });
    
    // 计算统计数据
    const total = dateTasks.length;
    const completed = dateTasks.filter(t => t.status === 'completed').length;
    const inProgress = dateTasks.filter(t => t.status === 'doing').length;
    const pending = dateTasks.filter(t => t.status === 'pending').length;
    
    // 提取 Agent 活动
    const agentActivities = {};
    dateTasks.forEach(task => {
      const agent = task.assignedAgent || task.agent || 'system';
      if (!agentActivities[agent]) {
        agentActivities[agent] = {
          name: agent,
          tasksExecuted: 0,
          tokensUsed: 0
        };
      }
      agentActivities[agent].tasksExecuted++;
    });
    
    // 计算日志活动
    const dateLogs = logs.filter(log => {
      const logDate = log.timestamp ? log.timestamp.split('T')[0] : null;
      return logDate === date;
    });
    
    // 生成 AI 总结（简化版，实际可接入 AI 服务）
    const achievements = [];
    const issues = [];
    const highlights = [];
    
    // 根据任务状态生成总结
    if (completed > 0) {
      achievements.push(`完成了 ${completed} 个任务`);
      const completedTasks = dateTasks.filter(t => t.status === 'completed');
      completedTasks.slice(0, 3).forEach(t => {
        highlights.push(`完成任务：${t.title}`);
      });
    }
    
    if (inProgress > 0) {
      achievements.push(`有 ${inProgress} 个任务正在进行中`);
    }
    
    if (pending > 0) {
      issues.push(`还有 ${pending} 个任务待处理`);
    }
    
    // 检查是否有高优先级任务
    const highPriorityTasks = dateTasks.filter(t => 
      t.priority === 'high' || t.priority === 'P0' || t.priority === 'P1'
    );
    if (highPriorityTasks.length > 0) {
      highlights.push(`处理了 ${highPriorityTasks.length} 个高优先级任务`);
    }
    
    // 构建响应
    const summary = {
      date: date,
      tasks: {
        total: total,
        completed: completed,
        inProgress: inProgress,
        pending: pending,
        tasks: dateTasks.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          completedAt: t.completed_at,
          assignedAgent: t.assignedAgent || t.agent
        }))
      },
      agents: Object.values(agentActivities),
      activities: dateLogs.slice(0, 20).map(log => ({
        time: log.timestamp,
        action: log.action,
        detail: log.detail
      })),
      tokens: {
        total: dateTasks.reduce((sum, t) => sum + (t.tokenUsage || 0), 0),
        byAgent: agentActivities
      },
      aiSummary: {
        overall: total > 0 
          ? `${date} 共有 ${total} 个任务，完成 ${completed} 个，进行中 ${inProgress} 个`
          : '该日期暂无任务记录',
        achievements: achievements,
        issues: issues,
        highlights: highlights.length > 0 ? highlights : ['暂无特别亮点']
      }
    };
    
    res.json({
      success: true,
      summary: summary
    });
  } catch (error) {
    console.error('[Calendar API] 获取摘要失败:', error);
    res.status(500).json({
      success: false,
      error: '获取摘要失败'
    });
  }
});

/**
 * GET /api/calendar/month/:year/:month
 * 获取指定月份的任务概览
 */
router.get('/month/:year/:month', (req, res) => {
  const { year, month } = req.params;
  
  try {
    const tasks = db.tasks.list();
    
    // 构建月份前缀，如 "2026-03"
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    
    // 筛选该月份的任务
    const monthTasks = tasks.filter(task => {
      const createdDate = task.created_at || '';
      const completedDate = task.completed_at || '';
      const deadlineDate = task.deadline || '';
      
      return createdDate.startsWith(monthPrefix) ||
             completedDate.startsWith(monthPrefix) ||
             deadlineDate.startsWith(monthPrefix);
    });
    
    // 按日期分组
    const byDate = {};
    monthTasks.forEach(task => {
      const dates = [
        { date: task.created_at, type: 'created' },
        { date: task.completed_at, type: 'completed' },
        { date: task.deadline, type: 'deadline' }
      ].filter(d => d.date);
      
      dates.forEach(({ date: dateStr, type }) => {
        const date = dateStr.split('T')[0];
        if (date && date.startsWith(monthPrefix)) {
          if (!byDate[date]) {
            byDate[date] = {
              total: 0,
              completed: 0,
              doing: 0,
              pending: 0,
              issues: 0,
              tasks: []
            };
          }
          byDate[date].total++;
          if (task.status === 'completed') byDate[date].completed++;
          else if (task.status === 'doing') byDate[date].doing++;
          else if (task.status === 'pending') byDate[date].pending++;
          if (task.has_issue || task.status === 'failed') byDate[date].issues++;
          
          // 添加任务到列表（避免重复）
          if (!byDate[date].tasks.find(t => t.id === task.id)) {
            byDate[date].tasks.push({
              id: task.id,
              title: task.title,
              status: task.status,
              priority: task.priority,
              agent: task.assignedAgent || task.agent,
              has_issue: task.has_issue || task.status === 'failed',
              // Google 4 模式信息
              tool_calls: (task.tool_calls || []).length,
              collaboration: (task.collaboration?.records || []).length,
              reflections: (task.reflections || []).length,
              planning_versions: (task.planning?.versions || []).length
            });
          }
        }
      });
    });
    
    res.json({
      success: true,
      year: parseInt(year),
      month: parseInt(month),
      byDate: byDate,
      total: monthTasks.length
    });
  } catch (error) {
    console.error('[Calendar API] 获取月度数据失败:', error);
    res.status(500).json({
      success: false,
      error: '获取月度数据失败'
    });
  }
});

module.exports = router;