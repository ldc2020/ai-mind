import os
import sys
import psutil

# 打包时使用内置代码和资源，避免与磁盘上的旧源码混用。
from config.settings import settings, PROJECT_ROOT

settings["log_dir"].mkdir(parents=True, exist_ok=True)
# 通配监听地址不能直接作为浏览器目的地址。
BROWSER_HOST = "127.0.0.1" if settings["host"] in ("0.0.0.0", "::") else settings["host"]
BASE_URL = f"http://{('[' + BROWSER_HOST + ']') if ':' in BROWSER_HOST else BROWSER_HOST}:{settings['port']}"

import threading
import webbrowser
import time
import json
import socket
import urllib.request
import uvicorn
from PIL import Image
import pystray
from pystray import MenuItem as item
import win32event
import win32api
import winerror
import win32gui
import win32con

MUTEX_NAME = "AIMind_SingleInstance_Mutex"

def check_single_instance():
    mutex = win32event.CreateMutex(None, False, MUTEX_NAME)
    if win32api.GetLastError() == winerror.ERROR_ALREADY_EXISTS:
        return None
    return mutex

def start_server():
    try:
        from main import app
        with open(settings["log_dir"] / "launcher_debug.log", "a", encoding="utf-8") as f:
            f.write("Server configuring...\n")
        
        # 完全禁用 uvicorn 的日志系统，彻底避免控制台输出和isatty错误
        config = uvicorn.Config(
            app, 
            host=settings["host"],
            port=settings["port"],
            log_level="critical", 
            reload=False, 
            log_config=None,
            access_log=False
        )
        server = uvicorn.Server(config)
        with open(settings["log_dir"] / "launcher_debug.log", "a", encoding="utf-8") as f:
            f.write("Server running...\n")
        server.run()
        with open(settings["log_dir"] / "launcher_debug.log", "a", encoding="utf-8") as f:
            f.write("Server finished normally.\n")
    except Exception as e:
        import traceback
        with open(settings["log_dir"] / "launcher_error.log", "a", encoding="utf-8") as f:
            f.write(f"Server crash: {e}\n{traceback.format_exc()}\n")

def focus_existing_window():
    def enum_windows_callback(hwnd, windows):
        if win32gui.IsWindowVisible(hwnd):
            title = win32gui.GetWindowText(hwnd)
            # Find windows containing our specific title
            if title.startswith("AI Mind - 思维导图"):
                windows.append(hwnd)

    windows = []
    win32gui.EnumWindows(enum_windows_callback, windows)

    if windows:
        hwnd = windows[0]
        try:
            # Send Alt key to allow SetForegroundWindow to work
            win32api.keybd_event(win32con.VK_MENU, 0, 0, 0)
            win32api.keybd_event(win32con.VK_MENU, 0, win32con.KEYEVENTF_KEYUP, 0)
            
            if win32gui.IsIconic(hwnd):
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            win32gui.SetForegroundWindow(hwnd)
            return True
        except Exception:
            pass
    return False

def open_browser(icon=None, item=None):
    try:
        if not focus_existing_window():
            webbrowser.open(BASE_URL + "/")
    except Exception as e:
        with open(settings["log_dir"] / "launcher_error.log", "a", encoding="utf-8") as f:
            f.write(f"open_browser error: {e}\n")

def quit_app(icon, item):
    icon.stop()
    try:
        current_process = psutil.Process()
        for child in current_process.children(recursive=True):
            child.kill()
        current_process.kill()
    except Exception:
        os._exit(0)

def main():
    with open(settings["log_dir"] / "launcher_debug.log", "a", encoding="utf-8") as f:
        f.write(f"[{time.time()}] Starting launcher, frozen={getattr(sys, 'frozen', False)}, cwd={os.getcwd()}\n")
        
    mutex = check_single_instance()
    if not mutex:
        with open(settings["log_dir"] / "launcher_debug.log", "a", encoding="utf-8") as f:
            f.write("Instance already running, opening browser and exiting\n")
        # 旧版本在运行时不能悄悄把新版启动操作变成聚焦旧页面。
        try:
            with urllib.request.urlopen(BASE_URL + '/api/health', timeout=2) as response:
                running_version = json.load(response).get('version')
        except (OSError, ValueError):
            running_version = None
        if running_version != settings['version']:
            win32gui.MessageBox(0,
                '检测到旧版 AI Mind 正在运行。请先保存导图，在右下角托盘中退出旧版，再重新打开此程序。',
                '请先退出旧版本', 0)
            return
        open_browser()
        sys.exit(0)
    
    # 检查端口冲突，不结束其他程序。单实例检查已在上面完成。
    try:
        family = socket.AF_INET6 if ':' in settings["host"] else socket.AF_INET
        with socket.socket(family, socket.SOCK_STREAM) as probe:
            probe.bind((settings["host"], settings["port"]))
    except OSError:
        win32gui.MessageBox(0, f"端口 {settings['port']} 已被占用，请修改 config/local.json 中的 port。", "启动失败", 0)
        return

    with open(settings["log_dir"] / "launcher_debug.log", "a", encoding="utf-8") as f:
        f.write("Starting server thread\n")
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    # 最长等待时间由配置管理；服务未就绪时不会打开错误页面。
    deadline = time.monotonic() + settings["startup_timeout_seconds"]
    ready = False
    while time.monotonic() < deadline and server_thread.is_alive():
        try:
            with urllib.request.urlopen(BASE_URL + "/api/health", timeout=1) as response:
                ready = json.load(response).get("application") == settings["app_name"]
            if ready:
                break
        except (OSError, ValueError):
            pass
        time.sleep(0.1)
    if not ready:
        win32gui.MessageBox(0, "服务启动失败，请查看 logs 目录中的日志。", "启动失败", 0)
        return
    open_browser()
    
    with open(settings["log_dir"] / "launcher_debug.log", "a", encoding="utf-8") as f:
        f.write("Setting up tray icon\n")
    if not (PROJECT_ROOT / "icon.ico").exists():
        # Fallback if icon.ico is missing
        img = Image.new('RGB', (64, 64), color = (73, 109, 137))
    else:
        img = Image.open(PROJECT_ROOT / "icon.ico")
        
    menu = pystray.Menu(
        item('打开 AI Mind', open_browser, default=True),
        item('退出', quit_app)
    )
    icon = pystray.Icon("AIMind", img, "AI Mind", menu)
    icon.run()

if __name__ == "__main__":
    # 打包回归以独立端口启动真实 EXE 服务，不弹浏览器，不影响已有托盘实例。
    if "--serve-only" in sys.argv:
        start_server()
    else:
        main()
