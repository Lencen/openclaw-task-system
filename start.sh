#!/bin/bash
# ============================================
# OpenClaw Task System - 启动脚本
# ============================================

# 检查 .env 是否存在
if [ ! -f ".env" ]; then
  echo "⚠️  未找到 .env 文件"
  echo "   请先运行: node scripts/setup.js"
  echo "   或手动创建 .env 文件"
  exit 1
fi

# 读取端口
PORT=$(grep "^PORT=" .env | cut -d'=' -f2)
PORT=${PORT:-8081}

echo "🚀 启动 OpenClaw Task System..."
echo "   端口: $PORT"
echo "   访问: http://localhost:$PORT/tasks.html"
echo ""

# 启动服务
exec node src/server.js
