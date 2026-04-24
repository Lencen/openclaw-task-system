#!/bin/bash
# ============================================
# OpenClaw Task System - 一键卸载脚本
# ============================================

set -e

echo "🗑️  OpenClaw Task System 卸载程序"
echo "=================================="
echo ""

# 1. 停止服务
echo "📋 停止服务..."
if pkill -f "node src/server.js" 2>/dev/null; then
  echo "   ✅ 已停止 Node.js 服务"
else
  echo "   ⚠️  未检测到运行中的服务"
fi

# 检查 PM2
if command -v pm2 &> /dev/null; then
  if pm2 describe task-system-server &>/dev/null; then
    pm2 delete task-system-server
    pm2 save
    echo "   ✅ 已停止 PM2 服务"
  fi
fi

# 2. 清理运行时数据
echo ""
echo "📋 清理运行时数据..."
rm -f src/data/*.db src/data/*.db-shm src/data/*.db-wal 2>/dev/null
echo "   ✅ 数据库已清理"
rm -f *.log nohup.out 2>/dev/null
echo "   ✅ 日志已清理"

# 3. 清理 OpenClaw 工作区模板
echo ""
echo "📋 是否清理 OpenClaw 工作区中的模板文件？"
read -p "   这将删除 SOUL.md / AGENTS.md / HEARTBEAT.md (y/N): " clean_oc
if [ "$clean_oc" = "y" ] || [ "$clean_oc" = "Y" ]; then
  rm -f ~/.openclaw/workspace/SOUL.md
  rm -f ~/.openclaw/workspace/AGENTS.md
  rm -f ~/.openclaw/workspace/HEARTBEAT.md
  echo "   ✅ OpenClaw 模板文件已清理"
  echo "   ⚠️  请运行 openclaw gateway restart 恢复原始配置"
else
  echo "   ⏭️  跳过 OpenClaw 模板清理"
fi

# 4. 确认是否删除项目目录
echo ""
echo "📋 是否删除项目目录？"
CURRENT_DIR=$(pwd)
read -p "   将删除 $CURRENT_DIR (y/N): " delete_dir
if [ "$delete_dir" = "y" ] || [ "$delete_dir" = "Y" ]; then
  cd ..
  rm -rf openclaw-task-system
  echo "   ✅ 项目目录已删除"
else
  echo "   ⏭️  保留项目目录"
fi

echo ""
echo "✅ 卸载完成！"
echo ""
