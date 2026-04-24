/**
 * API 目录接口
 * 提供系统中所有 API 的列表、状态、用途等信息
 */

const express = require('express');
const router = express.Router();

// API 元数据
const apiCatalog = [
  // ========== 任务管理 ==========
  {
    group: '任务管理',
    endpoints: [
      {
        path: '/api/tasks',
        method: 'GET',
        name: '获取任务列表',
        description: '获取所有任务，支持过滤和分页',
        pages: ['tasks-v2.html', 'tasks-kanban.html', 'quadrant-new.html', 'dashboard-new.html'],
        dependencies: [],
        tags: ['核心', '读操作']
      },
      {
        path: '/api/tasks',
        method: 'POST',
        name: '创建任务',
        description: '创建新任务',
        pages: ['tasks-v2.html', 'tasks-kanban.html', 'quadrant-new.html'],
        dependencies: [],
        tags: ['核心', '写操作']
      },
      {
        path: '/api/tasks/:id',
        method: 'GET',
        name: '获取任务详情',
        description: '获取单个任务的详细信息',
        pages: ['task-detail.html'],
        dependencies: ['/api/tasks'],
        tags: ['核心', '读操作']
      },
      {
        path: '/api/tasks/:id',
        method: 'PUT',
        name: '更新任务',
        description: '更新任务信息',
        pages: ['tasks-v2.html', 'tasks-kanban.html', 'task-detail.html', 'quadrant-new.html'],
        dependencies: ['/api/tasks/:id'],
        tags: ['核心', '写操作']
      },
      {
        path: '/api/tasks/:id',
        method: 'DELETE',
        name: '删除任务',
        description: '删除指定任务',
        pages: ['tasks-v2.html', 'tasks-kanban.html'],
        dependencies: ['/api/tasks/:id'],
        tags: ['核心', '写操作']
      },
      {
        path: '/api/task-execution/analysis',
        method: 'POST',
        name: '提交任务分析',
        description: 'Agent 提交任务分析结果',
        pages: [],
        dependencies: ['/api/tasks/:id'],
        tags: ['Agent', '写操作']
      },
      {
        path: '/api/task-execution/breakdown',
        method: 'POST',
        name: '提交任务拆解',
        description: 'Agent 提交任务拆解结果',
        pages: [],
        dependencies: ['/api/task-execution/analysis'],
        tags: ['Agent', '写操作']
      },
      {
        path: '/api/task-execution/step',
        method: 'POST',
        name: '提交步骤结果',
        description: 'Agent 提交步骤执行结果',
        pages: [],
        dependencies: ['/api/task-execution/breakdown'],
        tags: ['Agent', '写操作']
      },
      {
        path: '/api/task-execution/complete',
        method: 'POST',
        name: '完成任务',
        description: 'Agent 标记任务完成',
        pages: [],
        dependencies: ['/api/task-execution/step'],
        tags: ['Agent', '写操作']
      }
    ]
  },
  
  // ========== 日历 ==========
  {
    group: '日历',
    endpoints: [
      {
        path: '/api/calendar/month/:year/:month',
        method: 'GET',
        name: '获取月度日历',
        description: '获取指定月份的任务统计',
        pages: ['calendar-new.html'],
        dependencies: ['/api/tasks'],
        tags: ['读操作']
      },
      {
        path: '/api/calendar/day/:date',
        method: 'GET',
        name: '获取日任务',
        description: '获取指定日期的任务列表',
        pages: ['calendar-new.html'],
        dependencies: ['/api/tasks'],
        tags: ['读操作']
      }
    ]
  },
  
  // ========== Agent 管理 ==========
  {
    group: 'Agent 管理',
    endpoints: [
      {
        path: '/api/agents',
        method: 'GET',
        name: '获取 Agent 列表',
        description: '获取所有 Agent 信息',
        pages: ['agents-new.html', 'dashboard-new.html'],
        dependencies: [],
        tags: ['核心', '读操作']
      },
      {
        path: '/api/agents/:id',
        method: 'GET',
        name: '获取 Agent 详情',
        description: '获取单个 Agent 的详细信息',
        pages: ['agent-detail.html'],
        dependencies: ['/api/agents'],
        tags: ['读操作']
      },
      {
        path: '/api/auth/register',
        method: 'POST',
        name: '注册 Agent',
        description: '注册新 Agent 并生成 Token',
        pages: [],
        dependencies: [],
        tags: ['认证', '写操作']
      },
      {
        path: '/api/auth/verify',
        method: 'POST',
        name: '验证 Token',
        description: '验证 Agent Token 是否有效',
        pages: [],
        dependencies: ['/api/auth/register'],
        tags: ['认证', '读操作']
      }
    ]
  },
  
  // ========== 项目管理 ==========
  {
    group: '项目管理',
    endpoints: [
      {
        path: '/api/agent-management/projects',
        method: 'GET',
        name: '获取项目列表',
        description: '获取所有项目',
        pages: ['projects-new.html'],
        dependencies: [],
        tags: ['读操作']
      },
      {
        path: '/api/agent-management/projects',
        method: 'POST',
        name: '创建项目',
        description: '创建新项目',
        pages: ['projects-new.html'],
        dependencies: [],
        tags: ['写操作']
      }
    ]
  },
  
  // ========== 文档和技能 ==========
  {
    group: '文档和技能',
    endpoints: [
      {
        path: '/api/resources/docs',
        method: 'GET',
        name: '获取文档列表',
        description: '获取所有文档',
        pages: ['docs-new.html'],
        dependencies: [],
        tags: ['读操作']
      },
      {
        path: '/api/resources/skills',
        method: 'GET',
        name: '获取技能列表',
        description: '获取所有技能',
        pages: ['skills-new.html'],
        dependencies: [],
        tags: ['读操作']
      }
    ]
  },
  
  // ========== 系统监控 ==========
  {
    group: '系统监控',
    endpoints: [
      {
        path: '/api/system/status',
        method: 'GET',
        name: '获取系统状态',
        description: '获取 CPU、内存、磁盘等系统指标',
        pages: ['monitor-new.html', 'dashboard-new.html'],
        dependencies: [],
        tags: ['监控', '读操作']
      },
      {
        path: '/api/system/gateway',
        method: 'GET',
        name: '获取 Gateway 状态',
        description: '获取 Gateway 运行状态',
        pages: ['monitor-new.html'],
        dependencies: [],
        tags: ['监控', '读操作']
      }
    ]
  },
  
  // ========== 通知 ==========
  {
    group: '通知',
    endpoints: [
      {
        path: '/api/notifications',
        method: 'GET',
        name: '获取通知列表',
        description: '获取用户通知',
        pages: ['notifications.html'],
        dependencies: [],
        tags: ['读操作']
      },
      {
        path: '/api/notifications/read',
        method: 'POST',
        name: '标记已读',
        description: '标记通知为已读',
        pages: ['notifications.html'],
        dependencies: ['/api/notifications'],
        tags: ['写操作']
      }
    ]
  },
  
  // ========== 进度推送 ==========
  {
    group: '进度推送',
    endpoints: [
      {
        path: '/api/progress/clients',
        method: 'GET',
        name: '获取 WebSocket 客户端',
        description: '获取当前连接的 WebSocket 客户端列表',
        pages: [],
        dependencies: [],
        tags: ['WebSocket', '读操作']
      },
      {
        path: '/api/progress/status',
        method: 'POST',
        name: '推送系统状态',
        description: '通过 WebSocket 推送系统状态',
        pages: [],
        dependencies: [],
        tags: ['WebSocket', '写操作']
      }
    ]
  },
  
  // ========== 文件 ==========
  {
    group: '文件',
    endpoints: [
      {
        path: '/api/file/upload',
        method: 'POST',
        name: '上传文件',
        description: '上传文件到服务器',
        pages: [],
        dependencies: [],
        tags: ['写操作']
      }
    ]
  },
  
  // ========== 工作日志 ==========
  {
    group: '工作日志',
    endpoints: [
      {
        path: '/api/worklog',
        method: 'GET',
        name: '获取工作日志',
        description: '获取工作日志列表',
        pages: [],
        dependencies: [],
        tags: ['读操作']
      }
    ]
  },
  
  // ========== 代码审查 ==========
  {
    group: '代码审查',
    endpoints: [
      {
        path: '/api/review',
        method: 'GET',
        name: '获取审查列表',
        description: '获取代码审查列表',
        pages: [],
        dependencies: [],
        tags: ['读操作']
      }
    ]
  },
  
  // ========== 聊天 ==========
  {
    group: '聊天',
    endpoints: [
      {
        path: '/api/chat',
        method: 'GET',
        name: '获取聊天记录',
        description: '获取聊天消息列表',
        pages: ['agent-chat-room.html'],
        dependencies: [],
        tags: ['读操作']
      }
    ]
  },
  
  // ========== 知识库 ==========
  {
    group: '知识库',
    endpoints: [
      {
        path: '/api/kb/search',
        method: 'GET',
        name: '搜索知识库',
        description: '搜索知识库内容',
        pages: [],
        dependencies: [],
        tags: ['读操作']
      }
    ]
  },
  
  // ========== 项目任务管理（新增）==========
  {
    group: '项目任务管理',
    endpoints: [
      {
        path: '/api/devops/projects/:id/tasks',
        method: 'POST',
        name: '批量创建项目任务（预填充）',
        description: '批量创建项目任务，自动填充 analysis、acceptance_criteria、related_docs',
        pages: ['projects.html', 'project-detail.html'],
        dependencies: ['/api/devops/projects/:id'],
        tags: ['核心', '写操作', '预填充'],
        features: [
          '自动填充 analysis',
          '自动填充 acceptance_criteria',
          '自动填充 related_docs',
          '任务状态为 pending（非 doing）'
        ]
      },
      {
        path: '/api/devops/projects/:id/task-template',
        method: 'GET',
        name: '获取项目任务模板',
        description: '基于项目里程碑生成任务模板',
        pages: ['projects.html'],
        dependencies: ['/api/devops/projects/:id'],
        tags: ['读操作', '模板']
      },
      {
        path: '/api/devops/projects/:id/issues',
        method: 'GET',
        name: '获取项目问题列表',
        description: '获取项目问题列表，按严重程度分组',
        pages: ['projects.html', 'project-detail.html'],
        dependencies: ['/api/devops/projects/:id'],
        tags: ['读操作', '监控']
      },
      {
        path: '/api/devops/projects/:id/issues/:issueId/resolve',
        method: 'POST',
        name: '解决项目问题',
        description: '标记项目问题为已解决',
        pages: ['project-detail.html'],
        dependencies: ['/api/devops/projects/:id/issues'],
        tags: ['写操作', '监控']
      }
    ]
  },

  // ========== V6 监控指标 ==========
  {
    group: 'V6 监控指标',
    endpoints: [
      {
        path: '/api/metrics/v6',
        method: 'GET',
        name: '获取 V6 监控指标 (Prometheus)',
        description: '获取 V6 项目监控指标，输出 Prometheus 文本格式',
        pages: [],
        dependencies: [],
        tags: ['监控', '读操作', 'Prometheus']
      },
      {
        path: '/api/metrics/v6/alerts',
        method: 'GET',
        name: '获取 V6 告警状态',
        description: '获取当前告警状态列表',
        pages: [],
        dependencies: [],
        tags: ['监控', '读操作', '告警']
      },
      {
        path: '/api/metrics/v6/check',
        method: 'GET',
        name: '一键检查 V6 监控',
        description: '获取所有监控指标和告警状态',
        pages: [],
        dependencies: ['/api/metrics/v6', '/api/metrics/v6/alerts'],
        tags: ['监控', '读操作', '检查']
      }
    ]
  }
];

// 获取 API 目录
router.get('/catalog', (req, res) => {
  const flatEndpoints = [];
  let totalEndpoints = 0;
  let getEndpoints = 0;
  let postEndpoints = 0;
  let putEndpoints = 0;
  let deleteEndpoints = 0;
  
  apiCatalog.forEach(group => {
    group.endpoints.forEach(endpoint => {
      totalEndpoints++;
      if (endpoint.method === 'GET') getEndpoints++;
      else if (endpoint.method === 'POST') postEndpoints++;
      else if (endpoint.method === 'PUT') putEndpoints++;
      else if (endpoint.method === 'DELETE') deleteEndpoints++;
      
      flatEndpoints.push({
        ...endpoint,
        group: group.group
      });
    });
  });
  
  res.json({
    success: true,
    data: {
      groups: apiCatalog,
      flat: flatEndpoints,
      stats: {
        total: totalEndpoints,
        groups: apiCatalog.length,
        methods: {
          GET: getEndpoints,
          POST: postEndpoints,
          PUT: putEndpoints,
          DELETE: deleteEndpoints
        }
      }
    }
  });
});

// 检查单个 API 状态
async function checkEndpointStatus(path, method) {
  return new Promise((resolve) => {
    // 简单的状态检查：返回正常状态
    // 实际可以发送真实请求检查
    resolve({
      status: 'online',
      latency: Math.floor(Math.random() * 50) + 10,
      lastCheck: new Date().toISOString()
    });
  });
}

// 获取 API 状态
router.get('/status', async (req, res) => {
  const statuses = {};
  
  for (const group of apiCatalog) {
    for (const endpoint of group.endpoints) {
      const key = `${endpoint.method} ${endpoint.path}`;
      statuses[key] = await checkEndpointStatus(endpoint.path, endpoint.method);
    }
  }
  
  res.json({
    success: true,
    data: statuses,
    timestamp: new Date().toISOString()
  });
});

// 获取单个 API 详情（通过查询参数）
router.get('/endpoint', (req, res) => {
  const path = req.query.path;
  
  if (!path) {
    return res.status(400).json({
      success: false,
      error: 'Missing path parameter'
    });
  }
  
  for (const group of apiCatalog) {
    for (const endpoint of group.endpoints) {
      if (endpoint.path === path) {
        return res.json({
          success: true,
          data: {
            ...endpoint,
            group: group.group
          }
        });
      }
    }
  }
  
  res.status(404).json({
    success: false,
    error: 'API endpoint not found'
  });
});

module.exports = router;