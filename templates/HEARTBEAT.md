# HEARTBEAT - 任务系统心跳模板

> ⚠️ 将此文件复制到 `~/.openclaw/workspace/HEARTBEAT.md` 后即可启用定时任务。
> 如需修改任务系统地址，搜索 `http://localhost:8081` 并替换。

## 修复队列检查

每次 Heartbeat 时执行：

```bash
curl -s http://localhost:8081/api/issues/fix-queue/status
```

如果有待修复问题（pending > 0），通过联邦通信启动子 Agent 处理。

## 系统自检

```bash
# 系统层检查
~/.openclaw/workspace/scripts/self-check/self-check.sh check

# 业务层检查
~/.openclaw/workspace/scripts/self-check/business-check.sh check
```

---

*此模板由 任务管理系统 提供*
