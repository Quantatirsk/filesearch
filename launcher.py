#!/usr/bin/env python3
"""
启动器脚本 - 解决PyInstaller打包时的模块导入问题
"""

import sys
import os
from pathlib import Path

def main():
    # 设置正确的Python路径
    if hasattr(sys, '_MEIPASS'):
        # PyInstaller运行时环境
        bundle_dir = sys._MEIPASS
    else:
        # 开发环境
        bundle_dir = Path(__file__).parent
    
    # 将bundle目录添加到Python路径
    sys.path.insert(0, str(bundle_dir))
    
    # 动态导入并运行api_server
    try:
        import api_server
        # 运行主函数
        if hasattr(api_server, 'main'):
            api_server.main()
        else:
            # 如果没有main函数，直接运行模块
            import runpy
            runpy.run_module('api_server', run_name='__main__')
    except ImportError as e:
        print(f"导入错误: {e}")
        print(f"当前路径: {sys.path}")
        print(f"Bundle目录: {bundle_dir}")
        print(f"Bundle目录内容: {list(Path(bundle_dir).iterdir()) if Path(bundle_dir).exists() else '目录不存在'}")
        sys.exit(1)
    except Exception as e:
        print(f"运行错误: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()