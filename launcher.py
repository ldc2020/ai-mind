import os
import sys
import psutil

def kill_port_owner(port):
    for conn in psutil.net_connections():
        if conn.laddr.port == port:
            try:
                p = psutil.Process(conn.pid)
                if p.pid != os.getpid():
                    p.kill()
            except Exception:
                pass

# 强制将工作目录设置为可执行文件所在的正确目录
if getattr(sys, 'frozen', False):
    app_dir = os.path.dirname(sys.executable)
    # 因为打包的是 dist/launcher.exe，所以项目根目录是 dist 的上一级
    if os.path.basename(app_dir).lower() == 'dist':
        app_dir = os.path.dirname(app_dir)
    os.chdir(app_dir)
else:
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

import threading
import webbrowser
import time
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
        with open("launcher_debug.log", "a") as f:
            f.write("Server configuring...\n")
        kill_port_owner(8001)
        
        # 完全禁用 uvicorn 的日志系统，彻底避免控制台输出和isatty错误
        config = uvicorn.Config(
            app, 
            host="127.0.0.1", 
            port=8001, 
            log_level="critical", 
            reload=False, 
            log_config=None,
            access_log=False
        )
        server = uvicorn.Server(config)
        with open("launcher_debug.log", "a") as f:
            f.write("Server running...\n")
        server.run()
        with open("launcher_debug.log", "a") as f:
            f.write("Server finished normally.\n")
    except Exception as e:
        import traceback
        with open("launcher_error.log", "a") as f:
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
            webbrowser.open("http://127.0.0.1:8001/")
    except Exception as e:
        with open("launcher_error.log", "a") as f:
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
    with open("launcher_debug.log", "a") as f:
        f.write(f"[{time.time()}] Starting launcher, frozen={getattr(sys, 'frozen', False)}, cwd={os.getcwd()}\n")
        
    mutex = check_single_instance()
    if not mutex:
        with open("launcher_debug.log", "a") as f:
            f.write("Instance already running, opening browser and exiting\n")
        open_browser()
        sys.exit(0)
    
    with open("launcher_debug.log", "a") as f:
        f.write("Starting server thread\n")
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    time.sleep(1.5)
    open_browser()
    
    with open("launcher_debug.log", "a") as f:
        f.write("Setting up tray icon\n")
    if not os.path.exists("icon.ico"):
        # Fallback if icon.ico is missing
        img = Image.new('RGB', (64, 64), color = (73, 109, 137))
    else:
        img = Image.open("icon.ico")
        
    menu = pystray.Menu(
        item('打开 AI Mind', open_browser, default=True),
        item('退出', quit_app)
    )
    icon = pystray.Icon("AIMind", img, "AI Mind", menu)
    icon.run()

if __name__ == "__main__":
    main()
