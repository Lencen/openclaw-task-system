/**
 * 任务管理平台 V3 - 主入口
 * 
 * @version 3.0.0
 * @created 2026-03-19
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./utils/db');

// 导入中间件
const { validateReflectionBeforeCompletion, handleStatusChangeAfterValidation } = require('./middleware/reflection-validation');

// 导入路由
const scenariosRouter = require('../routes/scenarios');
const productsRouter = require('../routes/products');
const tasksRouter = require('../routes/tasks');
const agentsRouter = require('../routes/agents');
const projectsRouter = require('../routes/projects');
const reviewsRouter = require('../routes/reviews');
const issuesApiRouter = require('../routes/issues-api');
const acceptanceRouter = require('./routes/api/acceptance');
const taskCompletionHookRouter = require('./routes/api/task-completion-hook');

// 创建应用
const app = express();

// 配置
const PORT = process.env.PORT || 8081;
const HOST = process.env.HOST || '0.0.0.0';

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 任务完成反思验证中间件
app.use(validateReflectionBeforeCompletion);
app.use(handleStatusChangeAfterValidation);

// 静态文件
app.use('/public', express.static(path.join(__dirname, '../public')));

// 请求日志
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[API] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// API 路由
app.use('/api/scenarios', scenariosRouter);
app.use('/api/products', productsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/issues', issuesApiRouter);
app.use('/api/acceptance', acceptanceRouter);
app.use('/api/task-completion-hook', taskCompletionHookRouter);

// 首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found'
  });
});

// 启动服务器
async function start() {
  try {
    // 初始化数据库
    console.log('[Startup] 初始化数据库...');
    await db.initDatabase();

    // 启动 HTTP 服务
    app.listen(PORT, HOST, () => {
      console.log(`[Startup] 服务器启动成功: http://${HOST}:${PORT}`);
      console.log(`[Startup] API 文档: http://${HOST}:${PORT}/`);
    });
  } catch (error) {
    console.error('[Startup] 启动失败:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n[Shutdown] 收到 SIGINT 信号，正在关闭...');
  await db.closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Shutdown] 收到 SIGTERM 信号，正在关闭...');
  await db.closeDatabase();
  process.exit(0);
});

// 启动
start();

module.exports = app;