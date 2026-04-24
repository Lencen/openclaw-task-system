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
git clone https://github.com/Lencen/openclaw-task-system.git
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
git clone https://github.com/Lencen/openclaw-task-system.git
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

> 部署后，将模板文件复制到 OpenClaw 工作区即可自动对接。

### 对接步骤

```bash
# 1. 复制模板到 OpenClaw 工作区
cp templates/SOUL.md ~/.openclaw/workspace/SOUL.md
cp templates/AGENTS.md ~/.openclaw/workspace/AGENTS.md
cp templates/HEARTBEAT.md ~/.openclaw/workspace/HEARTBEAT.md

# 2. 修改模板中的地址（如果任务系统不是 localhost:8081）
# 将模板中的 http://localhost:8081 替换为实际地址

# 3. 重启 OpenClaw
openclaw gateway restart
```

### 集成后 OpenClaw 会自动做什么

| 场景 | OpenClaw 行为 | 效果 |
|------|--------------|------|
| 收到用户消息 | 调用任务意图检测 API | 自动创建任务 |
| 发现 Bug/异常 | 调用问题创建 API | 自动记录问题 |
| 任务完成 | 自动触发反思流程 | 经验沉淀 |
| Heartbeat 定时 | 检查修复队列 + 同步知识索引 | 自动修复 + 知识更新 |

### 安全说明

- ✅ **零侵入**：不修改 OpenClaw 核心配置（`openclaw.json`）
- ✅ **可逆**：删除模板文件即可恢复原始状态
- ✅ **可控**：只需改一个地址（`localhost:8081` → 实际地址）
- ❌ **不影响 OpenClaw 运行**：即使任务系统未启动，OpenClaw 也正常工作

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

## 卸载

如需完全移除任务管理系统，请参考 [UNINSTALL.md](UNINSTALL.md)。

**快速卸载**：
```bash
./uninstall.sh    # 一键卸载
```

## 许可证

MIT License — 详见 [LICENSE](LICENSE) 文件
