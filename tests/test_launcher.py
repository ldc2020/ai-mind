"""验证 Windows 旧实例提示，测试不显示系统弹窗，也不结束真实进程。"""
import io
import importlib.util
import json
import os
import sys
import unittest
from unittest.mock import patch

if os.environ.get('AI_MIND_TESTING') != '1':
    raise RuntimeError('请使用 python scripts/test.py 运行隔离测试')


HAS_LAUNCHER = sys.platform == 'win32' and all(importlib.util.find_spec(name) for name in ('psutil', 'PIL', 'pystray', 'win32event', 'win32gui'))


@unittest.skipUnless(HAS_LAUNCHER, '需要 Windows 和可选的 requirements-launcher.txt 依赖')
class LauncherTests(unittest.TestCase):
    def test_old_instance_requires_exit_instead_of_focusing_old_page(self):
        import launcher
        response = io.BytesIO(json.dumps({'application': 'AI Mind', 'ready': True}).encode())
        with patch.object(launcher, 'check_single_instance', return_value=None), \
             patch.object(launcher.urllib.request, 'urlopen', return_value=response), \
             patch.object(launcher.win32gui, 'MessageBox') as message, \
             patch.object(launcher, 'open_browser') as browser:
            launcher.main()
            message.assert_called_once()
            self.assertIn('保存导图', message.call_args.args[1])
            browser.assert_not_called()

    def test_matching_version_reuses_existing_instance(self):
        import launcher
        response = io.BytesIO(json.dumps({'application': 'AI Mind', 'version': launcher.settings['version']}).encode())
        with patch.object(launcher, 'check_single_instance', return_value=None), \
             patch.object(launcher.urllib.request, 'urlopen', return_value=response), \
             patch.object(launcher.win32gui, 'MessageBox') as message, \
             patch.object(launcher, 'open_browser') as browser:
            with self.assertRaises(SystemExit):
                launcher.main()
            browser.assert_called_once()
            message.assert_not_called()
