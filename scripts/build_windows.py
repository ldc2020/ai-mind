"""生成包含代码、页面和默认配置的单文件 Windows 程序。"""
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
if sys.platform != 'win32':
    raise SystemExit('请在 Windows 上打包')
subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm',
                '--distpath', str(ROOT / 'dist'), '--workpath', str(ROOT / 'build/windows'),
                str(ROOT / 'launcher.spec')], cwd=ROOT, check=True)
# 同步旧入口，兼容用户已有的 launcher.exe 快捷方式，避免误启动旧引擎。
# 若旧程序仍在运行，复制会失败并明确报错，不静默保留过期版本。
shutil.copy2(ROOT / 'dist/AI Mind.exe', ROOT / 'dist/launcher.exe')
print(f'Windows 程序已生成：{ROOT / "dist/AI Mind.exe"}')
