# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['launcher.py'],
    pathex=[],
    binaries=[],
    # 网页、默认配置、模板和图标全部随 Windows 程序发布。
    datas=[('static', 'static'), ('config/defaults.json', 'config'),
           ('config/default-document.json', 'config'), ('config/local.example.json', 'config'),
           ('icon.ico', '.')],
    hiddenimports=['uvicorn.logging', 'uvicorn.loops.auto', 'uvicorn.protocols.http.auto',
                   'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan.on', 'pystray._win32'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'numpy', 'pandas', 'matplotlib', 'scipy', 'torch', 'tensorflow',
              'IPython', 'notebook', 'pytest', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='AI Mind',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['icon.ico'],
)
