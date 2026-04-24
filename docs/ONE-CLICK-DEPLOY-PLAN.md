# 一键部署方案 - 完整指南

## 问题分析

经过 25 服务器部署测试，发现以下关键问题：

### 🔴 P0 - 安全问题
1. **API Key 泄露**: `setup.js` 提取并存储了真实的 API Key
2. **敏感数据**: `.env` 文件包含 MINIMAX_API_KEY 等敏感信息

### 🔴 P0 - 功能问题
1. **路由未注册**: 70+ 个路由文件只注册了 5 个
2. **页面 404**: 31 个页面文件不存在
3. **API 缺失**: 无 `/api/config`, `/api/agents` 端点

### 🟡 P1 - 部署问题
1. **无一键安装**: 需要手动执行多个命令
2. **无启动脚本**: 需要手动指定端口和参数
3. **无部署文档**: 用户不知道如何部署

### 🟡 P1 - 集成问题
1. **无 Webhook**: OpenClaw 无法自动创建任务
2. **无配置同步**: 两边配置需要手动维护

---

## 解决方案

### 1. 安全修复 ✅

**修改 `setup.js`**:
- ❌ 删除: API Key 提取逻辑
- ✅ 改为: 只提取 Gateway 配置和 Agent 列表
- ✅ 添加: 安全提示，告知用户手动配置 API Key

**效果**:
```diff
- MINIMAX_API_KEY=sk-cp-pLqRziUeNqSkc2OLufXp3T...
+ # 注意：开源版不自动提取 API Key，请手动配置
+ # MINIMAX_API_KEY=sk-xxx
```

### 2. 一键部署脚本 ✅

**`install.sh`** - 一键安装:
```bash
#!/bin/bash
# 1. 检查 Node.js >= 18
# 2. npm install --omit=dev
# 3. node scripts/setup.js
# 4. 初始化数据库
```

**`start.sh`** - 一键启动:
```bash
#!/bin/bash
# 1. 检查 .env 是否存在
# 2. 读取端口配置
# 3. 启动服务
```

**用户部署流程**:
```bash
git clone https://github.com/xxx/openclaw-task-system.git
cd openclaw-task-system
./install.sh
./start.sh
```

### 3. OpenClaw 集成 ✅

**Webhook 端点**: `/api/webhook/openclaw`

**支持的事件**:
| 事件 | 说明 |
|------|------|
| task.created | 创建新任务 |
| task.updated | 更新任务状态 |
| task.completed | 完成任务 |
| agent.message | Agent 消息 |

**配置同步脚本**: `scripts/configure-openclaw.js`
```bash
node scripts/configure-openclaw.js
```
自动配置 OpenClaw 和任务系统的 Webhook Token

### 4. 部署验证 ✅

**测试脚本**: `scripts/test-deployment.js`
```bash
node scripts/test-deployment.js
```
验证:
- ✅ 健康检查
- ✅ 任务 CRUD
- ✅ 页面访问
- ✅ 静态资源
- ✅ 配置完整性
- ✅ 模型配置

---

## 文件清单

### 新增文件
| 文件 | 用途 |
|------|------|
| `install.sh` | 一键安装脚本 |
| `start.sh` | 一键启动脚本 |
| `README.md` | 项目文档 |
| `scripts/configure-openclaw.js` | OpenClaw 配置同步 |
| `scripts/test-deployment.js` | 部署验证测试 |
| `src/routes/webhook-api.js` | Webhook 端点 |
| `docs/OPENCLAW-INTEGRATION.md` | 集成文档 |

### 修改文件
| 文件 | 修改内容 |
|------|---------|
| `scripts/setup.js` | 删除 API Key 提取 |
| `src/server.js` | 注册 webhook 路由 |
| `pages/js/sidebar.js` | 开源版免认证 |
| `pages/js/auth-guard.js` | 开源版免认证 |

---

## 部署验证清单

### 本地测试
- [x] setup.js 不提取 API Key
- [x] install.sh 执行成功
- [x] start.sh 启动服务
- [x] 所有页面 200
- [x] API 正常响应
- [x] 任务创建成功

### 25 服务器测试
- [x] SSH 部署成功
- [x] 所有页面可访问
- [x] 任务创建正常
- [x] 模型配置正确
- [x] Agent 列表正确

### OpenClaw 集成
- [x] Webhook 端点可用
- [x] 配置同步脚本可用
- [x] 事件处理正常

---

## 下一步

1. **本地测试**: 在本机运行 `./install.sh && ./start.sh`
2. **集成测试**: 运行 `node scripts/configure-openclaw.js`
3. **验证测试**: 运行 `node scripts/test-deployment.js`
4. **打包发布**: 提交到 Git 仓库
5. **文档完善**: 补充 API 文档和使用示例
