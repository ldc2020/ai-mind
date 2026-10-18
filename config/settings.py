"""后端配置入口：环境变量 > config/local.json > config/defaults.json。

相对路径始终以项目根目录为基准，不受启动命令所在目录影响。
修改配置后需要重启服务；local.json 用于个人覆盖，不提交到版本库。
"""
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[1]))


def application_home():
    """可写配置/数据与打包资源分开，文档不能存进单文件 EXE 的临时解压目录。"""
    if os.environ.get('AI_MIND_HOME'):
        return Path(os.environ['AI_MIND_HOME']).expanduser().resolve()
    if not getattr(sys, 'frozen', False):
        return PROJECT_ROOT
    executable_dir = Path(sys.executable).resolve().parent
    # 在本项目 dist 目录运行时，继续使用原有文档和个人配置。
    project_dir = executable_dir.parent
    if executable_dir.name == 'dist' and (project_dir / 'config/defaults.json').is_file():
        return project_dir
    # 单独复制到其他位置运行时，使用 Windows 用户数据目录。
    return Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'AI Mind'


APP_HOME = application_home()


def default_document_path():
    """用户可覆盖默认模板，未覆盖时读取随 EXE 一起发布的模板。"""
    custom = APP_HOME / 'config/default-document.json'
    return custom if custom.is_file() else PROJECT_ROOT / 'config/default-document.json'


def load_settings(environ=None, local_file=None):
    """加载并校验运行参数；可注入环境与文件，便于隔离测试。"""
    env = os.environ if environ is None else environ
    values = json.loads((PROJECT_ROOT / "config/defaults.json").read_text(encoding="utf-8"))
    local_path = Path(local_file) if local_file else APP_HOME / "config/local.json"
    if local_path.exists():
        overrides = json.loads(local_path.read_text(encoding="utf-8"))
        unknown = set(overrides) - set(values)
        if unknown:
            raise ValueError(f"未知配置项：{', '.join(sorted(unknown))}")
        values.update(overrides)
    for key in values:
        if f"AI_MIND_{key.upper()}" in env:
            values[key] = env[f"AI_MIND_{key.upper()}"]
    for key in ("port", "startup_timeout_seconds"):
        values[key] = int(values[key])
    if not 1 <= values["port"] <= 65535:
        raise ValueError("port 必须在 1 到 65535 之间")
    if values["startup_timeout_seconds"] <= 0:
        raise ValueError("startup_timeout_seconds 必须大于 0")
    reload_value = str(values["reload"]).lower()
    if reload_value not in ("true", "false", "1", "0"):
        raise ValueError("reload 只能填写 true 或 false")
    values["reload"] = reload_value in ("true", "1")
    for key in ("data_dir", "static_dir", "log_dir"):
        path = Path(values[key]).expanduser()
        base = PROJECT_ROOT if key == 'static_dir' else APP_HOME
        values[key] = (base / path).resolve() if not path.is_absolute() else path.resolve()
    return values


settings = load_settings()
