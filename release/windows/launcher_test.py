import importlib.util, json, tempfile, unittest
from unittest.mock import Mock, patch
from pathlib import Path

spec=importlib.util.spec_from_file_location('launcher',Path(__file__).with_name('launcher.py'))
launcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(launcher)
TEST_ROOT=Path(__file__).parent/'qa';TEST_ROOT.mkdir(exist_ok=True)

class InstallationSafety(unittest.TestCase):
    def test_http_health_is_not_ready_without_child_execution(self):
        process=Mock(pid=123);process.poll.return_value=None
        with patch.object(launcher,'read_json_url',return_value={'pid':123,'instance':'test','taskExecution':{'ok':False,'error':'EPERM'}}):
            with self.assertRaisesRegex(RuntimeError,'EPERM'):
                launcher.wait_ready(process,'http://local/health','test')
        with patch.object(launcher,'read_json_url',return_value={'pid':123,'instance':'test','taskExecution':{'ok':True}}):
            self.assertTrue(launcher.wait_ready(process,'http://local/health','test')['taskExecution']['ok'])
    def test_smoke_refuses_real_data_and_allows_own_restart(self):
        with tempfile.TemporaryDirectory(prefix='shotcraft-smoke-guard-',dir=TEST_ROOT) as folder:
            base=Path(folder);real=base/'真实数据';real.mkdir()
            credential=real/'provider-config.dpapi.json';credential.write_text('encrypted-existing-config','utf-8')
            with self.assertRaises(RuntimeError): launcher.validate_smoke_data(real,True)
            self.assertEqual(credential.read_text('utf-8'),'encrypted-existing-config')
            test=base/'独立 验证'
            with self.assertRaises(RuntimeError): launcher.validate_smoke_data(test,False)
            self.assertFalse(test.exists())
            launcher.validate_smoke_data(test,True)
            launcher.validate_smoke_data(test,True)

    def test_upgrade_preserves_state_and_refuses_user_code_changes(self):
        with tempfile.TemporaryDirectory(prefix='shotcraft-install-',dir=TEST_ROOT) as folder:
            base=Path(folder);package=base/'package';data=base/'用户 数据';data.mkdir()
            (package/'app/director').mkdir(parents=True)
            source=package/'app/director/program.mjs';source.write_text('version-one','utf-8')
            default=package/'app/director/theme.json';default.write_text('{"name":"默认"}','utf-8')
            manifest={'links':{},'files':[{'path':'director/program.mjs','sha256':launcher.sha(source),'role':'code'},
                {'path':'director/theme.json','sha256':launcher.sha(default),'role':'default'}]}
            workspace=launcher.prepare_workspace(package,data,manifest)
            (workspace/'director/theme.json').write_text('{"name":"用户主题"}','utf-8')
            success=workspace/'director/b-mode-runs/success.mp4';success.write_bytes(b'paid-asset-preserved')
            source.write_text('version-two','utf-8');manifest['files'][0]['sha256']=launcher.sha(source)
            launcher.prepare_workspace(package,data,manifest)
            self.assertEqual((workspace/'director/program.mjs').read_text('utf-8'),'version-two')
            self.assertIn('用户主题',(workspace/'director/theme.json').read_text('utf-8'))
            self.assertEqual(success.read_bytes(),b'paid-asset-preserved')
            (workspace/'director/program.mjs').write_text('user-code','utf-8')
            with self.assertRaises(RuntimeError): launcher.prepare_workspace(package,data,manifest)
            self.assertEqual((workspace/'director/program.mjs').read_text('utf-8'),'user-code')

    def test_payload_corruption_fails_before_any_installation(self):
        with tempfile.TemporaryDirectory(prefix='shotcraft-install-',dir=TEST_ROOT) as folder:
            base=Path(folder);package=base/'package';data=base/'data';data.mkdir();(package/'app').mkdir(parents=True)
            a=package/'app/a.mjs';b=package/'app/b.mjs';a.write_text('one');b.write_text('two')
            manifest={'links':{},'files':[{'path':p.name,'sha256':launcher.sha(p),'role':'code'} for p in [a,b]]}
            b.write_text('damaged')
            with self.assertRaises(RuntimeError): launcher.prepare_workspace(package,data,manifest)
            self.assertFalse((data/'workspace/a.mjs').exists())

    def test_traversal_and_symlink_escape_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix='shotcraft-install-',dir=TEST_ROOT) as folder:
            root=Path(folder)
            for relative in ['../outside','C:/outside','a/../../outside']:
                with self.assertRaises(ValueError): launcher.safe_relative(root,relative)

if __name__=='__main__':unittest.main()
