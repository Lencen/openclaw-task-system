# 卸载指南

如需完全移除任务管理系统，请按以下步骤操作。

## 方式一：一键卸载

```bash
./uninstall.sh
```

脚本会自动清理：
- 停止 Node.js 服务进程
- 删除数据库文件
- 删除运行时日志
- 提示是否删除项目目录

## 方式二：手动卸载

### 1. 停止服务

```bash
# 如果通过 npm start 启动
pkill -f "node src/server.js"

# 如果通过 PM2 启动
pm2 delete task-system-server 2>/dev/null || true
pm2 save
```

### 2. 清理运行时数据（可选）

```bash
# 删除数据库
rm -f src/data/*.db src/data/*.db-shm src/data/*.db-wal

# 删除日志
rm -f *.log nohup.out
```

### 3. 删除 OpenClaw 工作区模板文件（如果已复制）

```bash
rm -f ~/.openclaw/workspace/SOUL.md
rm -f ~/.openclaw/workspace/AGENTS.md
rm -f ~/.openclaw/workspace/HEARTBEAT.md
```

### 4. 重启 OpenClaw（恢复原始配置）

```bash
openclaw gateway restart
```

### 5. 删除项目目录（可选）

```bash
rm -rf /path/to/openclaw-task-system
```

## 卸载后验证

```bash
# 确认服务已停止
ps aux | grep "server.js" | grep -v grep

# 确认端口已释放
ss -tlnp | grep 8081
```

如果两条命令都无输出，说明已完全卸载。
