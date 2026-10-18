"""把 EXE 单独复制到临时目录，再用真实浏览器验收，排除依赖源码目录的假通过。"""
import json
import hashlib
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

import psutil

ROOT = Path(__file__).resolve().parents[1]
expected_version = json.loads((ROOT / 'config/defaults.json').read_text(encoding='utf-8'))['version']
executable = ROOT / 'dist/AI Mind.exe'
if not executable.is_file():
    raise SystemExit('请先运行 python scripts/build_windows.py')
# 两个入口必须是同一份构建，防止旧快捷方式启动遗留程序。
legacy_entry = ROOT / 'dist/launcher.exe'
if not legacy_entry.is_file() or hashlib.sha256(legacy_entry.read_bytes()).digest() != hashlib.sha256(executable.read_bytes()).digest():
    raise SystemExit('launcher.exe 与 AI Mind.exe 不一致，请重新打包并同步旧入口')

with tempfile.TemporaryDirectory(prefix='ai-mind-windows-') as directory:
    isolated = Path(directory)
    packaged = isolated / executable.name
    shutil.copy2(executable, packaged)
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    env = dict(os.environ, AI_MIND_HOME=str(isolated / 'profile'), AI_MIND_DATA_DIR=str(isolated / 'documents'),
               AI_MIND_LOG_DIR=str(isolated / 'logs'), AI_MIND_PORT=str(port), AI_MIND_RELOAD='false',
               AI_MIND_HOST='127.0.0.1', AI_MIND_TESTING='1', PYTHONIOENCODING='utf-8',
               AI_MIND_TEST_BASE_URL=f'http://127.0.0.1:{port}')
    # 不继承源码静态资源覆盖，确保加载的是 EXE 自带页面。
    env.pop('AI_MIND_STATIC_DIR', None)
    process = subprocess.Popen([str(packaged), '--serve-only'], cwd=isolated, env=env,
                               creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        ready = False
        for _ in range(120):
            try:
                with urllib.request.urlopen(env['AI_MIND_TEST_BASE_URL'] + '/api/health', timeout=1) as response:
                    health = json.load(response)
                    assert health['version'] == expected_version, health
                    ready = True
                    break
            except OSError:
                if process.poll() is not None:
                    break
                time.sleep(0.5)
        if not ready:
            error = isolated / 'logs/launcher_error.log'
            raise RuntimeError('EXE 启动失败：' + (error.read_text(encoding='utf-8') if error.exists() else str(process.poll())))
        print(f'独立 EXE 启动成功，版本 {expected_version}；开始浏览器回归', flush=True)
        subprocess.run(['node', 'tests/frontend.test.cjs'], cwd=ROOT, env=env, check=True)
        print('Windows EXE 独立运行、彩色弧线主题和完整浏览器回归通过', flush=True)
    finally:
        # 只清理本测试创建的进程树；不会结束用户运行中的旧版本。
        try:
            parent = psutil.Process(process.pid)
            processes = parent.children(recursive=True) + [parent]
            for child in reversed(processes):
                try:
                    child.terminate()
                except psutil.NoSuchProcess:
                    pass
            _, alive = psutil.wait_procs(processes, timeout=5)
            for child in alive:
                child.kill()
            psutil.wait_procs(alive, timeout=5)
        except psutil.NoSuchProcess:
            pass
        process.wait(timeout=10)
