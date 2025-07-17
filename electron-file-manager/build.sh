#!/bin/bash

# Electron文件管理器构建脚本

echo "🏗️  构建Electron文件管理器..."
echo "=============================="

# 检查构建环境
echo "🔍 检查构建环境..."

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js未安装"
    exit 1
fi

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm未安装"
    exit 1
fi

# 安装依赖
echo "📦 安装依赖..."
npm install

# 类型检查
echo "🔍 TypeScript类型检查..."
npm run typecheck

# 代码检查
echo "🔍 ESLint代码检查..."
npm run lint

# 构建应用
echo "🏗️  构建应用..."
npm run build

# 根据平台选择打包方式
PLATFORM=$(uname -s)
case $PLATFORM in
    "Darwin")
        echo "🍎 检测到macOS，构建macOS应用..."
        npm run build:mac
        ;;
    "Linux")
        echo "🐧 检测到Linux，构建Linux应用..."
        npm run build:linux
        ;;
    "MINGW"*|"MSYS"*|"CYGWIN"*)
        echo "🪟 检测到Windows，构建Windows应用..."
        npm run build:win
        ;;
    *)
        echo "⚠️  未知平台: $PLATFORM"
        echo "请手动运行对应的构建命令:"
        echo "  Windows: npm run build:win"
        echo "  macOS: npm run build:mac"
        echo "  Linux: npm run build:linux"
        ;;
esac

echo "✅ 构建完成！"
echo "📦 输出目录: ./dist/"