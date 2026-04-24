/**
 * 通用字段说明 Tips 组件
 * 用法：
 * 1. 引入此文件：<script src="js/field-tips.js"></script>
 * 2. 调用 FieldTips.init({ pageType: 'task' });
 * 3. 在标题旁边添加：<i class="ri-question-circle-line tips-icon" onclick="FieldTips.show()"></i>
 */

const FieldTips = {
  // 页面类型配置
  pageConfigs: {
    task: {
      title: '任务字段说明',
      sections: {
        basic: {
          title: '📋 基本信息',
          fields: [
            { name: 'id', meaning: '任务唯一标识', format: 'task-{timestamp}-{random}', source: '创建时系统生成' },
            { name: 'title', meaning: '任务标题', format: '1-100字符', source: '用户输入或从消息提取' },
            { name: 'description', meaning: '任务详细描述', format: '0-2000字符，支持Markdown', source: '用户输入或系统提取' },
            { name: 'status', meaning: '任务状态', format: 'pending/assigned/doing/done/failed/cancelled', source: '系统自动流转' },
            { name: 'priority', meaning: '优先级', format: 'P0(紧急)/P1(高)/P2(中)/P3(低)', source: '用户指定或系统判断' },
            { name: 'quadrant', meaning: '四象限分类', format: '1-重要紧急, 2-重要不紧急, 3-不重要紧急, 4-不重要不紧急', source: '系统自动计算' },
            { name: 'assigned_agent', meaning: '分配的执行 Agent', format: 'main/coder/deep/fast/chat/office/test', source: 'auto-task-assigner 分配' },
            { name: 'total_steps', meaning: '总步骤数', format: '正整数 ≥1', source: 'Agent 分析拆解时填充' },
            { name: 'completed_steps', meaning: '已完成步骤数', format: '正整数 ≤ total_steps', source: '执行过程中实时更新' },
            { name: 'deadline', meaning: '截止时间', format: 'ISO 8601 格式', source: '用户指定' },
          ]
        },
        time: {
          title: '⏰ 时间信息',
          fields: [
            { name: 'created_at', meaning: '创建时间', format: 'ISO 8601 格式', source: '创建时系统自动填充' },
            { name: 'started_at', meaning: '开始执行时间', format: 'ISO 8601 格式', source: 'status 变为 doing 时填充' },
            { name: 'completed_at', meaning: '完成时间', format: 'ISO 8601 格式', source: 'status 变为 done 时填充' },
            { name: 'duration_human', meaning: '人工可读耗时', format: '"2小时30分钟"', source: '系统自动计算' },
          ]
        },
        execution: {
          title: '⚙️ 执行信息',
          fields: [
            { name: 'execution_log', meaning: '执行日志（任务如何完成）', format: 'JSON 数组', source: '执行过程中追加' },
            { name: 'tool_calls', meaning: '工具调用记录', format: 'JSON 数组', source: 'Gateway 自动记录' },
            { name: 'subagent_session', meaning: 'Subagent 会话 ID', format: 'agent:{agentId}:subagent:{uuid}', source: 'agent-connector 填充' },
          ]
        },
        monitor: {
          title: '📡 监控信息',
          fields: [
            { name: 'automation_monitor', meaning: '自动化监控数据（流程是否正确）', format: 'JSON', source: 'assigner/listener/connector 记录' },
            { name: 'audit_log', meaning: '审计日志（追责回溯）', format: 'JSON 数组', source: '关键操作时系统记录' },
          ]
        }
      }
    },
    
    issue: {
      title: '问题字段说明',
      sections: {
        basic: {
          title: '📋 基本信息',
          fields: [
            { name: 'id', meaning: '问题唯一标识', format: 'issue-{timestamp}-{random}', source: '创建时系统生成' },
            { name: 'title', meaning: '问题标题', format: '1-100字符', source: '用户输入或从消息提取' },
            { name: 'description', meaning: '问题描述', format: '0-2000字符', source: '用户输入' },
            { name: 'type', meaning: '问题类型', format: 'bug/feature/improvement/question', source: '用户指定或系统判断' },
            { name: 'status', meaning: '问题状态', format: 'open/in_progress/resolved/closed', source: '系统流转' },
            { name: 'priority', meaning: '优先级', format: 'P0/P1/P2/P3', source: '用户指定或系统判断' },
            { name: 'severity', meaning: '严重程度', format: 'critical/high/medium/low', source: '用户评估' },
          ]
        },
        relation: {
          title: '🔗 关联信息',
          fields: [
            { name: 'task_id', meaning: '关联任务', format: '任务 ID', source: '关联时填充' },
            { name: 'project_id', meaning: '所属项目', format: '项目 ID', source: '关联时填充' },
          ]
        }
      }
    },
    
    project: {
      title: '项目字段说明',
      sections: {
        basic: {
          title: '📋 基本信息',
          fields: [
            { name: 'id', meaning: '项目唯一标识', format: 'proj-{timestamp}-{random}', source: '创建时系统生成' },
            { name: 'name', meaning: '项目名称', format: '1-50字符', source: '用户输入' },
            { name: 'description', meaning: '项目描述', format: '0-2000字符', source: '用户输入' },
            { name: 'status', meaning: '项目状态', format: 'planning/doing/done/paused', source: '系统流转' },
            { name: 'priority', meaning: '优先级', format: 'P0/P1/P2/P3', source: '用户指定' },
            { name: 'progress', meaning: '完成进度', format: '0-100', source: '系统自动计算' },
            { name: 'owner', meaning: '项目负责人', format: '用户名', source: '用户指定' },
          ]
        },
        time: {
          title: '⏰ 时间信息',
          fields: [
            { name: 'start_date', meaning: '开始日期', format: 'YYYY-MM-DD', source: '用户指定' },
            { name: 'end_date', meaning: '结束日期', format: 'YYYY-MM-DD', source: '用户指定' },
            { name: 'deadline', meaning: '截止日期', format: 'YYYY-MM-DD', source: '用户指定' },
          ]
        }
      }
    },
    
    agent: {
      title: 'Agent 字段说明',
      sections: {
        basic: {
          title: '📋 基本信息',
          fields: [
            { name: 'id', meaning: 'Agent 唯一标识', format: 'agent-{type}', source: '系统定义' },
            { name: 'name', meaning: 'Agent 名称', format: '字符串', source: '配置文件' },
            { name: 'type', meaning: 'Agent 类型', format: 'main/coder/deep/fast/chat/office/test', source: '系统定义' },
            { name: 'status', meaning: 'Agent 状态', format: 'online/offline/busy', source: '系统监控' },
            { name: 'model', meaning: '使用的模型', format: '模型名称', source: '配置文件' },
          ]
        }
      }
    },
    
    automation: {
      title: '自动化字段说明',
      sections: {
        basic: {
          title: '📋 基本信息',
          fields: [
            { name: 'flow_id', meaning: '流程唯一标识', format: 'flow-{timestamp}', source: '创建时系统生成' },
            { name: 'flow_name', meaning: '流程名称', format: '1-50字符', source: '用户输入' },
            { name: 'flow_type', meaning: '流程类型', format: 'task/issue/notification', source: '系统定义' },
            { name: 'status', meaning: '流程状态', format: 'running/paused/stopped', source: '系统监控' },
            { name: 'trigger', meaning: '触发条件', format: 'JSON 触发规则', source: '用户配置' },
            { name: 'last_run', meaning: '上次执行时间', format: 'ISO 8601', source: '系统记录' },
          ]
        },
        monitor: {
          title: '📊 监控信息',
          fields: [
            { name: 'success_rate', meaning: '成功率', format: '0-100%', source: '系统计算' },
            { name: 'total_runs', meaning: '总执行次数', format: '正整数', source: '系统计数' },
            { name: 'last_error', meaning: '上次错误', format: '错误信息', source: '系统记录' },
          ]
        }
      }
    },
    
    knowledge: {
      title: '知识库字段说明',
      sections: {
        basic: {
          title: '📋 基本信息',
          fields: [
            { name: 'id', meaning: '知识条目唯一标识', format: 'kb-{timestamp}', source: '创建时系统生成' },
            { name: 'title', meaning: '知识标题', format: '1-100字符', source: '用户输入或从文档提取' },
            { name: 'content', meaning: '知识内容', format: 'Markdown 文本', source: '用户输入或导入' },
            { name: 'category', meaning: '知识分类', format: 'HOT/WARM/COLD', source: '用户指定或系统判断' },
            { name: 'tags', meaning: '标签', format: '标签数组', source: '用户指定' },
            { name: 'source', meaning: '来源', format: 'URL 或文件路径', source: '记录来源' },
          ]
        },
        meta: {
          title: '📈 元数据',
          fields: [
            { name: 'created_at', meaning: '创建时间', format: 'ISO 8601', source: '系统自动填充' },
            { name: 'updated_at', meaning: '更新时间', format: 'ISO 8601', source: '系统自动填充' },
            { name: 'access_count', meaning: '访问次数', format: '正整数', source: '系统计数' },
            { name: 'last_accessed', meaning: '上次访问时间', format: 'ISO 8601', source: '系统记录' },
          ]
        }
      }
    },
    
    dashboard: {
      title: '仪表盘字段说明',
      sections: {
        basic: {
          title: '📋 基本信息',
          fields: [
            { name: 'dashboard_id', meaning: '仪表盘唯一标识', format: 'dash-{timestamp}', source: '创建时系统生成' },
            { name: 'name', meaning: '仪表盘名称', format: '1-50字符', source: '用户输入' },
            { name: 'type', meaning: '仪表盘类型', format: 'system/business/agent', source: '用户指定' },
            { name: 'refresh_interval', meaning: '刷新间隔', format: '秒数', source: '用户配置' },
          ]
        },
        metrics: {
          title: '📊 指标',
          fields: [
            { name: 'total_tasks', meaning: '任务总数', format: '正整数', source: '系统统计' },
            { name: 'active_agents', meaning: '活跃 Agent 数', format: '正整数', source: '系统统计' },
            { name: 'system_health', meaning: '系统健康度', format: '0-100%', source: '系统计算' },
          ]
        }
      }
    },
    
    general: {
      title: '通用字段说明',
      sections: {
        basic: {
          title: '📋 常见字段',
          fields: [
            { name: 'id', meaning: '唯一标识', format: '前缀-{timestamp}-{random}', source: '创建时系统生成' },
            { name: 'title/name', meaning: '名称/标题', format: '1-100字符', source: '用户输入' },
            { name: 'description', meaning: '描述', format: '0-2000字符', source: '用户输入' },
            { name: 'status', meaning: '状态', format: '视业务而定', source: '系统流转' },
            { name: 'created_at', meaning: '创建时间', format: 'ISO 8601', source: '系统自动填充' },
            { name: 'updated_at', meaning: '更新时间', format: 'ISO 8601', source: '系统自动填充' },
          ]
        }
      }
    }
  },
  
  currentConfig: null,
  modalCreated: false,
  
  // 初始化
  init(options = {}) {
    const pageType = options.pageType || 'task';
    this.currentConfig = this.pageConfigs[pageType] || this.pageConfigs.task;
    
    // 确保弹窗 HTML 存在
    if (!this.modalCreated) {
      this.createModal();
      this.modalCreated = true;
    }
    
    // 添加样式
    this.addStyles();
  },
  
  // 创建弹窗 HTML
  createModal() {
    const modal = document.createElement('div');
    modal.id = 'field-tips-modal';
    modal.className = 'field-tips-modal';
    modal.innerHTML = `
      <div class="field-tips-content" onclick="event.stopPropagation()">
        <div class="field-tips-header">
          <h3 id="field-tips-title"><i class="ri-information-line"></i> 字段说明</h3>
          <span class="field-tips-close" onclick="FieldTips.hide()">×</span>
        </div>
        <div id="field-tips-body"></div>
      </div>
    `;
    modal.onclick = () => this.hide();
    document.body.appendChild(modal);
  },
  
  // 添加样式
  addStyles() {
    if (document.getElementById('field-tips-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'field-tips-styles';
    style.textContent = `
      .tips-icon {
        cursor: pointer;
        color: var(--text-tertiary, #666);
        font-size: 16px;
        transition: color 0.2s;
        margin-left: 8px;
      }
      .tips-icon:hover {
        color: var(--primary, #3b82f6);
      }
      .field-tips-modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        justify-content: center;
        align-items: center;
      }
      .field-tips-modal.active {
        display: flex;
      }
      .field-tips-content {
        background: var(--bg-primary, #1a1a2e);
        border-radius: 12px;
        max-width: 900px;
        max-height: 80vh;
        width: 90%;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .field-tips-header {
        padding: 16px 20px;
        border-bottom: 1px solid var(--border, #333);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .field-tips-header h3 {
        margin: 0;
        font-size: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .field-tips-close {
        cursor: pointer;
        font-size: 24px;
        color: var(--text-tertiary, #666);
        line-height: 1;
      }
      .field-tips-close:hover {
        color: var(--text-primary, #fff);
      }
      .field-tips-body {
        padding: 20px;
        overflow-y: auto;
      }
      .field-section {
        margin-bottom: 24px;
      }
      .field-section-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--primary, #3b82f6);
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .field-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .field-table th {
        text-align: left;
        padding: 10px 12px;
        background: var(--bg-tertiary, #2a2a3e);
        border-bottom: 1px solid var(--border, #333);
        font-weight: 500;
      }
      .field-table td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--border, #333);
        vertical-align: top;
      }
      .field-name {
        font-family: monospace;
        color: var(--primary, #3b82f6);
        white-space: nowrap;
      }
      .field-meaning {
        color: var(--text-primary, #fff);
      }
      .field-format {
        color: var(--text-secondary, #aaa);
        font-size: 11px;
      }
      .field-source {
        color: var(--success, #10b981);
        font-size: 11px;
      }
    `;
    document.head.appendChild(style);
  },
  
  // 显示弹窗
  show() {
    if (!this.currentConfig) {
      this.init();
    }
    
    document.getElementById('field-tips-title').innerHTML = 
      `<i class="ri-information-line"></i> ${this.currentConfig.title}`;
    
    let html = '';
    for (const [key, section] of Object.entries(this.currentConfig.sections)) {
      html += '<div class="field-section">';
      html += '<div class="field-section-title">' + section.title + '</div>';
      html += '<table class="field-table">';
      html += '<tr><th>字段名</th><th>业务意义</th><th>值规范</th><th>填充来源</th></tr>';
      
      section.fields.forEach(field => {
        html += '<tr>';
        html += '<td class="field-name">' + field.name + '</td>';
        html += '<td class="field-meaning">' + field.meaning + '</td>';
        html += '<td class="field-format">' + field.format + '</td>';
        html += '<td class="field-source">' + field.source + '</td>';
        html += '</tr>';
      });
      
      html += '</table></div>';
    }
    
    document.getElementById('field-tips-body').innerHTML = html;
    document.getElementById('field-tips-modal').classList.add('active');
  },
  
  // 隐藏弹窗
  hide() {
    document.getElementById('field-tips-modal').classList.remove('active');
  },
  
  // 为指定元素添加 Tips 图标
  addTipsToElement(element, pageType) {
    this.init({ pageType });
    
    const icon = document.createElement('i');
    icon.className = 'ri-question-circle-line tips-icon';
    icon.onclick = () => this.show();
    icon.title = '查看字段说明';
    element.appendChild(icon);
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FieldTips;
}