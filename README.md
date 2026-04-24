# OpenClaw Task System

> OpenClaw AI Agent 任务管理系统 — 支持任务管理、Agent 通信、自动化工作流、自我进化系统

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0-brightgreen.svg)](https://nodejs.org/)

## 项目简介

OpenClaw Task System 是为 [OpenClaw](https://github.com/openclaw/openclaw) AI Agent 系统配套的任务管理平台。提供任务创建、分配、执行、监控、反思的全生命周期管理。

### 核心功能

- 📋 **任务管理** — CRUD、状态流转、优先级、看板视图
- 🤖 **Agent 通信** — Agent 间消息路由、会话管理、联邦通信
- ⚡ **自动化工作流** — 自动任务分配、问题修复队列、定时巡检
- 🔄 **自我进化** — 任务完成后自动反思、经验沉淀、系统优化
- 📊 **监控中心** — 实时系统状态、任务队列、Agent 健康度
- 🔐 **权限管理** — RBAC、JWT 认证、操作审计
- 📝 **飞书集成** — 消息通知、状态汇报、文档同步

## 快速开始

### 环境要求

- Node.js >= 18.0
- npm >= 9.0
- OpenClaw（可选，用于自动配置）

### 方式一：一键安装

```bash
git clone https://github.com/your-username/openclaw-task-system.git
cd openclaw-task-system
./install.sh    # 自动检测环境 + 安装依赖 + 生成配置
./start.sh      # 启动服务
```

### 方式二：手动安装

```bash
# 1. 安装依赖
npm install --omit=dev

# 2. 生成配置（自动读取 OpenClaw 配置）
node scripts/setup.js

# 3. 启动服务
npm start
```

### 生产部署（PM2）

```bash
npm run pm2:start
npm run pm2:logs     # 查看日志
npm run pm2:stop     # 停止服务
```

### 演示环境（快速体验）

想要快速体验系统功能？3 步启动演示环境：

```bash
git clone https://github.com/your-username/openclaw-task-system.git
cd openclaw-task-system
npm install --omit=dev
node scripts/setup.js        # 生成默认配置（无需 OpenClaw）
node cli.js seed             # 填充演示数据（12 个任务、6 个 Agent）
npm start                    # 启动服务，浏览器打开即可体验
```

演示数据包含：
- 📋 **12 个示例任务** — 覆盖已完成、进行中、待处理、失败等状态
- 🤖 **6 个 Agent** — 不同角色和状态（在线、空闲、离线）
- 🐛 **3 个示例问题** — 演示问题管理流程
- 📝 **8 条审计日志** — 展示操作记录

### 验证安装

浏览器访问：`http://localhost:8081/tasks.html`

## 配置说明

### 自动配置

`setup.js` 会自动检测并读取 `~/.openclaw/openclaw.json`，提取：
- Gateway 端口、Token、连接 URL
- Agent 列表与默认模型
- 自动生成 JWT Secret

### 环境变量

| 变量 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `PORT` | 否 | 服务端口 | `8081` |
| `HOST` | 否 | 监听地址 | `0.0.0.0` |
| `BASE_URL` | 否 | 外部访问地址 | `http://localhost:8081` |
| `GATEWAY_PORT` | 是 | Gateway 端口 | - |
| `GATEWAY_TOKEN` | 是 | Gateway 认证 Token | - |
| `GATEWAY_URL` | 是 | WebSocket 连接地址 | - |
| `AGENT_LIST` | 否 | Agent 列表 | `main,coder,deep,fast,chat` |
| `DEFAULT_MODEL` | 否 | 默认模型 | - |
| `JWT_SECRET` | 否 | JWT 密钥 | 自动生成 |
| `DEFAULT_ADMIN_PASSWORD` | 否 | 初始管理员密码 | `admin123` |

### 不依赖 OpenClaw 运行

如果没有安装 OpenClaw，`setup.js` 会生成默认配置模板，只需手动填入 `GATEWAY_TOKEN` 即可。

## OpenClaw 集成

> 部署后，让 OpenClaw 自动对接任务系统。

### 一键集成

```bash
# 1. 配置 OpenClaw（自动写入 taskSystem 配置到 openclaw.json）
node scripts/configure-openclaw.js

# 2. 重启 OpenClaw
openclaw gateway restart
```

### 集成后 OpenClaw 会自动做什么

| 场景 | OpenClaw 行为 | 效果 |
|------|--------------|------|
| 收到用户消息 | 调用任务意图检测 API | 自动创建任务 |
| 发现 Bug/异常 | 调用问题创建 API | 自动记录问题 |
| 任务完成 | 自动触发反思流程 | 经验沉淀 |
| Heartbeat 定时 | 检查修复队列 + 同步知识索引 | 自动修复 + 知识更新 |

### 📖 部署后 OpenClaw 该读什么？

部署任务系统后，OpenClaw Agent 需要读取以下文档来知道如何对接：

| 文档 | 路径 | 作用 |
|------|------|------|
| **SOUL.md** | `~/.openclaw/workspace/SOUL.md` | 强制指令：每条消息调用任务意图检测 API |
| **AGENTS.md** | `~/.openclaw/workspace/AGENTS.md` | 任务规则：什么时候创建任务/问题 |
| **HEARTBEAT.md** | `~/.openclaw/workspace/HEARTBEAT.md` | 定时任务：修复队列检查、系统自检 |
| **集成指南** | `docs/OPENCLAW-INTEGRATION.md` | 完整 API 文档、CLI 工具、集成流程 |
| **任务意图规则** | `memory/TASK-ISSUE-RULES.md` | 任务/问题触发规则 |

**核心原理**：OpenClaw Agent 启动时会读取 SOUL.md 和 AGENTS.md 中的指令，这些文件里已经写死了调用任务系统 API 的 curl 命令。Agent 不需要额外配置，只要任务系统运行在 8081 端口就能自动对接。

**如果需要自定义端口**，修改 SOUL.md 中的 URL 即可：
```bash
# 把 localhost:8081 改成实际地址
curl -s -X POST http://<实际IP>:<实际端口>/api/tasks/from-chat-sqlite
```

### 任务意图检测

OpenClaw Agent 收到用户消息后调用：

```bash
POST /api/tasks/from-chat-sqlite
{
  "message": "帮我写一个登录页面",
  "sourceChannel": "feishu"
}
```

系统自动分析消息是否包含任务意图，如果是则创建任务并返回。

### 知识/技能/文档同步

```bash
# 同步 knowledge/、docs/、skills/ 到数据库索引
node scripts/sync-index.js
```

对应页面：
- `/knowledge-dashboard.html` — 知识仪表盘
- `/skills-new.html` — 技能管理
- `/docs-new.html` — 文档管理
- `/mcp-servers.html` — MCP 服务器

### 学习路径

```bash
POST /api/learning-paths/create
{
  "title": "学习 Vue 3",
  "description": "...",
  "milestones": [...]
}
```

### 反思系统

任务完成（状态变更为 `done`）时，自动通过 `TaskCompletionHook` 触发反思流程。

**详细集成文档** → [docs/OPENCLAW-INTEGRATION.md](docs/OPENCLAW-INTEGRATION.md)

## CLI 工具

### 统一 CLI 入口（推荐）

项目提供统一 CLI 入口 `cli.js`，覆盖所有常用操作：

```bash
node cli.js help          # 查看所有命令
node cli.js setup         # 生成 .env 配置
node cli.js configure     # 配置 OpenClaw 集成
node cli.js sync          # 同步知识索引
node cli.js test          # 测试部署
node cli.js start         # 启动服务
node cli.js pm2:start     # PM2 启动
node cli.js issue:scan    # 扫描问题
node cli.js check:task task-xxx    # 检查任务完整性
evolution:knowledge  # 知识提取
evolution:reflection # 反思自动化
```

### 部署运维

| 命令 | 说明 |
|------|------|
| `./install.sh` | 一键安装（检测环境 + 安装依赖 + 生成配置） |
| `./start.sh` | 启动服务 |
| `node scripts/setup.js` | 生成 `.env`（读取 OpenClaw 配置） |
| `node scripts/configure-openclaw.js` | 配置 OpenClaw 集成 |
| `node scripts/test-deployment.js` | 测试部署是否正常 |

### 数据同步

| 命令 | 说明 |
|------|------|
| `node scripts/sync-index.js` | 同步知识/技能/文档索引到数据库 |
| `node scripts/agent-registry-sync.js` | Agent 注册信息同步 |

### 问题管理

| 命令 | 说明 |
|------|------|
| `node scripts/issue-scanner.js scan` | 扫描问题并加入修复队列 |
| `node scripts/issue-auto-creator.js` | 自动创建问题记录 |
| `node scripts/issue-auto-fixer.js` | 自动修复问题 |
| `node scripts/fix-queue-linker.js start <fixId> <issueId>` | 开始修复 |
| `node scripts/fix-queue-linker.js complete <fixId> <issueId> "结果"` | 完成修复 |

### 任务/项目检查

| 命令 | 说明 |
|------|------|
| `node scripts/task-checklist-check.js <taskId>` | 检查任务完整性（12 项） |
| `node scripts/project-checklist-check.js <projectId>` | 检查项目完整性（15 项） |

### 自我进化

| 命令 | 说明 |
|------|------|
| `node scripts/self-evolution/self-evolution-runner.js` | 运行自我进化流程 |
| `node scripts/self-evolution/daily-review.js` | 每日回顾 |
| `node scripts/self-evolution/knowledge-extractor.js` | 知识提取 |
| `node scripts/self-evolution/workflow-converter.js` | 知识转化为工作流 |

### PM2

| 命令 | 说明 |
|------|------|
| `npm run pm2:start` | 启动所有服务（4 个进程） |
| `npm run pm2:stop` | 停止所有服务 |
| `npm run pm2:logs` | 查看日志 |
| `npm run pm2:restart` | 重启所有服务 |

## 项目结构

```
├── src/                    # 后端源码
│   ├── server.js           # 主服务入口
│   ├── db/                 # 数据库访问层
│   ├── routes/             # API 路由（70+ 端点）
│   ├── middleware/         # 中间件
│   ├── services/           # 业务服务
│   └── utils/              # 工具函数
├── pages/                  # 前端页面（103 个）
│   ├── css/                # 样式文件
│   └── js/                 # 脚本文件
├── scripts/                # CLI 工具脚本（28+）
│   ├── setup.js            # 自动配置工具
│   ├── configure-openclaw.js  # OpenClaw 集成配置
│   ├── sync-index.js       # 知识同步
│   └── ...
├── services/               # 独立微服务
├── docs/                   # 文档
├── tests/                  # 测试用例
├── data/                   # 运行时数据（不提交）
├── .env.example            # 环境变量模板
├── install.sh              # 一键安装脚本
├── start.sh                # 启动脚本
└── ecosystem.config.js     # PM2 配置
```

## API 文档

详见 [docs/](docs/) 目录：

- [OpenClaw 集成指南](docs/OPENCLAW-INTEGRATION.md) — 集成配置、API 调用、CLI 工具
- [一键部署方案](docs/ONE-CLICK-DEPLOY-PLAN.md) — 部署指南

## 开发

```bash
# 安装全部依赖（含 dev）
npm install

# 运行测试
npm test
npm run test:unit
npm run test:integration
```

## 许可证

MIT License — 详见 [LICENSE](LICENSE) 文件
