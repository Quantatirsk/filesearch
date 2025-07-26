#!/usr/bin/env python3
"""
优化的端口进程清理方案 - 混合策略
结合lsof高效查询和psutil跨平台兼容性
"""

import os
import sys
import subprocess
import psutil
import platform
from typing import List, Optional


def kill_process_on_port_optimized(port: int) -> bool:
    """
    优化的端口进程清理函数 - 混合策略
    
    策略优先级:
    1. Unix系统优先使用lsof (高性能)
    2. 失败或Windows系统回退到psutil (兼容性)
    3. 优雅关闭 -> 强制关闭的渐进式处理
    """
    
    # 策略1: Unix系统优先使用lsof (macOS/Linux)
    if platform.system() in ['Darwin', 'Linux']:
        print(f"🔍 Using lsof to find processes on port {port}")
        success = _kill_with_lsof(port)
        if success:
            return True
        print("⚠️  lsof method failed, falling back to psutil")
    
    # 策略2: 回退到psutil方案 (Windows兼容 + lsof失败时)
    print(f"🔍 Using psutil to find processes on port {port}")
    return _kill_with_psutil(port)


def _kill_with_lsof(port: int) -> bool:
    """使用lsof + kill的高性能方案"""
    try:
        # 1. 使用lsof查找占用端口的进程PID
        result = subprocess.run(
            ['lsof', '-ti', f':{port}'], 
            capture_output=True, 
            text=True, 
            timeout=5
        )
        
        if not result.stdout.strip():
            print(f"✅ No process found using port {port}")
            return True
            
        pids = [pid.strip() for pid in result.stdout.strip().split('\n') if pid.strip()]
        
        if not pids:
            return True
            
        print(f"🎯 Found {len(pids)} process(es) using port {port}: {pids}")
        
        # 2. 优雅关闭策略
        for pid in pids:
            try:
                # 先尝试SIGTERM优雅关闭
                subprocess.run(['kill', '-TERM', pid], timeout=3, check=True)
                print(f"📤 Sent SIGTERM to process {pid}")
                
                # 等待3秒让进程自行关闭
                import time
                time.sleep(3)
                
                # 检查进程是否还存在
                check_result = subprocess.run(
                    ['kill', '-0', pid], 
                    capture_output=True, 
                    timeout=2
                )
                
                if check_result.returncode == 0:
                    # 进程仍存在，强制杀死
                    subprocess.run(['kill', '-9', pid], timeout=3, check=True)
                    print(f"💥 Force killed process {pid}")
                else:
                    print(f"✅ Process {pid} terminated gracefully")
                    
            except subprocess.CalledProcessError as e:
                if e.returncode == 1:  # Process already dead
                    print(f"✅ Process {pid} already terminated")
                else:
                    print(f"⚠️  Failed to kill process {pid}: {e}")
                    continue
            except subprocess.TimeoutExpired:
                print(f"⏰ Timeout killing process {pid}")
                continue
                
        return True
        
    except subprocess.TimeoutExpired:
        print("⏰ lsof command timed out")
        return False
    except FileNotFoundError:
        print("❌ lsof command not found")
        return False
    except Exception as e:
        print(f"❌ lsof method failed: {e}")
        return False


def _kill_with_psutil(port: int) -> bool:
    """使用psutil的跨平台兼容方案（优化版）"""
    try:
        killed_any = False
        
        # 优化：只获取有网络连接的进程，减少遍历
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                # 快速跳过明显不相关的进程
                if proc.info['name'] in ['kernel_task', 'launchd', 'systemd']:
                    continue
                    
                # 检查网络连接
                connections = proc.net_connections()
                
                for conn in connections:
                    if (hasattr(conn, 'laddr') and 
                        conn.laddr and 
                        conn.laddr.port == port):
                        
                        print(f"🎯 Found process {proc.info['pid']} ({proc.info['name']}) using port {port}")
                        
                        # 优雅关闭 -> 强制关闭
                        try:
                            proc.terminate()  # SIGTERM
                            proc.wait(timeout=5)  # 等待5秒
                            print(f"✅ Process {proc.info['pid']} terminated gracefully")
                        except psutil.TimeoutExpired:
                            proc.kill()  # SIGKILL
                            print(f"💥 Force killed process {proc.info['pid']}")
                        
                        killed_any = True
                        
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
            except Exception:
                continue
                
        return killed_any
        
    except Exception as e:
        print(f"❌ psutil method failed: {e}")
        return False


def cleanup_port_optimized(port: int, host: str = "localhost") -> None:
    """优化的端口清理函数"""
    from socket import socket, AF_INET, SOCK_STREAM
    
    # 检查端口是否被占用
    def is_port_in_use() -> bool:
        try:
            with socket(AF_INET, SOCK_STREAM) as sock:
                sock.settimeout(1)
                return sock.connect_ex((host, port)) == 0
        except:
            return False
    
    if not is_port_in_use():
        print(f"✅ Port {port} is available")
        return
    
    print(f"🚨 Port {port} is in use, cleaning up...")
    
    # 执行清理
    if kill_process_on_port_optimized(port):
        # 等待端口释放
        import time
        for i in range(5):  # 最多等待5秒
            time.sleep(1)
            if not is_port_in_use():
                print(f"🎉 Port {port} is now available")
                return
        
        print(f"⚠️  Port {port} still appears busy after cleanup")
    else:
        print(f"❌ Failed to clean up port {port}")


if __name__ == "__main__":
    # 测试用例
    test_port = 8001
    print(f"Testing port cleanup for port {test_port}")
    cleanup_port_optimized(test_port)