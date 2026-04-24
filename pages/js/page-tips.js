/**
 * 页面 Tips 组件
 * 用于显示业务规则、自动化流程说明
 */

const PageTips = {
  // 各页面的 Tips 内容配置
  configs: {
    // ========== 学习 ==========
    'learning-mechanism': {
      title: '学习机制说明',
      icon: 'ri-book-mark-line',
      sections: [
        {
          title: '学习规则',
          icon: 'ri-list-check',
          rules: [
            {
              icon: 'ri-checkbox-circle-line',
              title: '里程碑完成标准',
              desc: '每个里程碑需要完成指定的学习内容和实践项目，通过验证后才能标记为完成'
            },
            {
              icon: 'ri-timer-line',
              title: '学习时长记录',
              desc: '系统自动统计每个里程碑的学习时长，用于计算总体进度'
            },
            {
              icon: 'ri-link',
              title: '资源关联',
              desc: '学习资源来自官方文档、教程、GitHub 项目和内部技能文档'
            }
          ]
        },
        {
          title: '自动化流程',
          icon: 'ri-robot-line',
          flow: {
            type: 'horizontal',
            steps: [
              { type: 'trigger', text: '创建学习路径', icon: 'ri-add-line' },
              { type: 'process', text: '定义里程碑', icon: 'ri-list-ordered' },
              { type: 'process', text: '关联资源', icon: 'ri-link' },
              { type: 'action', text: '学习执行', icon: 'ri-book-read-line' },
              { type: 'action', text: '验证完成', icon: 'ri-checkbox-circle-line' },
              { type: 'result', text: '更新进度', icon: 'ri-pie-chart-line' }
            ]
          }
        },
        {
          title: '数据存储',
          icon: 'ri-database-2-line',
          rules: [
            {
              icon: 'ri-table-line',
              title: 'SQLite 数据库',
              desc: '学习路径数据存储在 learning-paths.db 数据库中，包括路径、里程碑、资源三张表'
            },
            {
              icon: 'ri-refresh-line',
              title: '自动同步',
              desc: '前端页面实时从数据库读取，里程碑状态更新后自动重新计算进度'
            }
          ]
        }
      ]
    },

    // ========== 记忆 ==========
    'memory-dashboard': {
      title: '记忆系统说明',
      icon: 'ri-brain-line',
      sections: [
        {
          title: '记忆规则',
          icon: 'ri-list-check',
          rules: [
            {
              icon: 'ri-file-text-line',
              title: '三层记忆架构',
              desc: 'HOT（热点记忆）→ WARM（温存记忆）→ COLD（归档记忆），按访问频率自动迁移'
            },
            {
              icon: 'ri-search-line',
              title: '语义搜索',
              desc: '使用向量相似度搜索，支持跨文件检索相关记忆片段'
            },
            {
              icon: 'ri-time-line',
              title: '记忆更新',
              desc: '每次 Agent 会话结束时，自动将重要内容写入记忆系统'
            }
          ]
        },
        {
          title: '自动化流程',
          icon: 'ri-robot-line',
          flow: {
            type: 'vertical',
            steps: [
              { type: 'trigger', text: 'Agent 会话结束', desc: '→ 检测是否有关键信息' },
              { type: 'process', text: '提取知识', desc: '→ 分析对话内容，提取知识点' },
              { type: 'action', text: '写入 HOT', desc: '→ 新记忆写入热点层' },
              { type: 'action', text: '定期迁移', desc: '→ Heartbeat 检查迁移条件' },
              { type: 'result', text: 'HOT → WARM → COLD', desc: '→ 按时间/频率降级' }
            ]
          }
        }
      ]
    },

    // ========== 知识 ==========
    'knowledge-library': {
      title: '知识库说明',
      icon: 'ri-book-3-line',
      sections: [
        {
          title: '知识管理规则',
          icon: 'ri-list-check',
          rules: [
            {
              icon: 'ri-folder-line',
              title: '知识分类',
              desc: '按领域分类存储（AI、开发、运维、产品等），支持标签关联'
            },
            {
              icon: 'ri-git-branch-line',
              title: '版本管理',
              desc: '知识文档支持版本追踪，重要变更记录更新历史'
            },
            {
              icon: 'ri-link',
              title: '关联引用',
              desc: '知识条目可关联技能、任务、文档，形成知识网络'
            }
          ]
        },
        {
          title: '索引同步',
          icon: 'ri-refresh-line',
          rules: [
            {
              icon: 'ri-database-2-line',
              title: 'SQLite 索引',
              desc: 'Heartbeat 自动同步知识文件索引到数据库，支持快速检索'
            }
          ]
        }
      ]
    },

    // ========== 技能 ==========
    'skills-new': {
      title: '技能系统说明',
      icon: 'ri-magic-line',
      sections: [
        {
          title: '技能规则',
          icon: 'ri-list-check',
          rules: [
            {
              icon: 'ri-file-code-line',
              title: 'SKILL.md 定义',
              desc: '每个技能由 SKILL.md 文件定义，包含触发场景、执行逻辑、参考资源'
            },
            {
              icon: 'ri-cpu-line',
              title: '自动触发',
              desc: '根据描述中的触发场景关键词，系统自动识别并激活相应技能'
            },
            {
              icon: 'ri-cloud-line',
              title: 'ClawHub 同步',
              desc: '支持从 clawhub.com 安装社区技能，也可发布自己的技能'
            }
          ]
        },
        {
          title: '技能生命周期',
          icon: 'ri-flow-chart',
          flow: {
            type: 'horizontal',
            steps: [
              { type: 'trigger', text: '用户消息', icon: 'ri-message-3-line' },
              { type: 'process', text: '匹配技能', icon: 'ri-search-line' },
              { type: 'action', text: '读取 SKILL.md', icon: 'ri-file-read-line' },
              { type: 'action', text: '执行技能', icon: 'ri-play-line' },
              { type: 'result', text: '输出结果', icon: 'ri-checkbox-circle-line' }
            ]
          }
        }
      ]
    },

    // ========== 文档 ==========
    'docs-new': {
      title: '文档管理说明',
      icon: 'ri-file-list-3-line',
      sections: [
        {
          title: '文档规则',
          icon: 'ri-list-check',
          rules: [
            {
              icon: 'ri-folder-line',
              title: '文档分类',
              desc: '技术文档、API 文档、用户手册、项目文档分类管理'
            },
            {
              icon: 'ri-history-line',
              title: '版本追踪',
              desc: '重要文档变更记录更新历史，支持回滚'
            },
            {
              icon: 'ri-link',
              title: '知识关联',
              desc: '文档可关联知识条目、技能、任务，形成文档网络'
            }
          ]
        }
      ]
    },

    // ========== 反思与改进 ==========
    'reflection-improvement': {
      title: '反思与改进说明',
      icon: 'ri-lightbulb-line',
      sections: [
        {
          title: '反思规则',
          icon: 'ri-list-check',
          rules: [
            {
              icon: 'ri-file-text-line',
              title: '反思记录',
              desc: '每个任务完成后自动触发反思，记录经验教训到 EVOLUTION-LOG.md'
            },
            {
              icon: 'ri-loop-left-line',
              title: '自我进化',
              desc: 'Agent 通过反思机制持续改进，避免重复犯错'
            },
            {
              icon: 'ri-calendar-line',
              title: '定期回顾',
              desc: 'Heartbeat 定期检查反思记录，提取可改进点'
            }
          ]
        },
        {
          title: '反思流程',
          icon: 'ri-flow-chart',
          flow: {
            type: 'horizontal',
            steps: [
              { type: 'trigger', text: '任务完成/失败', icon: 'ri-flag-line' },
              { type: 'process', text: '分析原因', icon: 'ri-search-eye-line' },
              { type: 'action', text: '提取教训', icon: 'ri-lightbulb-line' },
              { type: 'action', text: '写入记忆', icon: 'ri-save-line' },
              { type: 'result', text: '优化行为', icon: 'ri-arrow-up-line' }
            ]
          }
        }
      ]
    },

    // ========== 任务看板 ==========
    'tasks-kanban': {
      title: '任务自动化说明',
      icon: 'ri-task-line',
      sections: [
        {
          title: '任务创建规则',
          icon: 'ri-add-circle-line',
          rules: [
            {
              icon: 'ri-message-3-line',
              title: '消息检测',
              desc: '每条用户消息都会调用 /api/tasks/from-chat 检测是否为任务意图'
            },
            {
              icon: 'ri-cpu-line',
              title: '自动创建',
              desc: '检测到任务意图后，自动创建任务并分配 Agent'
            },
            {
              icon: 'ri-user-line',
              title: 'Agent 分配',
              desc: '根据任务类型自动匹配合适的 Agent：coder（开发）、office（办公）、test（测试）'
            }
          ]
        },
        {
          title: '任务状态流转',
          icon: 'ri-flow-chart',
          flow: {
            type: 'horizontal',
            steps: [
              { type: 'trigger', text: 'pending', icon: 'ri-time-line', desc: '待处理' },
              { type: 'process', text: 'doing', icon: 'ri-loader-4-line', desc: '执行中' },
              { type: 'action', text: 'testing', icon: 'ri-test-tube-line', desc: '测试验证' },
              { type: 'result', text: 'done', icon: 'ri-checkbox-circle-line', desc: '完成' }
            ]
          }
        },
        {
          title: '自动化流程',
          icon: 'ri-robot-line',
          flow: {
            type: 'vertical',
            steps: [
              { type: 'trigger', text: '用户消息', desc: '→ 任务意图检测 API' },
              { type: 'process', text: 'auto-task-assigner', desc: '→ 检测 pending 任务' },
              { type: 'action', text: 'Federation 通知', desc: '→ 发送给目标 Agent' },
              { type: 'action', text: 'agent-listener', desc: '→ 启动 Subagent 执行' },
              { type: 'result', text: '状态更新', desc: '→ 任务完成 → 触发反思' }
            ]
          }
        }
      ]
    },

    // ========== 执行队列 ==========
    'execution-queue': {
      title: '执行队列说明',
      icon: 'ri-list-ordered',
      sections: [
        {
          title: '队列规则',
          icon: 'ri-list-check',
          rules: [
            {
              icon: 'ri-stack-line',
              title: '任务队列',
              desc: 'pending 任务按优先级排队，P0 最高优先执行'
            },
            {
              icon: 'ri-git-branch-line',
              title: '并行限制',
              desc: '最多同时执行 5 个任务，避免资源争抢'
            },
            {
              icon: 'ri-timer-line',
              title: '超时检测',
              desc: '任务执行超过 20 分钟自动标记为失败，允许重试'
            }
          ]
        },
        {
          title: '自动化流程',
          icon: 'ri-robot-line',
          flow: {
            type: 'horizontal',
            steps: [
              { type: 'trigger', text: '任务入队', icon: 'ri-login-circle-line' },
              { type: 'process', text: '优先级排序', icon: 'ri-sort-desc' },
              { type: 'action', text: '分配 Agent', icon: 'ri-user-add-line' },
              { type: 'action', text: '执行监控', icon: 'ri-radar-line' },
              { type: 'result', text: '完成/失败', icon: 'ri-flag-line' }
            ]
          }
        }
      ]
    },

    // ========== 问题管理 ==========
    'issues': {
      title: '问题自动化说明',
      icon: 'ri-bug-line',
      sections: [
        {
          title: '问题创建规则',
          icon: 'ri-add-circle-line',
          rules: [
            {
              icon: 'ri-alarm-warning-line',
              title: '自动检测',
              desc: '系统自检发现异常时自动创建问题记录'
            },
            {
              icon: 'ri-tag-line',
              title: '优先级分类',
              desc: 'P0（自动化中断）、P1（数据问题）、P2（功能缺陷）、P3（改进建议）'
            },
            {
              icon: 'ri-link',
              title: '关联任务',
              desc: '问题可与任务关联，追踪修复进度'
            }
          ]
        },
        {
          title: '修复队列流程',
          icon: 'ri-flow-chart',
          flow: {
            type: 'vertical',
            steps: [
              { type: 'trigger', text: 'Issue Scanner', desc: '→ 轮询检测可修复问题' },
              { type: 'process', text: '加入修复队列', desc: '→ status: pending' },
              { type: 'action', text: 'Heartbeat 检查', desc: '→ 触发修复流程' },
              { type: 'action', text: 'Federation 启动 Subagent', desc: '→ coder Agent 执行修复' },
              { type: 'result', text: '更新状态', desc: '→ resolved → 触发反思' }
            ]
          }
        },
        {
          title: 'P0 问题处理',
          icon: 'ri-alarm-warning-line',
          rules: [
            {
              icon: 'ri-flashlight-line',
              title: '立即修复',
              desc: 'P0 问题（影响自动化流程）立即通过 Federation 启动 Subagent 修复'
            },
            {
              icon: 'ri-loop-left-line',
              title: '联动更新',
              desc: '修复状态与问题状态联动：开始修复 → in_progress，完成 → resolved'
            }
          ]
        }
      ]
    }
  },

  /**
   * 初始化 Tips 功能
   * @param {string} pageId - 页面标识
   * @param {HTMLElement} container - Tips 按钮容器
   */
  init(pageId, container) {
    const config = this.configs[pageId];
    if (!config) {
      console.warn(`[PageTips] 未找到页面配置: ${pageId}`);
      return;
    }

    // 创建按钮
    const btn = document.createElement('button');
    btn.className = 'tips-btn';
    btn.innerHTML = `<i class="ri-lightbulb-line"></i> Tips`;
    btn.onclick = () => this.show(pageId);
    container.appendChild(btn);

    // 创建弹窗（延迟创建，首次点击时）
    this.pageId = pageId;
  },

  /**
   * 显示 Tips 弹窗
   */
  show(pageId) {
    const config = this.configs[pageId || this.pageId];
    if (!config) return;

    // 移除已存在的弹窗
    const existing = document.querySelector('.tips-modal');
    if (existing) existing.remove();

    // 创建弹窗
    const modal = document.createElement('div');
    modal.className = 'tips-modal';
    modal.innerHTML = this._renderContent(config);
    document.body.appendChild(modal);

    // 绑定事件
    modal.querySelector('.tips-close').onclick = () => this.hide();
    modal.onclick = (e) => {
      if (e.target === modal) this.hide();
    };

    // 显示
    requestAnimationFrame(() => modal.classList.add('active'));
  },

  /**
   * 隐藏 Tips 弹窗
   */
  hide() {
    const modal = document.querySelector('.tips-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    }
  },

  /**
   * 渲染 Tips 内容
   */
  _renderContent(config) {
    const sectionsHtml = config.sections.map(section => {
      let contentHtml = '';

      // 渲染规则列表
      if (section.rules) {
        contentHtml += `
          <div class="tips-rules">
            ${section.rules.map(rule => `
              <div class="tips-rule">
                <div class="tips-rule-icon"><i class="${rule.icon}"></i></div>
                <div class="tips-rule-content">
                  <div class="tips-rule-title">${rule.title}</div>
                  <div class="tips-rule-desc">${rule.desc}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }

      // 渲染流程图
      if (section.flow) {
        contentHtml += this._renderFlow(section.flow);
      }

      return `
        <div class="tips-section">
          <div class="tips-section-title">
            <i class="${section.icon}"></i>
            ${section.title}
          </div>
          ${contentHtml}
        </div>
      `;
    }).join('');

    return `
      <div class="tips-content">
        <div class="tips-header">
          <h2><i class="${config.icon}"></i> ${config.title}</h2>
          <div class="tips-close"><i class="ri-close-line"></i></div>
        </div>
        <div class="tips-body">
          ${sectionsHtml}
        </div>
      </div>
    `;
  },

  /**
   * 渲染流程图
   */
  _renderFlow(flow) {
    if (flow.type === 'horizontal') {
      return `
        <div class="tips-flow">
          <div class="tips-flow-title">自动化流程</div>
          <div class="tips-flow-horizontal">
            ${flow.steps.map((step, i) => `
              <div class="flow-node ${step.type}">
                <i class="${step.icon || 'ri-checkbox-blank-circle-line'}"></i>
                ${step.text}
              </div>
              ${i < flow.steps.length - 1 ? '<i class="flow-arrow ri-arrow-right-line"></i>' : ''}
            `).join('')}
          </div>
        </div>
      `;
    } else {
      // 垂直流程
      return `
        <div class="tips-flow">
          <div class="tips-flow-title">自动化流程</div>
          <div class="tips-flow-diagram">
            ${flow.steps.map(step => `
              <div class="flow-step">
                <div class="flow-node ${step.type}">
                  <i class="${step.icon || 'ri-checkbox-blank-circle-line'}"></i>
                  ${step.text}
                </div>
                <span class="flow-desc">${step.desc || ''}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PageTips;
}