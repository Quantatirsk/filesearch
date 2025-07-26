#!/usr/bin/env python3
"""
完整的应用构建脚本
1. 构建 Python 后端
2. 构建 Electron 应用
3. 打包最终发布版本
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path
import argparse

def run_command(command, cwd=None, description=""):
    """执行命令并处理错误"""
    if description:
        print(f"🔧 {description}")
    
    print(f"💻 执行命令: {' '.join(command) if isinstance(command, list) else command}")
    
    try:
        if isinstance(command, str):
            result = subprocess.run(command, shell=True, check=True, cwd=cwd, text=True, capture_output=True)
        else:
            result = subprocess.run(command, check=True, cwd=cwd, text=True, capture_output=True)
        
        if result.stdout:
            print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ 命令执行失败: {e}")
        if e.stdout:
            print("标准输出:", e.stdout)
        if e.stderr:
            print("错误输出:", e.stderr)
        return False

def build_python_backend():
    """构建 Python 后端"""
    print("📦 开始构建 Python 后端...")
    
    # 检查 requirements.txt
    if not Path('requirements.txt').exists():
        print("❌ 未找到 requirements.txt")
        return False
    
    # 安装依赖
    if not run_command([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'], 
                      description="安装 Python 依赖"):
        return False
    
    # 安装 PyInstaller
    if not run_command([sys.executable, '-m', 'pip', 'install', 'pyinstaller'], 
                      description="安装 PyInstaller"):
        return False
    
    # 执行后端构建
    if not run_command([sys.executable, 'build_backend.py'], 
                      description="构建 Python 后端可执行文件"):
        return False
    
    print("✅ Python 后端构建完成")
    return True

def build_electron_app(platform='current'):
    """构建 Electron 应用"""
    print("🚀 开始构建 Electron 应用...")
    
    # 切换到 electron 目录
    electron_dir = Path('./electron-file-manager')
    if not electron_dir.exists():
        print("❌ 未找到 electron-file-manager 目录")
        return False
    
    # 安装 npm 依赖
    if not run_command(['npm', 'install'], cwd=electron_dir, 
                      description="安装 Electron 依赖"):
        return False
    
    # 构建命令映射
    build_commands = {
        'win': 'build:win',
        'mac': 'build:mac', 
        'linux': 'build:linux',
        'current': 'build:full'
    }
    
    build_cmd = build_commands.get(platform, 'build:full')
    
    # 构建 Electron 应用
    if not run_command(['npm', 'run', build_cmd], cwd=electron_dir,
                      description=f"构建 Electron 应用 ({platform})"):
        return False
    
    print("✅ Electron 应用构建完成")
    return True

def verify_build():
    """验证构建结果"""
    print("🔍 验证构建结果...")
    
    # 检查 Python 后端
    python_backend = Path('./electron-file-manager/resources/python')
    backend_executable = python_backend / ('filesearch-backend.exe' if sys.platform == 'win32' else 'filesearch-backend')
    
    if backend_executable.exists():
        print(f"✅ Python 后端可执行文件: {backend_executable}")
        print(f"📊 大小: {backend_executable.stat().st_size / 1024 / 1024:.1f} MB")
    else:
        print(f"❌ 未找到 Python 后端可执行文件: {backend_executable}")
        return False
    
    # 检查 Electron 构建输出
    dist_dir = Path('./electron-file-manager/dist')
    if dist_dir.exists() and list(dist_dir.glob('*')):
        print(f"✅ Electron 发布文件目录: {dist_dir}")
        for item in dist_dir.iterdir():
            print(f"  📁 {item.name}")
    else:
        print(f"⚠️ 未找到 Electron 发布文件: {dist_dir}")
        # 检查是否有 out 目录（开发构建）
        out_dir = Path('./electron-file-manager/out')
        if out_dir.exists():
            print(f"✅ Electron 开发构建: {out_dir}")
        else:
            print("❌ 未找到任何 Electron 构建输出")
            return False
    
    print("✅ 构建验证完成")
    return True

def clean_build():
    """清理构建文件"""
    print("🧹 清理构建文件...")
    
    clean_paths = [
        './build',
        './electron-file-manager/out',
        './electron-file-manager/dist',
        './electron-file-manager/resources/python'
    ]
    
    for path in clean_paths:
        path_obj = Path(path)
        if path_obj.exists():
            shutil.rmtree(path_obj)
            print(f"🗑️  删除: {path}")
    
    print("✅ 清理完成")

def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='构建完整的 Electron + Python 应用')
    parser.add_argument('--platform', choices=['win', 'mac', 'linux', 'current'], 
                       default='current', help='目标平台')
    parser.add_argument('--clean', action='store_true', help='构建前清理')
    parser.add_argument('--python-only', action='store_true', help='只构建 Python 后端')
    parser.add_argument('--electron-only', action='store_true', help='只构建 Electron 应用')
    
    args = parser.parse_args()
    
    # 确保在正确的目录
    script_dir = Path(__file__).parent
    os.chdir(script_dir)
    
    print("🚀 开始完整应用构建")
    print(f"📍 工作目录: {script_dir}")
    print(f"🎯 目标平台: {args.platform}")
    
    try:
        # 清理构建文件
        if args.clean:
            clean_build()
        
        # 构建 Python 后端
        if not args.electron_only:
            if not build_python_backend():
                print("❌ Python 后端构建失败")
                return False
        
        # 构建 Electron 应用
        if not args.python_only:
            if not build_electron_app(args.platform):
                print("❌ Electron 应用构建失败")
                return False
        
        # 验证构建结果
        if not verify_build():
            print("❌ 构建验证失败")
            return False
        
        print("🎉 完整应用构建成功！")
        
        # 显示使用说明
        print("\n📋 使用说明:")
        print("1. 开发模式: cd electron-file-manager && npm run dev")
        print("2. 发布版本: 查看 electron-file-manager/dist/ 目录")
        print("3. Python 后端已集成，用户无需安装 Python 环境")
        
        return True
        
    except KeyboardInterrupt:
        print("\n⚠️ 构建被用户中断")
        return False
    except Exception as e:
        print(f"❌ 构建过程中发生异常: {e}")
        return False

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)