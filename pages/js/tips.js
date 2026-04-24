/**
 * Tips 弹窗组件
 * 显示页面字段说明、填充规则、自动化流程
 */

const TipsComponent = {
  // 页面字段定义
  pageFields: {
    'tasks': {
      title: '任务列表页面字段说明',
      fields: [
        { name: 'id', desc: '任务唯一标识', auto: true, source: 'UUID自动生成', rule: '格式: UUID v4' },
        { name: 'title', desc: '任务标题', auto: true, source: '任务意图检测API', rule: '从用户消息提取' },
        { name: 'description', desc: '任务详细描述', auto: true, source: '任务意图检测API', rule: '从用户消息分析' },
        { name: 'status', desc: '任务状态', auto: true, source: '自动化流程', rule: 'pending→assigned→doing→done/failed' },
        { name: 'priority', desc: '优先级', auto: true, source: '任务意图检测API', rule: 'P0-P3，根据关键词判断' },
        { name: 'assigned_agent', desc: '分配的Agent', auto: true, source: 'auto-task-assigner', rule: '根据任务类型匹配Agent' },
        { name: 'created_at', desc: '创建时间', auto: true, source: '系统时间', rule: 'ISO 8601格式' },
        { name: 'started_at', desc: '开始时间', auto: true, source: 'agent-listener启动时', rule: 'Agent接收任务时写入' },
        { name: 'completed_at', desc: '完成时间', auto: true, source: 'Subagent完成时', rule: '任务done时写入' }
      ],
      flow: [
        { step: '用户发送消息', detail: '通过飞书/Signal等渠道' },
        { step: '任务意图检测', detail: '调用 /api/tasks/from-chat' },
        { step: '创建任务', detail: '写入tasks表，status=pending' },
        { step: 'auto-task-assigner检测', detail: '30秒轮询pending任务' },
        { step: '分配Agent', detail: '根据任务类型匹配，写入assigned_agent' },
        { step: 'Federation通知', detail: '发送task_assignment消息' },
        { step: 'agent-listener接收', detail: '启动Subagent执行' }
      ]
    },
    'task-detail': {
      title: '任务详情页面字段说明',
      fields: [
        { name: 'id', desc: '任务唯一标识', auto: true, source: 'URL参数', rule: '从列表页点击进入' },
        { name: 'title', desc: '任务标题', auto: true, source: '数据库', rule: '' },
        { name: 'description', desc: '任务详细描述', auto: true, source: '任务意图检测', rule: '' },
        { name: 'analysis', desc: '任务分析', auto: true, source: 'Subagent分析', rule: '执行时填充' },
        { name: 'breakdown', desc: '步骤拆分', auto: true, source: 'Subagent拆分', rule: 'JSON数组' },
        { name: 'execution_log', desc: '执行日志', auto: true, source: 'Subagent记录', rule: '时间戳+操作' },
        { name: 'related_docs', desc: '相关文档', auto: false, source: '手动填写', rule: '文档路径数组' },
        { name: 'issues', desc: '关联问题', auto: true, source: '数据完整性检查', rule: '问题ID数组' },
        { name: 'automation_monitor', desc: '自动化监控数据', auto: true, source: 'automation-monitor', rule: 'JSON格式' },
        { name: 'audit_log', desc: '审计日志', auto: true, source: '状态变更记录', rule: '时间戳+变更' },
        { name: 'subagent_session', desc: 'Subagent会话ID', auto: true, source: 'sessions_spawn返回', rule: 'OpenClaw sessionKey' },
        { name: 'failed_reason', desc: '失败原因', auto: true, source: '超时/错误检测', rule: '失败时写入' }
      ],
      flow: [
        { step: '查看任务', detail: '从列表页点击进入' },
        { step: '加载详情', detail: '调用 /api/tasks/:id' },
        { step: '显示字段', detail: '根据status显示不同内容' },
        { step: 'doing状态', detail: '显示execution_log实时更新' },
        { step: 'done状态', detail: '显示analysis、breakdown' },
        { step: 'failed状态', detail: '显示failed_reason' }
      ]
    },
    'task-timeline': {
      title: '任务时间线页面字段说明',
      fields: [
        { name: 'timeline', desc: '时间线事件列表', auto: true, source: 'execution_log+audit_log', rule: '按时间排序' },
        { name: 'currentStatus', desc: '当前状态', auto: true, source: 'tasks.status', rule: '' },
        { name: 'agent', desc: '执行Agent', auto: true, source: 'tasks.assigned_agent', rule: '' },
        { name: 'sessionKey', desc: '会话标识', auto: true, source: 'tasks.subagent_session', rule: '' },
        { name: 'timestamp', desc: '事件时间', auto: true, source: '日志记录', rule: 'ISO 8601' },
        { name: 'icon', desc: '事件图标', auto: true, source: '根据status生成', rule: '✅❌🚀等' }
      ],
      flow: [
        { step: '获取任务ID', detail: '从URL参数' },
        { step: '加载时间线', detail: '调用 /api/tasks/:id/timeline' },
        { step: '合并日志', detail: 'execution_log + audit_log' },
        { step: '排序显示', detail: '按timestamp降序' }
      ]
    },
    'queue': {
      title: '任务队列页面字段说明',
      fields: [
        { name: 'quadrant', desc: '四象限分类', auto: true, source: '任务意图检测', rule: 'Q1-Q4，根据priority+deadline' },
        { name: 'priority', desc: '优先级', auto: true, source: '任务意图检测', rule: 'P0-P3' },
        { name: 'score', desc: '综合评分', auto: true, source: '队列计算', rule: '重要性40%+紧急性30%+...' },
        { name: 'total_steps', desc: '总步骤数', auto: true, source: 'breakdown解析', rule: '从breakdown计算' },
        { name: 'completed_steps', desc: '完成步骤数', auto: true, source: 'execution_log解析', rule: '实时更新' }
      ],
      flow: [
        { step: '加载任务', detail: '调用 /api/tasks' },
        { step: '计算象限', detail: '根据priority和deadline' },
        { step: '排序显示', detail: '按score降序' },
        { step: 'Agent状态', detail: '调用 /api/agents/status' },
        { step: '手动调度', detail: '点击"自动调度"按钮' }
      ]
    },
    'monitor': {
      title: '自动化监控页面字段说明',
      fields: [
        { name: 'cpu_usage', desc: 'CPU使用率', auto: true, source: '系统监控', rule: '百分比' },
        { name: 'mem_usage', desc: '内存使用率', auto: true, source: '系统监控', rule: '百分比' },
        { name: 'uptime', desc: '运行时间', auto: true, source: '系统监控', rule: '天+小时+分钟' },
        { name: 'agent_status', desc: 'Agent状态', auto: true, source: 'PM2状态', rule: 'online/idle/offline' },
        { name: 'task_stats', desc: '任务统计', auto: true, source: '数据库查询', rule: '实时计算' }
      ],
      flow: [
        { step: '定时刷新', detail: '每30秒刷新一次' },
        { step: '获取任务', detail: '调用 /api/tasks' },
        { step: '统计计算', detail: '按status分组' },
        { step: '显示日志', detail: '最新50条日志' }
      ]
    }
  },

  // 初始化
  init(pageName) {
    this.pageName = pageName;
    this.createButton();
    this.createModal();
  },

  // 创建Tips按钮
  createButton() {
    const btn = document.createElement('button');
    btn.className = 'tips-btn';
    btn.innerHTML = '💡 字段说明';
    btn.onclick = () => this.open();
    document.body.appendChild(btn);
  },

  // 创建Modal
  createModal() {
    const modal = document.createElement('div');
    modal.className = 'tips-modal';
    modal.id = 'tips-modal';
    
    const pageInfo = this.pageFields[this.pageName] || this.pageFields['tasks'];
    
    modal.innerHTML = `
      <div class="tips-content">
        <div class="tips-header">
          <h2>${pageInfo.title}</h2>
          <button class="tips-close" onclick="TipsComponent.close()">×</button>
        </div>
        
        <div class="tips-section">
          <h3>📋 字段说明</h3>
          <table class="tips-table">
            <thead>
              <tr>
                <th>字段</th>
                <th>说明</th>
                <th>填充方式</th>
                <th>数据来源</th>
                <th>规则</th>
              </tr>
            </thead>
            <tbody>
              ${pageInfo.fields.map(f => `
                <tr>
                  <td class="field-name">${f.name}</td>
                  <td>${f.desc}</td>
                  <td class="${f.auto ? 'auto-fill' : 'manual-fill'}">${f.auto ? '自动' : '手动'}</td>
                  <td>${f.source}</td>
                  <td>${f.rule}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="tips-section">
          <h3>🔄 自动化流程</h3>
          <div class="tips-flow">
            ${pageInfo.flow.map((f, i) => `
              <div class="tips-flow-step">
                <span class="step-num">${i + 1}</span>
                <span><strong>${f.step}</strong>: ${f.detail}</span>
                ${i < pageInfo.flow.length - 1 ? '<span class="tips-flow-arrow">→</span>' : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    
    modal.onclick = (e) => {
      if (e.target === modal) this.close();
    };
    
    document.body.appendChild(modal);
  },

  // 打开
  open() {
    document.getElementById('tips-modal').classList.add('open');
  },

  // 关闭
  close() {
    document.getElementById('tips-modal').classList.remove('open');
  }
};