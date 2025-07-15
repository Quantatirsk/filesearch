#!/bin/bash

# Streamlit Web Application Launcher
# 启动文档搜索系统的Streamlit Web界面

echo "🚀 启动文档搜索系统Web界面..."
echo "Starting Document Search System Web Interface..."

# Check if required dependencies are installed
python3 -c "import streamlit, psutil" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  缺少依赖包，正在安装..."
    echo "Missing dependencies, installing..."
    pip3 install streamlit psutil
fi

# Launch Streamlit app
streamlit run streamlit_app.py \
    --server.port 8501 \
    --server.address 0.0.0.0 \
    --server.headless true \
    --server.enableCORS false \
    --server.enableXsrfProtection false

echo "✅ 应用已启动！"
echo "Application launched!"
echo "访问地址: http://localhost:8501"
echo "Access URL: http://localhost:8501"