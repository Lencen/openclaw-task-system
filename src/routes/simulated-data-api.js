/**
 * Simulated Data API
 * Provides mock data for testing when real data is not available
 */

const express = require('express');
const router = express.Router();

// 模拟数据
const tasks = [
  { id: 'task-001', title: '完成首页UI优化', status: 'in_progress', priority: 'high', agent: 'coder', progress: 60, createdAt: '2026-03-11 10:00:00', updatedAt: '2026-03-11 20:00:00', description: '优化首页布局和样式' },
  { id: 'task-002', title: '修复任务列表页Bug', status: 'pending', priority: 'medium', agent: 'coder', progress: 0, createdAt: '2026-03-10 09:00:00', updatedAt: '2026-03-10 09:00:00', description: '任务列表加载异常问题' },
  { id: 'task-003', title: '添加用户认证功能', status: 'completed', priority: 'high', agent: 'auth-agent', progress: 100, createdAt: '2026-03-08 14:00:00', updatedAt: '2026-03-09 16:30:00', description: '实现JWT认证功能' },
  { id: 'task-004', title: '数据库性能优化', status: 'review', priority: 'high', agent: 'db-agent', progress: 90, createdAt: '2026-03-07 11:00:00', updatedAt: '2026-03-11 15:00:00', description: '索引优化和查询重构' },
  { id: 'task-005', title: '文档完善', status: 'pending', priority: 'low', agent: 'doc-agent', progress: 10, createdAt: '2026-03-11 08:00:00', updatedAt: '2026-03-11 08:00:00', description: '补充API文档' },
  { id: 'task-006', title: '安全漏洞修复', status: 'in_progress', priority: 'urgent', agent: 'security-agent', progress: 75, createdAt: '2026-03-09 16:00:00', updatedAt: '2026-03-11 18:00:00', description: '修复XSS和SQL注入漏洞' },
  { id: 'task-007', title: '性能测试', status: 'pending', priority: 'medium', agent: 'qa-agent', progress: 0, createdAt: '2026-03-10 10:00:00', updatedAt: '2026-03-10 10:00:00', description: '系统压力测试' },
  { id: 'task-008', title: '代码审查', status: 'review', priority: 'medium', agent: 'reviewer-agent', progress: 85, createdAt: '2026-03-08 15:00:00', updatedAt: '2026-03-11 14:00:00', description: '核心模块代码审查' },
  { id: 'task-009', title: '版本发布准备', status: 'completed', priority: 'high', agent: 'deploy-agent', progress: 100, createdAt: '2026-03-06 09:00:00', updatedAt: '2026-03-08 18:00:00', description: 'v2.0版本发布准备' },
  { id: 'task-010', title: '用户反馈收集', status: 'in_progress', priority: 'low', agent: 'support-agent', progress: 40, createdAt: '2026-03-10 14:00:00', updatedAt: '2026-03-11 09:00:00', description: '收集用户使用反馈' },
  { id: 'task-011', title: '日志系统升级', status: 'cancelled', priority: 'medium', agent: 'log-agent', progress: 30, createdAt: '2026-03-07 10:00:00', updatedAt: '2026-03-10 16:00:00', description: 'ELK栈升级' },
  { id: 'task-012', title: '移动端适配', status: 'in_progress', priority: 'high', agent: 'mobile-agent', progress: 55, createdAt: '2026-03-09 11:00:00', updatedAt: '2026-03-11 17:00:00', description: '响应式布局优化' },
  { id: 'task-013', title: '国际化支持', status: 'pending', priority: 'medium', agent: 'i18n-agent', progress: 5, createdAt: '2026-03-11 09:00:00', updatedAt: '2026-03-11 09:00:00', description: '多语言支持' },
  { id: 'task-014', title: '缓存策略优化', status: 'completed', priority: 'high', agent: 'cache-agent', progress: 100, createdAt: '2026-03-05 14:00:00', updatedAt: '2026-03-07 16:00:00', description: 'Redis缓存优化' },
  { id: 'task-015', title: '错误追踪系统', status: 'review', priority: 'medium', agent: 'tracking-agent', progress: 80, createdAt: '2026-03-08 09:00:00', updatedAt: '2026-03-11 11:00:00', description: 'Sentry集成' },
  { id: 'task-016', title: 'API文档生成', status: 'pending', priority: 'low', agent: 'doc-agent', progress: 15, createdAt: '2026-03-11 10:00:00', updatedAt: '2026-03-11 10:00:00', description: 'Swagger文档生成' },
  { id: 'task-017', title: '监控告警配置', status: 'in_progress', priority: 'high', agent: 'monitor-agent', progress: 65, createdAt: '2026-03-09 14:00:00', updatedAt: '2026-03-11 16:00:00', description: 'Prometheus+Grafana配置' },
  { id: 'task-018', title: '备份策略优化', status: 'completed', priority: 'medium', agent: 'ops-agent', progress: 100, createdAt: '2026-03-06 11:00:00', updatedAt: '2026-03-08 15:00:00', description: '每日备份策略' },
  { id: 'task-019', title: '权限系统重构', status: 'in_progress', priority: 'urgent', agent: 'security-agent', progress: 70, createdAt: '2026-03-10 15:00:00', updatedAt: '2026-03-11 19:00:00', description: 'RBAC权限重构' },
  { id: 'task-020', title: '搜索功能优化', status: 'review', priority: 'medium', agent: 'search-agent', progress: 92, createdAt: '2026-03-07 16:00:00', updatedAt: '2026-03-11 13:00:00', description: 'Elasticsearch优化' }
];

const agents = [
  { id: 'agent-001', name: 'coder', status: 'online', currentTask: '完成首页UI优化', progress: 60, tokenUsage: 12345, nextTask: '修复任务列表页' },
  { id: 'agent-002', name: 'auth-agent', status: 'online', currentTask: '用户认证功能', progress: 100, tokenUsage: 8765, nextTask: null },
  { id: 'agent-003', name: 'db-agent', status: 'busy', currentTask: '数据库性能优化', progress: 90, tokenUsage: 15678, nextTask: '数据迁移' },
  { id: 'agent-004', name: 'doc-agent', status: 'online', currentTask: '文档完善', progress: 10, tokenUsage: 3456, nextTask: 'API文档生成' },
  { id: 'agent-005', name: 'security-agent', status: 'busy', currentTask: '安全漏洞修复', progress: 75, tokenUsage: 23456, nextTask: '权限系统重构' },
  { id: 'agent-006', name: 'qa-agent', status: 'offline', currentTask: null, progress: 0, tokenUsage: 1234, nextTask: '性能测试' },
  { id: 'agent-007', name: 'reviewer-agent', status: 'online', currentTask: '代码审查', progress: 85, tokenUsage: 9876, nextTask: null },
  { id: 'agent-008', name: 'deploy-agent', status: 'online', currentTask: '版本发布准备', progress: 100, tokenUsage: 5678, nextTask: '自动化部署配置' },
  { id: 'agent-009', name: 'support-agent', status: 'busy', currentTask: '用户反馈收集', progress: 40, tokenUsage: 4567, nextTask: '问题排查' },
  { id: 'agent-010', name: 'mobile-agent', status: 'online', currentTask: '移动端适配', progress: 55, tokenUsage: 7890, nextTask: '平板适配' }
];

const projects = [
  { id: 'project-001', name: '系统优化项目', description: '系统性能优化和重构', status: 'in_progress', startDate: '2026-03-01', endDate: '2026-03-31', priority: 'high' },
  { id: 'project-002', name: '安全升级项目', description: '安全漏洞修复和加固', status: 'in_progress', startDate: '2026-03-05', endDate: '2026-03-20', priority: 'urgent' },
  { id: 'project-003', name: '版本发布项目', description: 'V2.0版本发布', status: 'completed', startDate: '2026-02-15', endDate: '2026-03-08', priority: 'high' },
  { id: 'project-004', name: '文档完善项目', description: '项目文档完善', status: 'pending', startDate: '2026-03-10', endDate: '2026-03-25', priority: 'low' },
  { id: 'project-005', name: '移动端开发项目', description: '移动端应用开发', status: 'in_progress', startDate: '2026-03-01', endDate: '2026-04-15', priority: 'medium' }
];

const skills = [
  { id: 'skill-001', name: 'JavaScript开发', level: 'expert', category: '开发' },
  { id: 'skill-002', name: 'Python开发', level: 'advanced', category: '开发' },
  { id: 'skill-003', name: '数据库优化', level: 'expert', category: '数据库' },
  { id: 'skill-004', name: '安全加固', level: 'advanced', category: '安全' },
  { id: 'skill-005', name: '性能测试', level: 'intermediate', category: '测试' },
  { id: 'skill-006', name: '代码审查', level: 'expert', category: '开发' },
  { id: 'skill-007', name: 'DevOps', level: 'advanced', category: '运维' },
  { id: 'skill-008', name: '文档编写', level: 'intermediate', category: '文档' },
  { id: 'skill-009', name: 'UI设计', level: 'advanced', category: '设计' },
  { id: 'skill-010', name: '项目管理', level: 'expert', category: '管理' }
];

const docs = [
  { id: 'doc-001', title: '系统架构文档', type: 'md', size: 24567, createdAt: '2026-03-01', updatedAt: '2026-03-10', status: 'active' },
  { id: 'doc-002', title: 'API接口文档', type: 'md', size: 34567, createdAt: '2026-03-02', updatedAt: '2026-03-11', status: 'active' },
  { id: 'doc-003', title: '数据库设计文档', type: 'md', size: 18765, createdAt: '2026-03-03', updatedAt: '2026-03-09', status: 'active' },
  { id: 'doc-004', title: '安全规范文档', type: 'pdf', size: 12345, createdAt: '2026-03-04', updatedAt: '2026-03-08', status: 'active' },
  { id: 'doc-005', title: '部署手册', type: 'md', size: 9876, createdAt: '2026-03-05', updatedAt: '2026-03-07', status: 'active' },
  { id: 'doc-006', title: '用户指南', type: 'pdf', size: 15678, createdAt: '2026-03-06', updatedAt: '2026-03-11', status: 'draft' },
  { id: 'doc-007', title: '测试报告', type: 'md', size: 8765, createdAt: '2026-03-07', updatedAt: '2026-03-10', status: 'completed' },
  { id: 'doc-008', title: '性能测试报告', type: 'md', size: 11234, createdAt: '2026-03-08', updatedAt: '2026-03-09', status: 'active' },
  { id: 'doc-009', title: '代码审查报告', type: 'md', size: 7654, createdAt: '2026-03-09', updatedAt: '2026-03-11', status: 'active' },
  { id: 'doc-010', title: '项目总结报告', type: 'pdf', size: 13456, createdAt: '2026-03-10', updatedAt: '2026-03-11', status: 'draft' }
];

const notifications = [
  { id: 'notification-001', type: 'task', title: '新任务分配', content: '新任务已分配：完成首页UI优化', status: 'unread', createdAt: '2026-03-11 10:00:00', priority: 'high' },
  { id: 'notification-002', type: 'task', title: '任务完成提醒', content: '任务已完成：用户认证功能', status: 'unread', createdAt: '2026-03-09 16:30:00', priority: 'medium' },
  { id: 'notification-003', type: 'security', title: '安全漏洞告警', content: '发现XSS漏洞，请及时修复', status: 'unread', createdAt: '2026-03-09 16:00:00', priority: 'urgent' },
  { id: 'notification-004', type: 'system', title: '系统升级通知', content: '系统将进行升级维护', status: 'read', createdAt: '2026-03-08 14:00:00', priority: 'low' },
  { id: 'notification-005', type: 'task', title: '任务延期提醒', content: '任务DB性能优化即将超期', status: 'read', createdAt: '2026-03-08 11:00:00', priority: 'medium' },
  { id: 'notification-006', type: 'review', title: '代码审查提醒', content: '有新的代码待审查', status: 'unread', createdAt: '2026-03-11 14:00:00', priority: 'medium' },
  { id: 'notification-007', type: 'task', title: '任务进度更新', content: '安全漏洞修复进度75%', status: 'read', createdAt: '2026-03-11 18:00:00', priority: 'high' },
  { id: 'notification-008', type: 'system', title: '备份通知', content: '每日备份已完成', status: 'read', createdAt: '2026-03-08 00:00:00', priority: 'low' },
  { id: 'notification-009', type: 'task', title: '任务开始提醒', content: '任务：移动端适配已开始', status: 'read', createdAt: '2026-03-09 11:00:00', priority: 'medium' },
  { id: 'notification-010', type: 'security', title: '权限变更通知', content: '用户权限已更新', status: 'unread', createdAt: '2026-03-10 15:00:00', priority: 'medium' },
  { id: 'notification-011', type: 'task', title: '任务完成提醒', content: '任务：数据库性能优化已完成', status: 'read', createdAt: '2026-03-08 09:00:00', priority: 'high' },
  { id: 'notification-012', type: 'system', title: '维护通知', content: '系统将进行例行维护', status: 'read', createdAt: '2026-03-07 16:00:00', priority: 'low' },
  { id: 'notification-013', type: 'task', title: '新任务分配', content: '新任务已分配：监控告警配置', status: 'unread', createdAt: '2026-03-09 14:00:00', priority: 'high' },
  { id: 'notification-014', type: 'review', title: '测试报告通过', content: '测试报告已通过审核', status: 'read', createdAt: '2026-03-10 10:00:00', priority: 'medium' },
  { id: 'notification-015', type: 'task', title: '任务截止提醒', content: '任务：权限系统重构即将截止', status: 'unread', createdAt: '2026-03-11 19:00:00', priority: 'urgent' },
  { id: 'notification-016', type: 'task', title: '任务取消提醒', content: '任务：日志系统升级已取消', status: 'read', createdAt: '2026-03-10 16:00:00', priority: 'low' }
];

// 导出路由模块
module.exports = (app) => {
  // 获取任务列表
  app.get('/api/tasks', (req, res) => {
    const { showCompleted } = req.query;
    let filteredTasks = tasks;
    
    if (showCompleted !== 'true') {
      filteredTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'archived' && t.status !== 'cancelled');
    }
    
    res.json({ success: true, tasks: filteredTasks, total: filteredTasks.length });
  });

  // 获取单个任务
  app.get('/api/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id === req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    res.json({ success: true, task });
  });

  // 创建任务
  app.post('/api/tasks', (req, res) => {
    const newTask = {
      id: `task-${String(tasks.length + 1).padStart(3, '0')}`,
      ...req.body,
      createdAt: new Date().toISOString().replace('T', ' '),
      updatedAt: new Date().toISOString().replace('T', ' ')
    };
    tasks.unshift(newTask);
    res.json({ success: true, task: newTask });
  });

  // 更新任务
  app.put('/api/tasks/:id', (req, res) => {
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    tasks[idx] = { ...tasks[idx], ...req.body, updatedAt: new Date().toISOString().replace('T', ' ') };
    res.json({ success: true, task: tasks[idx] });
  });

  // 删除任务
  app.delete('/api/tasks/:id', (req, res) => {
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    tasks.splice(idx, 1);
    res.json({ success: true, message: '任务已删除' });
  });

  // 获取Agent列表
  app.get('/api/agents', (req, res) => {
    res.json({ success: true, agents, total: agents.length });
  });

  // 获取单个Agent
  app.get('/api/agents/:id', (req, res) => {
    const agent = agents.find(a => a.id === req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent不存在' });
    }
    res.json({ success: true, agent });
  });

  // 更新Agent状态
  app.put('/api/agents/:id', (req, res) => {
    const idx = agents.findIndex(a => a.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Agent不存在' });
    }
    agents[idx] = { ...agents[idx], ...req.body };
    res.json({ success: true, agent: agents[idx] });
  });

  // 获取项目列表
  app.get('/api/projects', (req, res) => {
    const { status, priority } = req.query;
    let filteredProjects = projects;
    
    if (status) {
      filteredProjects = filteredProjects.filter(p => p.status === status);
    }
    if (priority) {
      filteredProjects = filteredProjects.filter(p => p.priority === priority);
    }
    
    res.json({ success: true, projects: filteredProjects, total: filteredProjects.length });
  });

  // 获取单个项目
  app.get('/api/projects/:id', (req, res) => {
    const project = projects.find(p => p.id === req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: '项目不存在' });
    }
    res.json({ success: true, project });
  });

  // 创建项目
  app.post('/api/projects', (req, res) => {
    const newProject = {
      id: `project-${String(projects.length + 1).padStart(3, '0')}`,
      ...req.body
    };
    projects.unshift(newProject);
    res.json({ success: true, project: newProject });
  });

  // 更新项目
  app.put('/api/projects/:id', (req, res) => {
    const idx = projects.findIndex(p => p.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: '项目不存在' });
    }
    projects[idx] = { ...projects[idx], ...req.body };
    res.json({ success: true, project: projects[idx] });
  });

  // 删除项目
  app.delete('/api/projects/:id', (req, res) => {
    const idx = projects.findIndex(p => p.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: '项目不存在' });
    }
    projects.splice(idx, 1);
    res.json({ success: true, message: '项目已删除' });
  });

  // 获取技能列表
  app.get('/api/skills', (req, res) => {
    const { category, level } = req.query;
    let filteredSkills = skills;
    
    if (category) {
      filteredSkills = filteredSkills.filter(s => s.category === category);
    }
    if (level) {
      filteredSkills = filteredSkills.filter(s => s.level === level);
    }
    
    res.json({ success: true, skills: filteredSkills, total: filteredSkills.length });
  });

  // 获取单个技能
  app.get('/api/skills/:id', (req, res) => {
    const skill = skills.find(s => s.id === req.params.id);
    if (!skill) {
      return res.status(404).json({ success: false, error: '技能不存在' });
    }
    res.json({ success: true, skill });
  });

  // 创建技能
  app.post('/api/skills', (req, res) => {
    const newSkill = {
      id: `skill-${String(skills.length + 1).padStart(3, '0')}`,
      ...req.body
    };
    skills.unshift(newSkill);
    res.json({ success: true, skill: newSkill });
  });

  // 更新技能
  app.put('/api/skills/:id', (req, res) => {
    const idx = skills.findIndex(s => s.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: '技能不存在' });
    }
    skills[idx] = { ...skills[idx], ...req.body };
    res.json({ success: true, skill: skills[idx] });
  });

  // 删除技能
  app.delete('/api/skills/:id', (req, res) => {
    const idx = skills.findIndex(s => s.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: '技能不存在' });
    }
    skills.splice(idx, 1);
    res.json({ success: true, message: '技能已删除' });
  });

  // 获取文档列表
  app.get('/api/docs', (req, res) => {
    const { status, type } = req.query;
    let filteredDocs = docs;
    
    if (status) {
      filteredDocs = filteredDocs.filter(d => d.status === status);
    }
    if (type) {
      filteredDocs = filteredDocs.filter(d => d.type === type);
    }
    
    res.json({ success: true, docs: filteredDocs, total: filteredDocs.length });
  });

  // 获取单个文档
  app.get('/api/docs/:id', (req, res) => {
    const doc = docs.find(d => d.id === req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, error: '文档不存在' });
    }
    res.json({ success: true, doc });
  });

  // 创建文档
  app.post('/api/docs', (req, res) => {
    const newDoc = {
      id: `doc-${String(docs.length + 1).padStart(3, '0')}`,
      ...req.body,
      createdAt: new Date().toISOString().replace('T', ' '),
      updatedAt: new Date().toISOString().replace('T', ' ')
    };
    docs.unshift(newDoc);
    res.json({ success: true, doc: newDoc });
  });

  // 更新文档
  app.put('/api/docs/:id', (req, res) => {
    const idx = docs.findIndex(d => d.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: '文档不存在' });
    }
    docs[idx] = { ...docs[idx], ...req.body, updatedAt: new Date().toISOString().replace('T', ' ') };
    res.json({ success: true, doc: docs[idx] });
  });

  // 删除文档
  app.delete('/api/docs/:id', (req, res) => {
    const idx = docs.findIndex(d => d.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: '文档不存在' });
    }
    docs.splice(idx, 1);
    res.json({ success: true, message: '文档已删除' });
  });

  // 获取通知列表
  app.get('/api/notifications', (req, res) => {
    const { status, type, priority } = req.query;
    let filteredNotifications = notifications;
    
    if (status) {
      filteredNotifications = filteredNotifications.filter(n => n.status === status);
    }
    if (type) {
      filteredNotifications = filteredNotifications.filter(n => n.type === type);
    }
    if (priority) {
      filteredNotifications = filteredNotifications.filter(n => n.priority === priority);
    }
    
    res.json({ success: true, notifications: filteredNotifications, total: filteredNotifications.length });
  });

  // 获取单个通知
  app.get('/api/notifications/:id', (req, res) => {
    const notification = notifications.find(n => n.id === req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, error: '通知不存在' });
    }
    res.json({ success: true, notification });
  });

  // 标记通知为已读
  app.put('/api/notifications/:id/read', (req, res) => {
    const idx = notifications.findIndex(n => n.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: '通知不存在' });
    }
    notifications[idx].status = 'read';
    res.json({ success: true, notification: notifications[idx] });
  });

  // 创建通知
  app.post('/api/notifications', (req, res) => {
    const newNotification = {
      id: `notification-${String(notifications.length + 1).padStart(3, '0')}`,
      ...req.body,
      createdAt: new Date().toISOString().replace('T', ' ')
    };
    notifications.unshift(newNotification);
    res.json({ success: true, notification: newNotification });
  });

  // 删除通知
  app.delete('/api/notifications/:id', (req, res) => {
    const idx = notifications.findIndex(n => n.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: '通知不存在' });
    }
    notifications.splice(idx, 1);
    res.json({ success: true, message: '通知已删除' });
  });

  // 获取所有模拟数据统计
  app.get('/api/stats', (req, res) => {
    res.json({
      success: true,
      data: {
        tasks: {
          total: tasks.length,
          byStatus: {
            pending: tasks.filter(t => t.status === 'pending').length,
            in_progress: tasks.filter(t => t.status === 'in_progress').length,
            review: tasks.filter(t => t.status === 'review').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            cancelled: tasks.filter(t => t.status === 'cancelled').length,
            archived: tasks.filter(t => t.status === 'archived').length
          },
          byPriority: {
            low: tasks.filter(t => t.priority === 'low').length,
            medium: tasks.filter(t => t.priority === 'medium').length,
            high: tasks.filter(t => t.priority === 'high').length,
            urgent: tasks.filter(t => t.priority === 'urgent').length
          }
        },
        agents: {
          total: agents.length,
          byStatus: {
            online: agents.filter(a => a.status === 'online').length,
            busy: agents.filter(a => a.status === 'busy').length,
            offline: agents.filter(a => a.status === 'offline').length,
            maintenance: agents.filter(a => a.status === 'maintenance').length,
            休眠: agents.filter(a => a.status === '休眠').length
          }
        },
        projects: {
          total: projects.length,
          byStatus: {
            pending: projects.filter(p => p.status === 'pending').length,
            in_progress: projects.filter(p => p.status === 'in_progress').length,
            completed: projects.filter(p => p.status === 'completed').length
          },
          byPriority: {
            low: projects.filter(p => p.priority === 'low').length,
            medium: projects.filter(p => p.priority === 'medium').length,
            high: projects.filter(p => p.priority === 'high').length,
            urgent: projects.filter(p => p.priority === 'urgent').length
          }
        },
        skills: {
          total: skills.length,
          byCategory: {
            开发: skills.filter(s => s.category === '开发').length,
            数据库: skills.filter(s => s.category === '数据库').length,
            安全: skills.filter(s => s.category === '安全').length,
            测试: skills.filter(s => s.category === '测试').length,
            运维: skills.filter(s => s.category === '运维').length,
            文档: skills.filter(s => s.category === '文档').length,
            设计: skills.filter(s => s.category === '设计').length,
            管理: skills.filter(s => s.category === '管理').length
          }
        },
        docs: {
          total: docs.length,
          byStatus: {
            active: docs.filter(d => d.status === 'active').length,
            draft: docs.filter(d => d.status === 'draft').length,
            completed: docs.filter(d => d.status === 'completed').length
          },
          byType: {
            md: docs.filter(d => d.type === 'md').length,
            pdf: docs.filter(d => d.type === 'pdf').length
          }
        },
        notifications: {
          total: notifications.length,
          byStatus: {
            unread: notifications.filter(n => n.status === 'unread').length,
            read: notifications.filter(n => n.status === 'read').length
          },
          byType: {
            task: notifications.filter(n => n.type === 'task').length,
            security: notifications.filter(n => n.type === 'security').length,
            system: notifications.filter(n => n.type === 'system').length,
            review: notifications.filter(n => n.type === 'review').length
          },
          byPriority: {
            low: notifications.filter(n => n.priority === 'low').length,
            medium: notifications.filter(n => n.priority === 'medium').length,
            high: notifications.filter(n => n.priority === 'high').length,
            urgent: notifications.filter(n => n.priority === 'urgent').length
          }
        }
      }
    });
  });

  console.log('[Simulated Data API] Loaded all mock data endpoints');
};