/**
 * 研发管理体系API
 * 
 * 包含：
 * - 产品管理API
 * - 项目管理API
 * - 版本管理API
 * - 发布流程API
 * - 文档管理API
 * 
 * 数据源：SQLite 数据库 (devops.db)
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '../data/devops');
const DB_PATH = path.join(__dirname, '../data/devops.db');
const TASKS_DB_PATH = path.join(__dirname, '../data/tasks.db');

// ================== 工具函数 ==================

// 生成唯一 ID
function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ================== 产品管理API ==================

// 获取产品列表
router.get('/products', (req, res) => {
  const db = new Database(DB_PATH);
  const products = db.prepare('SELECT * FROM products').all();
  db.close();
  res.json({ success: true, data: products });
});

// 获取产品详情
router.get('/products/:id', (req, res) => {
  const db = new Database(DB_PATH);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  db.close();
  
  if (!product) {
    return res.status(404).json({ success: false, error: '产品不存在' });
  }
  
  res.json({ success: true, data: product });
});

// 创建产品
router.post('/products', (req, res) => {
  const { name, code, description, target_users, value, capabilities, owner } = req.body;
  const db = new Database(DB_PATH);
  
  const newProduct = {
    id: generateId('prod'),
    name,
    code: code || name.toUpperCase().replace(/\s+/g, '-'),
    description,
    target_users,
    value,
    capabilities: JSON.stringify(capabilities || []),
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    owner
  };
  
  db.prepare(`
    INSERT INTO products 
    (id, name, code, description, target_users, value, capabilities, status, owner, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newProduct.id,
    newProduct.name,
    newProduct.code,
    newProduct.description,
    newProduct.target_users,
    newProduct.value,
    newProduct.capabilities,
    newProduct.status,
    newProduct.owner,
    newProduct.created_at,
    newProduct.updated_at
  );
  
  db.close();
  res.json({ success: true, data: newProduct });
});

// 更新产品
router.put('/products/:id', (req, res) => {
  const db = new Database(DB_PATH);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  
  if (!product) {
    db.close();
    return res.status(404).json({ success: false, error: '产品不存在' });
  }
  
  const capabilities = typeof req.body.capabilities === 'string' 
    ? req.body.capabilities 
    : JSON.stringify(req.body.capabilities || []);
  
  db.prepare(`
    UPDATE products 
    SET name = ?, code = ?, description = ?, target_users = ?, 
        value = ?, capabilities = ?, status = ?, owner = ?, updated_at = ?
    WHERE id = ?
  `).run(
    req.body.name || product.name,
    req.body.code || product.code,
    req.body.description || product.description,
    req.body.target_users || product.target_users,
    req.body.value || product.value,
    capabilities,
    req.body.status || product.status,
    req.body.owner || product.owner,
    new Date().toISOString(),
    req.params.id
  );
  
  const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  db.close();
  res.json({ success: true, data: updatedProduct });
});

// ================== 项目管理API ==================

// 获取项目列表
router.get('/projects', (req, res) => {
  const db = new Database(DB_PATH);
  
  let projects;
  if (req.query.product_id) {
    projects = db.prepare('SELECT * FROM projects WHERE product_id = ?').all(req.query.product_id);
  } else {
    projects = db.prepare('SELECT * FROM projects').all();
  }
  
  // 获取关联任务 - 使用 SQLite DAL
  const tasksDb = new Database(TASKS_DB_PATH);
  const tasks = tasksDb.prepare('SELECT * FROM tasks').all();
  tasksDb.close();
  
  // 为每个项目添加任务统计
  const result = projects.map(project => {
    const projectTasks = tasks.filter(t => t.project_id === project.id || t.projectId === project.id);
    const taskStats = {
      total_tasks: projectTasks.length,
      completed_tasks: projectTasks.filter(t => t.status === 'completed').length
    };
    
    // 智能状态
    const smartStatus = taskStats.total_tasks > 0 && taskStats.completed_tasks >= taskStats.total_tasks
      ? 'completed'
      : project.status;
    
    return {
      ...project,
      ...taskStats,
      status: smartStatus
    };
  });
  
  db.close();
  res.json({ success: true, data: result });
});

// 获取项目详情
router.get('/projects/:id', (req, res) => {
  const db = new Database(DB_PATH);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  
  if (!project) {
    db.close();
    return res.status(404).json({ success: false, error: '项目不存在' });
  }
  
  // 获取关联的任务 - 使用 SQLite DAL
  const tasksDb = new Database(TASKS_DB_PATH);
  let tasks = tasksDb.prepare('SELECT * FROM tasks').all();
  tasksDb.close();
  
  const projectTasks = tasks.filter(t => t.project_id === req.params.id || t.projectId === req.params.id);
  
  // 动态计算任务统计（不依赖存储的字段）
  const taskStats = {
    total_tasks: projectTasks.length,
    completed_tasks: projectTasks.filter(t => t.status === 'completed').length
  };
  
  // 智能状态：所有任务完成后项目状态应为 completed
  const smartStatus = taskStats.total_tasks > 0 && taskStats.completed_tasks >= taskStats.total_tasks
    ? 'completed'
    : project.status;
  
  db.close();
  
  res.json({ 
    success: true, 
    data: {
      ...project,
      ...taskStats,
      status: smartStatus,
      tasks: projectTasks
    } 
  });
});

// 创建项目
router.post('/projects', (req, res) => {
  const { 
    product_id, name, version, description, 
    start_date, plan_release_date, milestones 
  } = req.body;
  
  const db = new Database(DB_PATH);
  
  const newProject = {
    id: generateId('proj'),
    product_id,
    name,
    version: version || '1.0.0',
    status: 'planning',
    environment: 'develop',
    code_version: `${version || '1.0.0'}-dev`,
    doc_version: `${version || '1.0.0'}-draft`,
    start_date,
    plan_release_date,
    actual_release_date: null,
    description,
    milestones: milestones ? JSON.stringify(milestones) : '[]',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  db.prepare(`
    INSERT INTO projects 
    (id, name, product_id, description, status, environment, code_version, doc_version,
     start_date, plan_release_date, actual_release_date, milestones, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newProject.id,
    newProject.name,
    newProject.product_id,
    newProject.description,
    newProject.status,
    newProject.environment,
    newProject.code_version,
    newProject.doc_version,
    newProject.start_date,
    newProject.plan_release_date,
    newProject.actual_release_date,
    newProject.milestones,
    newProject.created_at,
    newProject.updated_at
  );
  
  const createdProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(newProject.id);
  db.close();
  
  res.json({ success: true, data: createdProject });
});

// 更新项目状态
router.put('/projects/:id/status', (req, res) => {
  const { status, environment } = req.body;
  const db = new Database(DB_PATH);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  
  if (!project) {
    db.close();
    return res.status(404).json({ success: false, error: '项目不存在' });
  }
  
  db.prepare(`
    UPDATE projects 
    SET status = ?, environment = ?, updated_at = ?
    WHERE id = ?
  `).run(
    status || project.status,
    environment || project.environment,
    new Date().toISOString(),
    req.params.id
  );
  
  const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  db.close();
  res.json({ success: true, data: updatedProject });
});

// ================== 版本管理API ==================

// 获取版本列表
router.get('/versions', (req, res) => {
  const db = new Database(DB_PATH);
  
  let versions = db.prepare('SELECT * FROM versions').all();
  
  // 支持筛选
  const { product_id, project_id, environment } = req.query;
  if (product_id) versions = versions.filter(v => v.product_id === product_id);
  if (project_id) versions = versions.filter(v => v.project_id === project_id);
  if (environment) versions = versions.filter(v => v.environment === environment);
  
  db.close();
  res.json({ success: true, data: versions });
});

// 创建版本
router.post('/versions', (req, res) => {
  const { 
    type, product_id, project_id, number, 
    environment, git_branch, git_commit, changelog 
  } = req.body;
  
  const db = new Database(DB_PATH);
  
  const newVersion = {
    id: generateId('ver'),
    type: type || 'code',
    number,
    environment,
    product_id,
    project_id,
    git_info: JSON.stringify({
      branch: git_branch,
      commit: git_commit,
      tag: number
    }),
    changelog: JSON.stringify(changelog || []),
    created_at: new Date().toISOString(),
    created_by: req.body.created_by || 'system'
  };
  
  db.prepare(`
    INSERT INTO versions 
    (id, type, number, environment, product_id, project_id, git_info, changelog, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newVersion.id,
    newVersion.type,
    newVersion.number,
    newVersion.environment,
    newVersion.product_id,
    newVersion.project_id,
    newVersion.git_info,
    newVersion.changelog,
    newVersion.created_at,
    newVersion.created_by
  );
  
  const createdVersion = db.prepare('SELECT * FROM versions WHERE id = ?').get(newVersion.id);
  db.close();
  
  res.json({ success: true, data: createdVersion });
});

// 对比两个版本
router.get('/versions/compare/:version1/:version2', (req, res) => {
  const db = new Database(DB_PATH);
  const { version1, version2 } = req.params;
  
  const v1 = db.prepare('SELECT * FROM versions WHERE number = ?').get(version1);
  const v2 = db.prepare('SELECT * FROM versions WHERE number = ?').get(version2);
  
  db.close();
  
  if (!v1 || !v2) {
    return res.status(404).json({ success: false, error: '版本不存在' });
  }
  
  // 简单对比
  const diff = {
    version1: v1,
    version2: v2,
    differences: {
      changelog_diff: (JSON.parse(v2.changelog || '[]')).filter(
        c => !(JSON.parse(v1.changelog || '[]')).some(c1 => c1.description === c.description)
      )
    }
  };
  
  res.json({ success: true, data: diff });
});

// ================== 发布流程API ==================

// 发布检查配置（支持多种key格式）
const CHECK_CONFIG = {
  'dev_to_staging': {
    name: '开发→测试发布检查',
    from_env: 'develop',
    to_env: 'staging',
    required_docs: ['requirement', 'analysis', 'tech', 'review', 'code'],
    required_tests: ['unit_test', 'self_test'],
    code_checks: ['lint', 'security'],
    min_pass_rate: 80,
    required_permissions: ['submit_code']
  },
  'staging_to_prod': {
    name: '测试→正式发布检查',
    from_env: 'staging',
    to_env: 'production',
    required_docs: ['requirement', 'analysis', 'tech', 'review', 'code'],
    required_tests: ['unit_test', 'integration_test', 'performance_test', 'security_test'],
    required_reports: ['test_report', 'release_note'],
    code_checks: ['lint', 'security', 'coverage'],
    min_pass_rate: 100,
    required_permissions: ['release_to_prod', 'approve_release']
  }
};

// 执行发布检查
router.post('/releases/check', (req, res) => {
  const { project_id, from_env, to_env, user_id } = req.body;
  
  // 获取检查配置
  const checkKey = `${from_env}_to_${to_env}`;
  const config = CHECK_CONFIG[checkKey];
  
  if (!config) {
    return res.status(400).json({ 
      success: false, 
      error: '不支持的发布流程',
      supported_flows: Object.keys(CHECK_CONFIG)
    });
  }
  
  // 获取项目信息
  const db = new Database(DB_PATH);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id);
  db.close();
  
  if (!project) {
    return res.status(404).json({ success: false, error: '项目不存在' });
  }
  
  // 获取关联文档
  const documentsDb = new Database(TASKS_DB_PATH);
  const documents = documentsDb.prepare('SELECT * FROM documents_index').all();
  documentsDb.close();
  
  const projectDocs = documents.filter(d => d.project_id === project_id);
  
  // ================== 1. 文档检查 ==================
  const docsCheck = config.required_docs.map(docType => {
    const doc = projectDocs.find(d => d.type === docType);
    return {
      type: docType,
      required: true,
      exists: !!doc,
      name: getDocTypeName(docType),
      status: doc?.version?.status || 'missing',
      approved: doc?.version?.status === 'approved'
    };
  });
  
  const docsPassed = docsCheck.filter(d => d.approved).length;
  const docsFailed = docsCheck.filter(d => d.required && !d.approved).length;
  
  // ================== 2. 测试检查 ==================
  const testsCheck = config.required_tests.map(testType => {
    const mockTestResults = {
      'unit_test': { status: 'passed', coverage: 85 },
      'self_test': { status: 'passed' },
      'integration_test': { status: 'passed' },
      'performance_test': { status: 'passed', response_time: 120 },
      'security_test': { status: 'passed', vulnerabilities: 0 }
    };
    const result = mockTestResults[testType] || { status: 'unknown' };
    
    return {
      type: testType,
      required: true,
      name: getTestTypeName(testType),
      status: result.status,
      passed: result.status === 'passed',
      details: result
    };
  });
  
  const testsPassed = testsCheck.filter(t => t.passed).length;
  const testsFailed = testsCheck.filter(t => t.required && !t.passed).length;
  
  // ================== 3. 代码检查 ==================
  const codeChecks = (config.code_checks || []).map(checkType => {
    const mockCodeResults = {
      'lint': { status: 'passed', issues: 0 },
      'security': { status: 'passed', vulnerabilities: 0 },
      'coverage': { status: 'passed', coverage: 85 }
    };
    const result = mockCodeResults[checkType] || { status: 'unknown' };
    
    return {
      type: checkType,
      name: getCodeCheckName(checkType),
      status: result.status,
      passed: result.status === 'passed',
      details: result
    };
  });
  
  const codePassed = codeChecks.filter(c => c.passed).length;
  const codeFailed = codeChecks.filter(c => !c.passed).length;
  
  // ================== 4. 权限检查 ==================
  const userId = user_id || req.headers['x-user-id'] || 'system';
  let permissionCheck = {
    user: userId,
    has_permission: true,
    missing_permissions: []
  };
  
  if (config.required_permissions && userId !== 'system') {
    const permResult = checkUserPermissions(userId, config.required_permissions);
    permissionCheck = {
      user: userId,
      role: permResult.role,
      has_permission: permResult.allowed,
      permissions_checked: config.required_permissions,
      granted_permissions: permResult.granted,
      missing_permissions: permResult.missing
    };
  }
  
  // ================== 汇总结果 ==================
  const totalRequired = docsCheck.length + testsCheck.length + codeChecks.length + (config.required_permissions?.length || 0);
  const totalPassed = docsPassed + testsPassed + codePassed + (permissionCheck.has_permission ? config.required_permissions?.length || 0 : 0);
  const totalFailed = docsFailed + testsFailed + codeFailed + (permissionCheck.has_permission ? 0 : config.required_permissions?.length || 0);
  
  const passRate = totalRequired > 0 ? (totalPassed / totalRequired) * 100 : 100;
  
  const checkResults = {
    project_id,
    project_name: project.name,
    from_env: config.from_env,
    to_env: config.to_env,
    flow_name: config.name,
    check_time: new Date().toISOString(),
    checks: {
      docs: docsCheck,
      tests: testsCheck,
      code_checks: codeChecks,
      permissions: permissionCheck
    },
    can_proceed: passRate >= config.min_pass_rate && permissionCheck.has_permission,
    pass_rate: Math.round(passRate),
    min_pass_rate: config.min_pass_rate,
    summary: {
      docs: { total: docsCheck.length, passed: docsPassed, failed: docsFailed },
      tests: { total: testsCheck.length, passed: testsPassed, failed: testsFailed },
      code_checks: { total: codeChecks.length, passed: codePassed, failed: codeFailed },
      permissions: { 
        total: config.required_permissions?.length || 0, 
        passed: permissionCheck.has_permission ? config.required_permissions?.length || 0 : 0,
        failed: permissionCheck.has_permission ? 0 : config.required_permissions?.length || 0
      }
    },
    blockers: [
      ...docsCheck.filter(d => d.required && !d.approved).map(d => `文档未审批: ${d.name}`),
      ...testsCheck.filter(t => t.required && !t.passed).map(t => `测试未通过: ${t.name}`),
      ...codeChecks.filter(c => !c.passed).map(c => `代码检查失败: ${c.name}`),
      ...(permissionCheck.has_permission ? [] : [`缺少权限: ${permissionCheck.missing_permissions.join(', ')}`])
    ]
  };
  
  res.json({ success: true, data: checkResults });
});

// 辅助函数：获取文档类型名称
function getDocTypeName(type) {
  const names = {
    'requirement': '需求文档',
    'analysis': '分析文档',
    'tech': '技术文档',
    'review': '评审文档',
    'code': '代码文档'
  };
  return names[type] || type;
}

// 辅助函数：获取测试类型名称
function getTestTypeName(type) {
  const names = {
    'unit_test': '单元测试',
    'self_test': '自测',
    'integration_test': '集成测试',
    'performance_test': '性能测试',
    'security_test': '安全测试'
  };
  return names[type] || type;
}

// 辅助函数：获取代码检查类型名称
function getCodeCheckName(type) {
  const names = {
    'lint': '代码规范',
    'security': '安全扫描',
    'coverage': '覆盖率'
  };
  return names[type] || type;
}

// 辅助函数：检查用户权限
function checkUserPermissions(userId, requiredActions) {
  const perms = loadPermissions();
  if (!perms) {
    return { allowed: true, granted: requiredActions, missing: [], role: 'admin' };
  }
  
  const userRole = perms.user_roles?.find(ur => ur.user_id === userId);
  if (!userRole) {
    return { allowed: false, granted: [], missing: requiredActions, role: null };
  }
  
  const role = perms.roles?.find(r => r.id === userRole.role_id);
  const rolePerms = perms.permissions?.filter(p => p.role_id === userRole.role_id && p.allowed === 1);
  const granted = rolePerms?.map(p => p.action) || [];
  
  const missing = requiredActions.filter(a => !granted.includes(a) && !granted.includes('*'));
  
  return {
    allowed: missing.length === 0,
    role: role?.name,
    granted,
    missing
  };
}

// 加载权限配置
function loadPermissions() {
  try {
    const permFile = path.join(__dirname, '../data/devops-db/permissions.json');
    if (fs.existsSync(permFile)) {
      return JSON.parse(fs.readFileSync(permFile, 'utf8'));
    }
  } catch (err) {}
  return null;
}

// 获取发布列表
router.get('/releases', (req, res) => {
  const db = new Database(DB_PATH);
  
  let releases = db.prepare('SELECT * FROM releases').all();
  const projects = db.prepare('SELECT id, name FROM projects').all();
  db.close();
  
  // 为每个发布记录添加项目名称
  const enrichedReleases = releases.map(r => {
    const project = projects.find(p => p.id === r.project_id);
    return {
      ...r,
      project_name: project ? project.name : '未知项目'
    };
  });
  
  res.json({ success: true, data: enrichedReleases });
});

// 创建发布记录
router.post('/releases', (req, res) => {
  const { 
    project_id, from_env, to_env, version, 
    check_result, approval, release_notes 
  } = req.body;
  
  const db = new Database(DB_PATH);
  
  const newRelease = {
    id: generateId('rel'),
    project_id,
    from_env,
    to_env,
    version,
    status: 'pending',
    check_result: check_result ? JSON.stringify(check_result) : '{}',
    approval: approval ? JSON.stringify(approval) : '[]',
    release_notes,
    created_at: new Date().toISOString(),
    released_at: null
  };
  
  db.prepare(`
    INSERT INTO releases 
    (id, project_id, from_env, to_env, version, status, check_result, approval, release_notes, created_at, released_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newRelease.id,
    newRelease.project_id,
    newRelease.from_env,
    newRelease.to_env,
    newRelease.version,
    newRelease.status,
    newRelease.check_result,
    newRelease.approval,
    newRelease.release_notes,
    newRelease.created_at,
    newRelease.released_at
  );
  
  const createdRelease = db.prepare('SELECT * FROM releases WHERE id = ?').get(newRelease.id);
  db.close();
  
  res.json({ success: true, data: createdRelease });
});

// 执行发布
router.post('/releases/:id/execute', (req, res) => {
  const db = new Database(DB_PATH);
  
  const release = db.prepare('SELECT * FROM releases WHERE id = ?').get(req.params.id);
  
  if (!release) {
    db.close();
    return res.status(404).json({ success: false, error: '发布记录不存在' });
  }
  
  // 检查是否已通过
  const checkResult = JSON.parse(release.check_result || '{}');
  if (!checkResult.can_proceed) {
    db.close();
    return res.status(400).json({ 
      success: false, 
      error: '未通过发布检查，无法执行发布' 
    });
  }
  
  // 更新发布状态
  db.prepare('UPDATE releases SET status = ?, released_at = ? WHERE id = ?').run(
    'completed',
    new Date().toISOString(),
    req.params.id
  );
  
  // 更新项目环境
  db.prepare('UPDATE projects SET environment = ?, updated_at = ? WHERE id = ?').run(
    release.to_env,
    new Date().toISOString(),
    release.project_id
  );
  
  const updatedRelease = db.prepare('SELECT * FROM releases WHERE id = ?').get(req.params.id);
  db.close();
  
  res.json({ success: true, data: updatedRelease });
});

// ================== 文档管理API ==================

// 获取文档列表
router.get('/documents', (req, res) => {
  const db = new Database(TASKS_DB_PATH);
  
  let documents = db.prepare('SELECT * FROM documents_index').all();
  
  // 支持筛选
  const { product_id, project_id, task_id, type } = req.query;
  if (product_id) documents = documents.filter(d => d.product_id === product_id);
  if (project_id) documents = documents.filter(d => d.project_id === project_id);
  if (task_id) documents = documents.filter(d => d.task_id === task_id);
  if (type) documents = documents.filter(d => d.type === type);
  
  db.close();
  res.json({ success: true, data: documents });
});

// 创建文档
router.post('/documents', (req, res) => {
  const { 
    type, name, product_id, project_id, task_id, 
    content, author 
  } = req.body;
  
  const db = new Database(TASKS_DB_PATH);
  
  const newDoc = {
    id: generateId('doc'),
    type,
    name,
    product_id,
    project_id,
    task_id,
    file_path: content?.file_path || '',
    format: content?.format || 'markdown',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  db.prepare(`
    INSERT INTO documents_index 
    (id, title, category, file_path, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    newDoc.id,
    newDoc.name,
    newDoc.type,
    newDoc.file_path,
    JSON.stringify([]),
    newDoc.created_at,
    newDoc.updated_at
  );
  
  const createdDoc = db.prepare('SELECT * FROM documents_index WHERE id = ?').get(newDoc.id);
  db.close();
  
  res.json({ success: true, data: createdDoc });
});

// 更新文档状态
router.put('/documents/:id/status', (req, res) => {
  const { status, reviewer, comments } = req.body;
  const db = new Database(TASKS_DB_PATH);
  const doc = db.prepare('SELECT * FROM documents_index WHERE id = ?').get(req.params.id);
  
  if (!doc) {
    db.close();
    return res.status(404).json({ success: false, error: '文档不存在' });
  }
  
  const review = reviewer ? JSON.stringify({
    reviewer,
    reviewed_at: new Date().toISOString(),
    status,
    comments: comments || []
  }) : null;
  
  db.prepare(`
    UPDATE documents_index 
    SET updated_at = ?, review = ?
    WHERE id = ?
  `).run(
    new Date().toISOString(),
    review,
    req.params.id
  );
  
  const updatedDoc = db.prepare('SELECT * FROM documents_index WHERE id = ?').get(req.params.id);
  db.close();
  res.json({ success: true, data: updatedDoc });
});

// ================== 统计API ==================

router.get('/stats', (req, res) => {
  const productsDb = new Database(DB_PATH);
  const products = productsDb.prepare('SELECT * FROM products').all();
  productsDb.close();
  
  const projectsDb = new Database(DB_PATH);
  const projects = projectsDb.prepare('SELECT * FROM projects').all();
  projectsDb.close();
  
  const versionsDb = new Database(DB_PATH);
  const versions = versionsDb.prepare('SELECT * FROM versions').all();
  versionsDb.close();
  
  const releasesDb = new Database(DB_PATH);
  const releases = releasesDb.prepare('SELECT * FROM releases').all();
  releasesDb.close();
  
  const documentsDb = new Database(TASKS_DB_PATH);
  const documents = documentsDb.prepare('SELECT * FROM documents_index').all();
  documentsDb.close();
  
  res.json({
    success: true,
    data: {
      products: products.length,
      projects: projects.length,
      versions: versions.length,
      releases: releases.length,
      documents: documents.length,
      by_status: {
        projects: {
          planning: projects.filter(p => p.status === 'planning').length,
          developing: projects.filter(p => p.status === 'developing').length,
          testing: projects.filter(p => p.status === 'testing').length,
          released: projects.filter(p => p.status === 'released').length
        }
      },
      by_environment: {
        develop: projects.filter(p => p.environment === 'develop').length,
        staging: projects.filter(p => p.environment === 'staging').length,
        production: projects.filter(p => p.environment === 'production').length
      }
    }
  });
});

// ================== 修复队列API ==================

// 获取修复队列列表
router.get('/repair-queue', (req, res) => {
  const queueFile = path.join(DATA_DIR, 'repair-queue.json');
  const queue = fs.existsSync(queueFile)
    ? JSON.parse(fs.readFileSync(queueFile, 'utf8'))
    : [];
    
  const status = req.query.status;
  if (status) {
    const filtered = queue.filter(r => r.status === status);
    return res.json({ success: true, data: filtered });
  }
  
  res.json({ success: true, data: queue });
});

// 获取修复统计（必须在 /:id 之前）
router.get('/repair-queue/stats', (req, res) => {
  const queueFile = path.join(DATA_DIR, 'repair-queue.json');
  const queue = fs.existsSync(queueFile)
    ? JSON.parse(fs.readFileSync(queueFile, 'utf8'))
    : [];
  
  res.json({
    success: true,
    data: {
      total: queue.length,
      pending: queue.filter(r => r.status === 'pending').length,
      doing: queue.filter(r => r.status === 'doing').length,
      completed: queue.filter(r => r.status === 'completed').length,
      failed: queue.filter(r => r.status === 'failed').length,
      by_priority: {
        P0: queue.filter(r => r.priority === 'P0').length,
        P1: queue.filter(r => r.priority === 'P1').length,
        P2: queue.filter(r => r.priority === 'P2').length
      },
      by_type: {
        outputs_fix: queue.filter(r => r.type === 'outputs_fix').length,
        monitoring_init: queue.filter(r => r.type === 'monitoring_init').length,
        stuck_tasks_cleanup: queue.filter(r => r.type === 'stuck_tasks_cleanup').length,
        automation_setup: queue.filter(r => r.type === 'automation_setup').length
      }
    }
  });
});

// 获取修复项详情
router.get('/repair-queue/:id', (req, res) => {
  const queueFile = path.join(DATA_DIR, 'repair-queue.json');
  const queue = fs.existsSync(queueFile)
    ? JSON.parse(fs.readFileSync(queueFile, 'utf8'))
    : [];
    
  const item = queue.find(r => r.id === req.params.id);
  
  if (!item) {
    return res.status(404).json({ success: false, error: '修复项不存在' });
  }
  
  res.json({ success: true, data: item });
});

// 创建修复项
router.post('/repair-queue', (req, res) => {
  const { type, title, description, priority } = req.body;
  const queueFile = path.join(DATA_DIR, 'repair-queue.json');
  
  const queue = fs.existsSync(queueFile)
    ? JSON.parse(fs.readFileSync(queueFile, 'utf8'))
    : [];
  
  const newIssue = {
    id: generateId('fix'),
    type,
    title,
    description,
    priority: priority || 'P2',
    status: 'pending',
    created_at: new Date().toISOString(),
    completed_at: null
  };
  
  queue.push(newIssue);
  fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
  
  res.json({ success: true, data: newIssue });
});

module.exports = router;
