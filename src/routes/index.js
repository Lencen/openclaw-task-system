const express = require('express');
const path = require('path');

console.log('[routes/index.js] 开始加载路由模块');

const db = require('../db');
console.log('[routes/index.js] db module loaded:', typeof db);

const kbRoutes = require('./kb-routes');
console.log('[routes/index.js] kbRoutes loaded kbRoutes:', typeof kbRoutes);

const agentManagementRouter = require('./agent-management-api');
console.log('[routes/index.js] agentManagementRouter loaded:', typeof agentManagementRouter);

const modelManagementRouter = require('./model-management-api');
console.log('[routes/index.js] modelManagementRouter loaded:', typeof modelManagementRouter);

const notificationsRouter = require('./notifications-api');
console.log('[routes/index.js] notificationsRouter loaded:', typeof notificationsRouter);

const simulatedDataRoutes = require('./simulated-data-api');
console.log('[routes/index.js] simulatedDataRoutes loaded:', typeof simulatedDataRoutes);

const systemMonitorRouter = require('./system-monitor-api');
console.log('[routes/index.js] systemMonitorRouter loaded:', typeof systemMonitorRouter);

const systemMonitorV3Router = require('./system-monitor-api-v3');
console.log('[routes/index.js] systemMonitorV3Router loaded:', typeof systemMonitorV3Router);

const taskExecutionRouter = require('./task-execution-api');
console.log('[routes/index.js] taskExecutionRouter loaded:', typeof taskExecutionRouter);

const agentAuthRouter = require('./agent-auth-api');
console.log('[routes/index.js] agentAuthRouter loaded:', typeof agentAuthRouter);

const progressPushRouter = require('./progress-push-api');
console.log('[routes/index.js] progressPushRouter loaded:', typeof progressPushRouter);

const taskExecutionCoreRouter = require('./task-execution-core-api');
console.log('[routes/index.js] taskExecutionCoreRouter loaded:', typeof taskExecutionCoreRouter);

const fileRouter = require('./file-api');
console.log('[routes/index.js] fileRouter loaded:', typeof fileRouter);

const calendarRouter = require('./calendar-api');
console.log('[routes/index.js] calendarRouter loaded:', typeof calendarRouter);

const reviewRouter = require('./review-api');
console.log('[routes/index.js] reviewRouter loaded:', typeof reviewRouter);

const worklogRouter = require('./worklog-api');
const pm2StatusRouter = require('./pm2-status-api');
console.log('[routes/index.js] worklogRouter loaded:', typeof worklogRouter);
console.log('[routes/index.js] pm2StatusRouter loaded:', typeof pm2StatusRouter);

const chatRouter = require('./chat-api');
console.log('[routes/index.js] chatRouter loaded:', typeof chatRouter);

const agentOrgRouter = require('./agent-org-api');
console.log('[routes/index.js] agentOrgRouter loaded:', typeof agentOrgRouter);

const docsSkillsRouter = require('./docs-skills-api');
console.log('[routes/index.js] docsSkillsRouter loaded:', typeof docsSkillsRouter);

const apiCatalogRouter = require('./api-catalog-api');
console.log('[routes/index.js] apiCatalogRouter loaded:', typeof apiCatalogRouter);

const serviceMonitorRouter = require('./service-monitor-api-v2');
console.log('[routes/index.js] serviceMonitorRouter v2 loaded:', typeof serviceMonitorRouter);

const memoryRouter = require('./memory-api');
console.log('[routes/index.js] memoryRouter loaded:', typeof memoryRouter);

const reflectionRouter = require('./reflection-api');
console.log('[routes/index.js] reflectionRouter loaded:', typeof reflectionRouter);

const taskDeletionRouter = require('./task-deletion-api');
console.log('[routes/index.js] taskDeletionRouter loaded:', typeof taskDeletionRouter);

const issueRouter = require('./issue-api');
console.log('[routes/index.js] issueRouter loaded:', typeof issueRouter);

const issuesRouter = require('./issues-api');
console.log('[routes/index.js] issuesRouter loaded:', typeof issuesRouter);

const userAuthRouter = require('./user-auth-api');
console.log('[routes/index.js] userAuthRouter loaded:', typeof userAuthRouter);

// Deploy 模块 - 使用模块化版本
const deployModule = require('../modules/deploy');
const deployRouter = deployModule.routes;
console.log('[routes/index.js] deployRouter (模块化) loaded:', typeof deployRouter);

const knowledgeRouter = require('./knowledge/api');
console.log('[routes/index.js] knowledgeRouter loaded:', typeof knowledgeRouter);

const knowledgeEnhancedRouter = require('./knowledge/enhanced-api');
console.log('[routes/index.js] knowledgeEnhancedRouter loaded:', typeof knowledgeEnhancedRouter);

const knowledgeScoringRouter = require('./knowledge/scoring-api');
console.log('[routes/index.js] knowledgeScoringRouter loaded:', typeof knowledgeScoringRouter);

// V3 核心 API
const scenariosRouter = require('./scenarios');
console.log('[routes/index.js] scenariosRouter loaded:', typeof scenariosRouter);

const productsV3Router = require('./products');
console.log('[routes/index.js] productsV3Router loaded:', typeof productsV3Router);

// 工作场景模块 API
const workRouter = require('../modules/work/routes');
console.log('[routes/index.js] workRouter loaded:', typeof workRouter);
const sqliteV2Router = require('./sqlite-v2-api');
console.log('[routes/index.js] sqliteV2Router loaded:', typeof sqliteV2Router);

const licenseMigrationRouter = require('./license-migration-api');
console.log('[routes/index.js] licenseMigrationRouter loaded:', typeof licenseMigrationRouter);

const licenseRenewalRouter = require('./license-renewal-api');
console.log('[routes/index.js] licenseRenewalRouter loaded:', typeof licenseRenewalRouter);

const licenseVerifyRouter = require('./license-verify-api');
console.log('[routes/index.js] licenseVerifyRouter loaded:', typeof licenseVerifyRouter);

const queueRouter = require('./queue-routes');
console.log('[routes/index.js] queueRouter loaded:', typeof queueRouter);

// Planning API（Google Planning 模式）
const planningRouter = require('./planning-api');
console.log('[routes/index.js] planningRouter loaded:', typeof planningRouter);

// 任务详情增强 API（4 模式可视化）
const taskDetailEnhancedRouter = require('./task-detail-enhanced-api');
console.log('[routes/index.js] taskDetailEnhancedRouter loaded:', typeof taskDetailEnhancedRouter);

// 文档名称映射 API
const docNameMappingRouter = require('./doc-name-mapping-api');
console.log('[routes/index.js] docNameMappingRouter loaded:', typeof docNameMappingRouter);

// 用户认证 API
const authApiRouter = require('./auth-api');
console.log('[routes/index.js] authApiRouter loaded:', typeof authApiRouter);

// 审计日志 API
const auditLogRouter = require('./audit-log-api');
console.log('[routes/index.js] auditLogRouter loaded:', typeof auditLogRouter);

// 系统检查 API
const systemCheckRouter = require('./system-check-api');
console.log('[routes/index.js] systemCheckRouter loaded:', typeof systemCheckRouter);

const checklistsRouter = require('./checklists-api');
console.log('[routes/index.js] checklistsRouter loaded:', typeof checklistsRouter);

const alertsRouter = require('./alerts-api');
console.log('[routes/index.js] alertsRouter loaded:', typeof alertsRouter);

const v6MetricsRouter = require('./v6-metrics-api');
console.log('[routes/index.js] v6MetricsRouter loaded:', typeof v6MetricsRouter);

// Learning Paths API
const learningPathsRouter = require('./learning-paths-api');
console.log('[routes/index.js] learningPathsRouter loaded:', typeof learningPathsRouter);

// Tasks from Chat SQLite API
const tasksFromChatSQLiteRouter = require('./tasks-from-chat-sqlite');
console.log('[routes/index.js] tasksFromChatSQLiteRouter loaded:', typeof tasksFromChatSQLiteRouter);

const imChannelRouter = require('./im-channel-api');
console.log('[routes/index.js] imChannelRouter loaded:', typeof imChannelRouter);

// Fix Queue API
const fixQueueRouter = require('./fix-queue');
console.log('[routes/index.js] fixQueueRouter loaded:', typeof fixQueueRouter);

const taskStatusRouter = require('./task-status-api');
console.log('[routes/index.js] taskStatusRouter loaded:', typeof taskStatusRouter);

module.exports = (app) => {
  console.log('[routes/index.js] route module called with app');

  // 数据目录静态访问（用于前端读取 JSON 文件）
  const dataPath = path.join(__dirname, '..', 'data');
  app.use('/data', express.static(dataPath));
  console.log('[routes/index.js] Mounted /data static files');

  // 任务数据直接读取 API（绕过认证问题）
  app.get('/api/all-tasks', (req, res) => {
    try {
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      if (req.query.project_id) filter.project_id = req.query.project_id;
      
      const tasks = db.tasks.list(filter);
      res.json({ success: true, data: tasks });
    } catch (e) {
      console.error('[/api/all-tasks] Error:', e.message);
      res.json({ success: false, error: e.message, data: [] });
    }
  });
  console.log('[routes/index.js] Mounted /api/all-tasks');

  // API 路由
  app.use('/api/kb', kbRoutes);
  console.log('[routes/index.js] Mounted /api/kb');

  app.use('/api/agent-management', agentManagementRouter);
  console.log('[routes/index.js] Mounted /api/agent-management');

  app.use('/api/model-management', modelManagementRouter);
  console.log('[routes/index.js] Mounted /api/model-management');

  app.use('/api/notifications', notificationsRouter);
  console.log('[routes/index.js] Mounted /api/notifications');

  // simulatedDataRoutes(app);
  // console.log('[routes/index.js] Mounted simulated data routes');
  // ⚠️ 已禁用模拟数据路由，避免覆盖真实数据

  app.use('/api/system', systemMonitorRouter);
  console.log('[routes/index.js] Mounted /api/system');

  // System Monitor V3 API (全面监控)
  app.use('/api/system', systemMonitorV3Router);
  console.log('[routes/index.js] Mounted /api/system (v3)');

  app.use('/api/tasks', taskExecutionRouter);
  console.log('[routes/index.js] Mounted /api/tasks');

  app.use('/api/auth', agentAuthRouter);
  console.log('[routes/index.js] Mounted /api/auth');

  app.use('/api/progress', progressPushRouter);
  console.log('[routes/index.js] Mounted /api/progress');

  // Task Execution Core API: /api/task-execution/*
  app.use('/api/task-execution', taskExecutionCoreRouter);
  console.log('[routes/index.js] Mounted /api/task-execution');

  // File API: /api/file/*
  app.use('/api/file', fileRouter);
  console.log('[routes/index.js] Mounted /api/file');

  // Calendar API: /api/calendar/*
  app.use('/api/calendar', calendarRouter);
  console.log('[routes/index.js] Mounted /api/calendar');

  // Review API: /api/review/*
  app.use('/api/review', reviewRouter);
  console.log('[routes/index.js] Mounted /api/review');

  // Worklog API: /api/worklog/*
  app.use('/api/worklog', worklogRouter);
  console.log('[routes/index.js] Mounted /api/worklog');

  // PM2 Status API: /api/pm2/*
  app.use('/api', pm2StatusRouter);
  console.log('[routes/index.js] Mounted /api/pm2/status');

  // Chat API: /api/chat/*
  app.use('/api/chat', chatRouter);
  console.log('[routes/index.js] Mounted /api/chat');

  // Agent Organization API: /api/agents/*
  app.use('/api/agents', agentOrgRouter);
  console.log('[routes/index.js] Mounted /api/agents');

  // Alerts API: /api/alerts/*
  app.use('/api/alerts', alertsRouter);
  console.log('[routes/index.js] Mounted /api/alerts');

  // V6 Metrics API: /api/metrics/*
  app.use('/api/metrics', v6MetricsRouter);
  console.log('[routes/index.js] Mounted /api/metrics');

  // Docs & Skills API: /api/resources/*
  app.use('/api/resources', docsSkillsRouter);
  console.log('[routes/index.js] Mounted /api/resources');

  // API Catalog: /api/api-catalog/*
  app.use('/api/api-catalog', apiCatalogRouter);
  console.log('[routes/index.js] Mounted /api/api-catalog');
  
  // Service Monitor: /api/monitor/*
  app.use('/api/monitor', serviceMonitorRouter);
  console.log('[routes/index.js] Mounted /api/monitor');

  // Audit Logs: /api/audit-logs/*
  app.use('/api/audit-logs', auditLogRouter);
  console.log('[routes/index.js] Mounted /api/audit-logs');

  // System Check: /api/system-check/*
  app.use('/api/system', systemCheckRouter);
  console.log('[routes/index.js] Mounted /api/system (check)');

  // Checklists API: /api/checklists/*
  app.use('/api/checklists', checklistsRouter);
  console.log('[routes/index.js] Mounted /api/checklists');

  // Memory System API: /api/memory/*
  app.use('/api/memory', memoryRouter);
  console.log('[routes/index.js] Mounted /api/memory');

  // Reflection System API: /api/reflection/*
  app.use('/api/reflection', reflectionRouter);
  console.log('[routes/index.js] Mounted /api/reflection');

  // Task Reflection API: /api/tasks/:id/reflect
  const taskReflectionRouter = require('./task-reflection-api');
  app.use('/api/tasks', taskReflectionRouter);
  console.log('[routes/index.js] Mounted /api/tasks (reflection)');

  // Reflection Records API: /api/reflections/* (separate from basic reflection-api)
  const reflectionRecordsRouter = require('./task-reflection-api');  // Use dedicated task-reflection-api for records
  app.use('/api/reflections', reflectionRecordsRouter);
  console.log('[routes/index.js] Mounted /api/reflections (records)');

  // Task Deletion API: /api/deletion/*
  app.use('/api/deletion', taskDeletionRouter);
  console.log('[routes/index.js] Mounted /api/deletion');

  // Planning API: /api/planning/* (Google Planning 模式)
  app.use('/api/planning', planningRouter);
  console.log('[routes/index.js] Mounted /api/planning');

  // Task Detail Enhanced API: /api/task-detail/* (4 模式可视化)
  app.use('/api/task-detail', taskDetailEnhancedRouter);
  console.log('[routes/index.js] Mounted /api/task-detail');

  // Doc Name Mapping API: /api/doc-mapping/*
  app.use('/api/doc-mapping', docNameMappingRouter);
  console.log('[routes/index.js] Mounted /api/doc-mapping');

  // Issue Management API: /api/issues/*
  app.use('/api/issues', issueRouter);
  console.log('[routes/index.js] Mounted /api/issues');

  // Issues Management API: /api/issues/* (issues-api.js)
  app.use('/api/issues', issuesRouter);
  console.log('[routes/index.js] Mounted /api/issues (issues-api.js)');

  // User Authentication API: /api/user-auth/*
  app.use('/api/user-auth', userAuthRouter);
  console.log('[routes/index.js] Mounted /api/user-auth (user authentication)');

  // User Auth API: /api/auth (login, logout, verify)
  app.use('/api/auth', authApiRouter);
  console.log('[routes/index.js] Mounted /api/auth (user authentication v2)');

  // Remote Deploy API: /api/deploy/*
  // Deploy 模块路由
  app.use('/api/deploy', deployRouter);
  console.log('[routes/index.js] deploy router registered at /api/deploy');
  console.log('[routes/index.js] Mounted / (deploy API)');

  // Knowledge Management API: /api/knowledge/*
  app.use('/api/knowledge', knowledgeRouter);
  console.log('[routes/index.js] Mounted /api/knowledge');

  // Knowledge Enhanced API: /api/knowledge/* (overwrites/adds)
  app.use('/api/knowledge', knowledgeEnhancedRouter);
  console.log('[routes/index.js] Mounted /api/knowledge (enhanced)');

  // Knowledge Scoring API: /api/knowledge/*
  app.use('/api/knowledge', knowledgeScoringRouter);
  console.log('[routes/index.js] Mounted /api/knowledge (scoring)');

  // ========== 工作场景模块 API ==========
  app.use('/api/work', workRouter);
  console.log('[routes/index.js] Mounted /api/work');

  // ========== 队列管理 API ==========
  app.use('/api/queues', queueRouter);
  console.log('[routes/index.js] Mounted /api/queues');

  // ========== 健康检查 API ==========
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '3.0.0'
    });
  });
  console.log('[routes/index.js] Mounted /api/health');

  // ========== 许可证管理 API ==========
  // 许可证迁移：/api/license/migration/*
  app.use('/api/license/migration', licenseMigrationRouter);
  console.log('[routes/index.js] Mounted /api/license/migration');

  // 许可证续期：/api/license/renewal/*
  app.use('/api/license/renewal', licenseRenewalRouter);
  console.log('[routes/index.js] Mounted /api/license/renewal');

  // 许可证验证：/api/license/*
  app.use('/api/license', licenseVerifyRouter);
  console.log('[routes/index.js] Mounted /api/license');

  // PC 控制：/api/pc/*
  const pcControllerRouter = require('./pc-controller-api');
  app.use('/api/pc', pcControllerRouter);
  console.log('[routes/index.js] Mounted /api/pc');

  // ========== ���务监控 API ==========
  app.get('/api/system/executors', (req, res) => {
    res.json({
      success: true,
      executors: [
        { id: 'exec-1', name: '任务执行器', status: 'online', tasksCompleted: 156, lastActive: new Date().toISOString() },
        { id: 'exec-2', name: 'Agent调度器', status: 'online', tasksCompleted: 89, lastActive: new Date().toISOString() },
        { id: 'exec-3', name: '自动化处理器', status: 'idle', tasksCompleted: 45, lastActive: new Date(Date.now() - 300000).toISOString() }
      ],
      total: 3
    });
  });

  app.get('/api/system/monitors', (req, res) => {
    res.json({
      success: true,
      monitors: [
        { id: 'mon-1', name: '系统健康检查', status: 'running', interval: 30000, lastCheck: new Date().toISOString() },
        { id: 'mon-2', name: '任务队列监控', status: 'running', interval: 10000, lastCheck: new Date().toISOString() },
        { id: 'mon-3', name: 'Agent状态监控', status: 'paused', interval: 60000, lastCheck: new Date(Date.now() - 120000).toISOString() }
      ],
      total: 3
    });
  });

  app.get('/api/system/issues', (req, res) => {
    res.json({
      success: true,
      issues: [
        { id: 'issue-1', severity: 'warning', title: '任务队列积压', description: '有3个任务等待处理', status: 'open', createdAt: new Date().toISOString() },
        { id: 'issue-2', severity: 'info', title: 'Agent空闲', description: 'deep agent 超过1小时未活动', status: 'acknowledged', createdAt: new Date(Date.now() - 3600000).toISOString() }
      ],
      total: 2
    });
  });

  // 研发管理API
  const devopsRouter = require('./devops-api');
  app.use('/api/devops', devopsRouter);
  console.log('[routes/index.js] 研发管理 API 已挂载');

  // V3 核心 API
  app.use('/api/scenarios', scenariosRouter);
  app.use('/api/products-v3', productsV3Router);
  console.log('[routes/index.js] V3 核心 API 已挂载');

  // ========== Agent 列表 API ==========
  app.get('/api/agents/list', async (req, res) => {
    try {
      // 读取 registered-agents.json 获取真实状态
      const fs = require('fs');
      const path = require('path');
      const agentsFile = path.join(__dirname, '../data/registered-agents.json');
      
      if (fs.existsSync(agentsFile)) {
        const data = JSON.parse(fs.readFileSync(agentsFile, 'utf8'));
        const agents = Object.values(data.agents || {}).map(agent => ({
          id: agent.id,
          name: agent.name,
          status: agent.status === 'healthy' ? 'online' : agent.status,
          lastHeartbeat: agent.lastHeartbeat,
          currentTask: agent.currentTask
        }));
        res.json({ success: true, data: agents });
      } else {
        throw new Error('registered-agents.json not found');
      }
    } catch (error) {
      console.error('[agents/list] Error:', error.message);
      // 返回默认列表
      res.json({ success: true, data: [
        { id: 'agent-main', name: 'Main Agent', status: 'offline' },
        { id: 'agent-coder', name: 'Coder Agent', status: 'offline' },
        { id: 'agent-deep', name: 'Deep Agent', status: 'offline' },
        { id: 'agent-fast', name: 'Fast Agent', status: 'offline' },
        { id: 'agent-chat', name: 'Chat Agent', status: 'offline' },
        { id: 'agent-test', name: 'Test Agent', status: 'offline' },
        { id: 'agent-office', name: 'Office Agent', status: 'offline' }
      ]});
    }
  });
  console.log('[routes/index.js] Mounted /api/agents/list');

  // ========== 客户管理后台 API ==========
  const customerAdminRouter = require('./customer-admin-api');
  app.use('/api', customerAdminRouter);
  console.log('[routes/index.js] 客户管理后台 API 已挂载');

  console.log('[routes/index.js] 业务监控 API 已挂载');

  // ========== Learning Paths API ==========
  app.use('/api/learning-paths', learningPathsRouter);
  console.log('[routes/index.js] Learning Paths API 已挂载');

  // ========== Tasks from Chat SQLite API ==========
  app.use('/api/tasks/from-chat', tasksFromChatSQLiteRouter);
  console.log('[routes/index.js] Tasks from Chat SQLite API 已挂载');

  // ========== SQLite v2 API ==========
  app.use('/api', sqliteV2Router);
  console.log('[routes/index.js] SQLite v2 API 已挂载');
  
  // ========== IM 渠道 API ==========
  app.use('/api/im-channel', imChannelRouter);
  console.log('[routes/index.js] IM 渠道 API 已挂载');
  
  // ========== 修复队列 API ==========
  app.use('/api/fix-queue', fixQueueRouter);
  console.log('[routes/index.js] 修复队列 API 已挂载');
  
  // ========== 任务状态 API ==========
  app.use('/api/tasks', taskStatusRouter);
  console.log('[routes/index.js] 任务状态 API 已挂载');
  
  // ========== 任务完成 API ==========
  // POST /api/tasks/:id/complete
  console.log('[routes/index.js] 任务完成 API 已挂载');

  // ========== 验收 API ==========
  const acceptanceRouter = require('./api/acceptance');
  app.use('/api/acceptance', acceptanceRouter);
  console.log('[routes/index.js] 验收 API 已挂载');

  // ========== 反思 API (已在上方挂载) ==========
  // 第74行已定义 reflectionRouter
  app.use('/api/reflections', reflectionRouter);  // 复用已定义的 router
  console.log('[routes/index.js] 反思 API (/reflections) 已挂载');
};
