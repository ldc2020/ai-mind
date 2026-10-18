"""统一测试入口：所有后端/浏览器测试只使用临时目录与独立端口。"""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]

with tempfile.TemporaryDirectory(prefix='ai-mind-test-') as directory:
    env = dict(os.environ, AI_MIND_TESTING='1', AI_MIND_DATA_DIR=directory, AI_MIND_LOG_DIR=str(Path(directory) / 'logs'),
               AI_MIND_RELOAD='false', PYTHONIOENCODING='utf-8', AI_MIND_PYTHON=sys.executable)
    for command in ([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-v'],
                    ['node', 'scripts/check_frontend.cjs'],
                    ['node', 'tests/frontend.test.cjs']):
        result = subprocess.run(command, cwd=ROOT, env=env)
        if result.returncode:
            sys.exit(result.returncode)
