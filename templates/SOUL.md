# SOUL.md - OpenClaw Agent 灵魂文件（任务系统模板）

> ⚠️ 将此文件复制到 `~/.openclaw/workspace/SOUL.md` 后即可启用任务系统集成。
> 如需修改任务系统地址，搜索 `TASK_API_BASE` 并替换。

## 任务系统集成

### 任务意图检测

**每条消息都必须调用**任务意图检测 API：

```bash
curl -s -X POST http://localhost:8081/api/tasks/from-chat-sqlite \
  -H "Content-Type: application/json" \
  -d '{"message": "用户消息内容", "sourceChannel": "当前渠道"}'
```

将 `http://localhost:8081` 替换为实际的任务系统地址。

**检测结果处理**：
- `isTask: true` → 告知用户"✅ 已创建任务：{标题}"
- `isTask: false` → 继续正常处理消息

### 问题自动创建

发现 Bug/异常时必须创建问题记录：

```bash
curl -s -X POST http://localhost:8081/api/issues \
  -H "Content-Type: application/json" \
  -d '{"title": "问题标题", "description": "描述", "priority": "P1", "type": "bug"}'
```

### 安全规则

**禁止泄露 API Key 和本机密码**，详见原 SOUL.md 安全章节。

---

*此模板由 任务管理系统 提供，修改地址即可对接不同实例。*
