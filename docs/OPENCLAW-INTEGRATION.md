# OpenClaw 集成指南

> 任务系统部署后，OpenClaw 如何自动对接：任务创建、问题记录、学习路径、反思系统、知识/技能/文档加载。

---

## 一句话总结

部署任务系统 → 运行 `node scripts/configure-openclaw.js` → 重启 OpenClaw → 自动集成完成。

---

## 集成流程

```
1. 安装任务系统        ./install.sh
2. 生成任务系统配置     node scripts/setup.js          (读取 openclaw.json → 生成 .env)
3. 配置 OpenClaw       node scripts/configure-openclaw.js  (写入 taskSystem 配置到 openclaw.json)
4. 重启 OpenClaw       openclaw gateway restart
5. 同步知识索引         node scripts/sync-index.js
```

### 第 2 步：setup.js 做了什么

```
~/.openclaw/openclaw.json
    ↓ 读取
  Gateway 端口、Token、URL
  Agent 列表、默认模型
    ↓ 生成
.env 文件 + 随机 JWT_SECRET
    ↓ 初始化
data/tasks.db 数据库
```

### 第 3 步：configure-openclaw.js 做了什么

```
读取 .env 获取任务系统端口和地址
    ↓ 写入
~/.openclaw/openclaw.json 增加 taskSystem 配置:
{
  "taskSystem": {
    "enabled": true,
    "url": "http://localhost:8081",
    "webhookUrl": "http://localhost:8081/api/webhook/openclaw",
    "webhookToken": "<自动生成>",
    "autoCreateTasks": true,
    "syncInterval": 30
  }
}
    ↓ 同步
.env 中写入匹配的 WEBHOOK_TOKEN
```

---

## OpenClaw 自动对接方式

### 方式一：SOUL.md 指令（推荐，已实现）

OpenClaw 的 `SOUL.md` 文件包含强制指令，Agent 每条消息都会执行：

```bash
# 任务意图检测
curl -s -X POST http://localhost:8081/api/tasks/from-chat-sqlite \
  -H "Content-Type: application/json" \
  -d '{"message": "用户消息", "sourceChannel": "feishu"}'
```

**效果**：
- 用户说"帮我做个XX" → 自动创建任务
- 用户说"修个Bug" → 自动创建问题
- 任务完成 → 自动触发反思

### 方式二：Webhook 推送（双向）

任务系统提供 Webhook 端点，OpenClaw 可以推送事件：

```
POST /api/webhook/openclaw
Headers: x-webhook-token: <token>

{
  "type": "task.created" | "task.updated" | "task.completed" | "agent.message",
  "data": { ... }
}
```

### 方式三：API 直接调用

OpenClaw Agent 可以直接调用任务系统 API：

| 操作 | API | 方法 |
|------|-----|------|
| 创建任务 | `POST /api/tasks` | JSON |
| 从消息创建 | `POST /api/tasks/from-chat-sqlite` | JSON |
| 创建问题 | `POST /api/issues` | JSON |
| 创建学习路径 | `POST /api/learning-paths/create` | JSON |
| 触发反思 | `POST /api/tasks/:id/reflect` | - |
| 同步知识索引 | `POST /api/sync-index` | - |

---

## OpenClaw 配置加载

### 任务系统自动加载 OpenClaw 配置

| 加载内容 | 来源 | 用途 |
|---------|------|------|
| Gateway 连接信息 | `~/.openclaw/openclaw.json` | 与 Gateway 通信 |
| Agent 列表 | `agents.entries` | 任务分配、状态同步 |
| 默认模型 | `agents.defaults.model` | 反思、AI 功能 |
| Provider 配置 | `models.providers` | 模型管理页面 |

### 知识/技能/文档加载

```bash
# 同步脚本：扫描文件建立数据库索引
node scripts/sync-index.js

# 扫描目录：
#   knowledge/*.md    → 知识库索引
#   docs/*.md         → 文档索引  
#   skills/*/SKILL.md → 技能索引
```

**对应页面**：
- `/knowledge-dashboard.html` — 知识仪表盘
- `/knowledge-library.html` — 知识库浏览
- `/skills-new.html` — 技能管理
- `/docs-new.html` — 文档管理
- `/mcp-servers.html` — MCP 服务器管理

### 学习路径加载

```bash
# API 创建学习路径
POST /api/learning-paths/create
{
  "title": "学习 Vue 3",
  "description": "...",
  "milestones": [...]
}

# 对应页面
/learning-mechanism.html
/learning-paths.html
```

### 反思系统加载

```bash
# 任务完成自动触发（无需手动调用）
任务状态 → done
  → TaskCompletionHook 拦截
  → ReflectionAutomationFlow 执行
  → LLM 生成反思
  → 质量评估 ≥ 8 分自动应用
  → 写入 memory/ 和 data/self-evolution/

# 手动触发
POST /api/tasks/:id/reflect

# 对应页面
/reflection-dashboard.html
/reflection-improvement.html
/reflection-editor.html
/reflection-monitor.html
/evolution-log.html
```

---

## CLI 工具

### 部署运维

| 命令 | 说明 |
|------|------|
| `./install.sh` | 一键安装：环境检测 + 依赖安装 + 配置生成 |
| `./start.sh` | 启动服务 |
| `node scripts/setup.js` | 生成 `.env`（读取 OpenClaw 配置） |
| `node scripts/configure-openclaw.js` | 配置 OpenClaw 集成 |
| `node scripts/test-deployment.js` | 测试部署是否正常 |

### 数据同步

| 命令 | 说明 |
|------|------|
| `node scripts/sync-index.js` | 同步知识/技能/文档索引 |
| `node scripts/agent-registry-sync.js` | Agent 注册同步 |

### 问题管理

| 命令 | 说明 |
|------|------|
| `node scripts/issue-scanner.js scan` | 扫描问题并加入修复队列 |
| `node scripts/issue-auto-creator.js` | 自动创建问题 |
| `node scripts/issue-auto-fixer.js` | 自动修复 |
| `node scripts/issue-auto-analyzer.js` | 自动分析 |
| `node scripts/issue-deep-analyzer.js` | 深度分析 |
| `node scripts/fix-queue-linker.js start <fixId> <issueId>` | 开始修复 |
| `node scripts/fix-queue-linker.js complete <fixId> <issueId> "结果"` | 完成修复 |
| `node scripts/fix-queue-linker.js fail <fixId> <issueId> "原因"` | 修复失败 |
| `node scripts/fix-queue-linker.js close <issueId>` | 关闭问题 |

### 任务/项目检查

| 命令 | 说明 |
|------|------|
| `node scripts/task-checklist-check.js <taskId>` | 检查任务完整性（12项） |
| `node scripts/project-checklist-check.js <projectId>` | 检查项目完整性（15项） |

### 自我进化

| 命令 | 说明 |
|------|------|
| `node scripts/self-evolution/self-evolution-runner.js` | 运行自我进化 |
| `node scripts/self-evolution/daily-review.js` | 每日回顾 |
| `node scripts/self-evolution/knowledge-extractor.js` | 知识提取 |
| `node scripts/reflection-automation-flow.js` | 反思自动化 |

### PM2

| 命令 | 说明 |
|------|------|
| `npm run pm2:start` | 启动所有服务（4个进程） |
| `npm run pm2:stop` | 停止 |
| `npm run pm2:logs` | 查看日志 |
| `npm run pm2:restart` | 重启 |

---

## 集成验证

```bash
# 1. 任务系统运行中
curl http://localhost:8081/api/tasks

# 2. 自动创建任务
curl -s -X POST http://localhost:8081/api/tasks/from-chat-sqlite \
  -H "Content-Type: application/json" \
  -d '{"message": "帮我写一个登录页面", "sourceChannel": "feishu"}'

# 3. 创建问题
curl -s -X POST http://localhost:8081/api/issues \
  -H "Content-Type: application/json" \
  -d '{"title": "页面加载慢", "priority": "P2"}'

# 4. 同步知识
node scripts/sync-index.js

# 5. OpenClaw 配置检查
node scripts/configure-openclaw.js
```

---

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | 否 | `8081` | 服务端口 |
| `HOST` | 否 | `0.0.0.0` | 监听地址 |
| `BASE_URL` | 否 | `http://localhost:8081` | 外部访问地址 |
| `TASK_SYSTEM_URL` | 否 | `http://localhost:8081` | API 地址 |
| `GATEWAY_PORT` | 是 | - | Gateway 端口 |
| `GATEWAY_TOKEN` | 是 | - | Gateway Token |
| `GATEWAY_URL` | 是 | - | WebSocket 地址 |
| `AGENT_LIST` | 否 | `main,coder,deep,fast,chat` | Agent 列表 |
| `JWT_SECRET` | 否 | 自动生成 | JWT 密钥 |
| `WEBHOOK_TOKEN` | 否 | 自动生成 | Webhook Token |
