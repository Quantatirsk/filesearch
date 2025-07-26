#!/usr/bin/env python3
"""
Python 后端打包脚本
使用 PyInstaller 将 FastAPI 后端打包成独立可执行文件
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

def build_backend():
    """构建 Python 后端为独立可执行文件"""
    
    # 确保在正确的目录
    script_dir = Path(__file__).parent
    os.chdir(script_dir)
    
    print("🔧 开始构建 Python 后端...")
    
    # 检查 PyInstaller 是否安装
    try:
        subprocess.run(['pyinstaller', '--version'], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        print("❌ PyInstaller 未安装，正在安装...")
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'pyinstaller'], check=True)
    
    # PyInstaller 构建配置
    pyinstaller_args = [
        'pyinstaller',
        '--distpath=./electron-file-manager/resources/python',  # 输出到 Electron 资源目录
        '--workpath=./build/temp',      # 临时文件目录
        '--clean',                      # 清理之前的构建
        '--noconfirm',                  # 不询问覆盖
        'filesearch-backend.spec'       # 使用 spec 文件
    ]
    
    # 配置已在 spec 文件中定义
    
    # 创建输出目录
    output_dir = Path('./electron-file-manager/resources/python')
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 执行构建
    try:
        print("📦 执行 PyInstaller 构建...")
        result = subprocess.run(pyinstaller_args, check=True, capture_output=True, text=True)
        print("✅ Python 后端构建成功！")
        
        # 显示构建输出
        if result.stdout:
            print("构建输出:")
            print(result.stdout)
            
    except subprocess.CalledProcessError as e:
        print(f"❌ 构建失败: {e}")
        if e.stdout:
            print("标准输出:")
            print(e.stdout)
        if e.stderr:
            print("错误输出:")
            print(e.stderr)
        return False
    
    # 验证构建结果
    backend_executable = output_dir / ('filesearch-backend.exe' if sys.platform == 'win32' else 'filesearch-backend')
    if backend_executable.exists():
        print(f"✅ 后端可执行文件已生成: {backend_executable}")
        print(f"📊 文件大小: {backend_executable.stat().st_size / 1024 / 1024:.1f} MB")
        return True
    else:
        print(f"❌ 未找到构建的可执行文件: {backend_executable}")
        return False

if __name__ == '__main__':
    success = build_backend()
    sys.exit(0 if success else 1)