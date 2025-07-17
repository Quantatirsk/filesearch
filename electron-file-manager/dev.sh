#!/bin/bash

# Electron文件管理器开发启动脚本

echo "🚀 启动Electron文件管理器开发环境..."
echo "======================================"

# 检查Node.js版本
NODE_VERSION=$(node --version)
echo "Node.js版本: $NODE_VERSION"

# 检查Python版本
PYTHON_VERSION=$(python --version 2>&1)
echo "Python版本: $PYTHON_VERSION"

# 检查依赖是否安装
if [ ! -d "node_modules" ]; then
    echo "📦 安装Node.js依赖..."
    npm install
fi

# 检查Python后端依赖
echo "🔍 检查Python后端依赖..."
cd ..
if [ ! -f "requirements.txt" ]; then
    echo "❌ 未找到Python后端，请确认在正确的目录结构中"
    exit 1
fi

# 检查Python依赖
python -c "import fastapi, uvicorn" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Python依赖未安装，请运行: pip install -r requirements.txt"
    echo "继续启动前端开发服务器..."
fi

# 返回electron目录
cd electron-file-manager

# 启动开发服务器
echo "🔧 启动开发服务器..."
npm run dev