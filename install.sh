#!/bin/bash
# ============================================
# OpenClaw Task System - 一键安装脚本
# ============================================

set -e

echo " OpenClaw Task System 安装程序"
echo "================================"
echo ""

# 检查 Node.js
echo "📋 检查环境..."
if ! command -v node &> /dev/null; then
  echo "❌ 未找到 Node.js"
  echo "   请先安装 Node.js (>= 18.0)"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 版本过低: $(node -v)"
  echo "   需要 Node.js >= 18.0"
  exit 1
fi
echo "   ✅ Node.js: $(node -v)"

if ! command -v npm &> /dev/null; then
  echo "❌ 未找到 npm"
  exit 1
fi
echo "   ✅ npm: $(npm -v)"

# 安装依赖
echo ""
echo "📦 安装依赖..."
npm install --omit=dev
echo "   ✅ 依赖安装完成"

# 自动配置
echo ""
echo "⚙️  自动配置..."
node scripts/setup.js

# 初始化数据库
echo ""
echo "🗄️  初始化数据库..."
mkdir -p data
echo "   ✅ 数据库目录就绪"

# 完成
echo ""
echo "================================"
echo "✅ 安装完成！"
echo ""
echo "🚀 启动服务:"
echo "   npm start"
echo ""
echo "🔧 生产模式 (PM2):"
echo "   npm run pm2:start"
echo ""
echo "📖 访问面板:"
echo "   http://localhost:8081/tasks.html"
echo "================================"
