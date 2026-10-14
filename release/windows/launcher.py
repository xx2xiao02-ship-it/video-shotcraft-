"""随包运行入口。用户数据不放在安装目录；没有 API Key 也能启动。"""
from __future__ import annotations
import argparse, hashlib, json, os, shutil, socket, subprocess, sys, time, traceback, urllib.request, webbrowser
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent

def sha(file):
    digest = hashlib.sha256()
    with Path(file).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

def verify_runtime(package):
    hashes=json.loads((package/'payload-hashes.json').read_text('utf-8'))
    for relative, expected in hashes.items():
        file=Path(relative)
        if relative in {'manifest.json','launcher.py','runtime-check.py','smoke.mjs','VideoShotCraft.exe'} or (
            relative.startswith('runtime/') and (file.suffix in {'.exe','.dll','.pyd'} or file.name=='model.bin')):
            if sha(safe_relative(package,relative)) != expected:
                raise RuntimeError('运行文件损坏：'+relative)

def safe_relative(root, relative, allow_leaf_link=False):
    item = Path(relative)
    if item.is_absolute() or ':' in relative or '..' in item.parts:
        raise ValueError('安装清单路径越界')
    destination = root / item
    checked = destination.parent if allow_leaf_link else destination
    if not checked.resolve().is_relative_to(root.resolve()):
        raise ValueError('安装路径指向用户目录之外')
    return destination

def prepare_workspace(package, data, manifest):
    workspace = data / 'workspace'
    workspace.mkdir(parents=True, exist_ok=True)
    state_file = data / 'installed-files.json'
    previous = json.loads(state_file.read_text('utf-8')) if state_file.exists() else {}
    current = dict(previous)
    # 先全量核验，避免遇到损坏文件时只安装了一半。
    for entry in manifest['files']:
        source = safe_relative(package / 'app', entry['path'])
        if sha(source) != entry['sha256']:
            raise RuntimeError('程序文件校验失败：' + entry['path'])
        target = safe_relative(workspace, entry['path'])
        if target.exists() and entry['role'] == 'code' and sha(target) not in {entry['sha256'], previous.get(entry['path'])}:
            raise RuntimeError('发现本地程序文件被修改，已保留，请先备份核对：' + entry['path'])
    for entry in manifest['files']:
        source = safe_relative(package / 'app', entry['path'])
        target = safe_relative(workspace, entry['path'])
        if not target.exists() or (entry['role'] == 'code' and sha(target) != entry['sha256']):
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name(target.name + '.installing')
            shutil.copy2(source, temporary)
            temporary.replace(target)
        if entry['role'] == 'code':
            current[entry['path']] = entry['sha256']
    for relative, payload_relative in manifest['links'].items():
        target = safe_relative(workspace, relative, allow_leaf_link=True)
        source = safe_relative(package, payload_relative)
        if not source.is_dir():
            raise RuntimeError('运行依赖缺失：' + payload_relative)
        if target.exists() or target.is_junction():
            if target.resolve() != source.resolve():
                # 只允许升级本启动器曾创建的依赖链接，不删除真实目录。
                if not target.is_junction() or previous.get('@link/' + relative) != str(target.resolve()):
                    raise RuntimeError('已有依赖目录指向其他位置，已保留：' + relative)
                target.rmdir()
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run([os.environ.get('COMSPEC', r'C:\Windows\System32\cmd.exe'), '/d', '/c', 'mklink', '/J', str(target), str(source)], check=True, capture_output=True)
        current['@link/' + relative] = str(source.resolve())
    for relative in ['materials', 'template/out', 'director/a-mode-runs', 'director/b-mode-runs', 'director/packaging-runs']:
        safe_relative(workspace, relative).mkdir(parents=True, exist_ok=True)
    temporary = state_file.with_suffix('.tmp')
    temporary.write_text(json.dumps(current, ensure_ascii=False, indent=2), 'utf-8')
    temporary.replace(state_file)
    return workspace

def runtime_environment(package, workspace, data, manifest):
    env = os.environ.copy()
    windows = env.get('SystemRoot', r'C:\Windows')
    env['PATH'] = os.pathsep.join([str(package/'runtime/node'), str(package/'runtime/python'), str(package/'runtime/ffmpeg'), windows+'\\System32', windows, windows+'\\System32\\WindowsPowerShell\\v1.0'])
    python = str(package/'runtime/python/python.exe')
    browser = str(package/'runtime/browser/chrome-headless-shell.exe')
    env.update(SHOTCRAFT_ROOT=str(workspace), SHOTCRAFT_CONFIG_DIR=str(data),
        SHOTCRAFT_RELEASE_VERSION=manifest['version'], SHOTCRAFT_PYTHON=python,
        TALKCRAFT_PYTHON=python, B_MODE_PYTHON=python,
        REMOTION_BROWSER_EXECUTABLE=browser, TALKCRAFT_BROWSER=browser, TALKCRAFT_CHROME=browser,
        SHOTCRAFT_FFMPEG=str(package/'runtime/ffmpeg/ffmpeg.exe'), SHOTCRAFT_FFPROBE=str(package/'runtime/ffmpeg/ffprobe.exe'),
        TALKCRAFT_SKILL_ROOT=str(workspace/'_audit/video-talkcraft'),
        TALKCRAFT_ASR_MODEL=str(package/'runtime/models/whisper-small'),
        HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', PYTHONUTF8='1', PYTHONIOENCODING='utf-8',
        NODE_PATH=str(workspace/'template/node_modules'),
        PYTHONHOME=str(package/'runtime/python'), PYTHONPATH=str(package/'runtime/python/Lib/site-packages'))
    # 不继承开发会话中的服务端点/令牌；配置仍由本程序的 DPAPI 配置读取。
    for key in list(env):
        if key.startswith(('A_MODE_ARK_', 'RUNNINGHUB_', 'VOLCENGINE_', 'TALKCRAFT_PLAYWRIGHT_PATH')):
            env.pop(key, None)
    return env

def available_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

def read_json_url(url):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=1) as response:
        return json.load(response)

def validate_smoke_data(data, explicit):
    if not explicit:
        raise RuntimeError('离线验证必须指定独立 --data-dir，不允许使用默认用户数据')
    marker=data/'.shotcraft-offline-test'
    if data.exists() and any(data.iterdir()) and not (marker.is_file() and marker.read_text('utf-8')=='shotcraft-offline-test-v1'):
        raise RuntimeError('验证目录已有非测试数据，已保留，请指定新的空目录')
    data.mkdir(parents=True,exist_ok=True)
    marker.write_text('shotcraft-offline-test-v1','utf-8')

def wait_ready(process, url, expected, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('服务启动后退出，请查看 console.log')
        try:
            result = read_json_url(url)
            if result.get('instance') == expected and result.get('pid') == process.pid:
                execution = result.get('taskExecution', {})
                if not execution.get('ok'):
                    raise RuntimeError(execution.get('error') or '操作台子进程启动验证未通过')
                return result
        except (OSError, ValueError):
            pass
        time.sleep(.2)
    raise RuntimeError('操作台未通过 HTTP 启动验证')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', type=Path)
    parser.add_argument('--check-only', action='store_true')
    parser.add_argument('--smoke-test', action='store_true')
    parser.add_argument('--headless', action='store_true')
    args = parser.parse_args()
    data = (args.data_dir or Path(os.environ['LOCALAPPDATA'])/'VideoShotCraft').resolve()
    if args.smoke_test: validate_smoke_data(data,args.data_dir is not None)
    data.mkdir(parents=True, exist_ok=True)
    log_file = data/'launcher-error.txt'
    lock = (data/'launcher.lock').open('a+b')
    import msvcrt
    lock.seek(0); lock.write(b'0'); lock.flush(); lock.seek(0)
    try:
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        state_file = data/'launcher-state.json'
        if state_file.exists():
            state = json.loads(state_file.read_text('utf-8'))
            health = read_json_url(state['url']+'/api/runtime-health')
            if health.get('instance') == state.get('instance'):
                if not health.get('taskExecution', {}).get('ok'):
                    raise RuntimeError('已有操作台无法启动任务，请关闭该实例后重新启动')
                if not args.headless: webbrowser.open(state['url']+'/')
                return 0
        raise RuntimeError('另一个启动器正在准备运行文件，请稍后再打开')
    children = []
    handles = []
    try:
        verify_runtime(PACKAGE)
        manifest = json.loads((PACKAGE/'manifest.json').read_text('utf-8'))
        workspace = prepare_workspace(PACKAGE, data, manifest)
        env = runtime_environment(PACKAGE, workspace, data, manifest)
        check = subprocess.run([str(PACKAGE/'runtime/python/python.exe'), str(PACKAGE/'runtime-check.py')], env=env, cwd=workspace, capture_output=True, text=True, encoding='utf-8')
        (data/'runtime-check.json').write_text(check.stdout, 'utf-8')
        if check.returncode: raise RuntimeError('运行依赖验证失败：'+check.stderr[-1500:])
        if args.check_only: return 0
        port, supervisor_port = available_port(), available_port()
        while supervisor_port == port: supervisor_port = available_port()
        instance = os.urandom(16).hex()
        env.update(PORT=str(port), A_MODE_SUPERVISOR_PORT=str(supervisor_port),
            A_MODE_SUPERVISOR_URL=f'http://127.0.0.1:{supervisor_port}/run', SHOTCRAFT_INSTANCE=instance)
        for name, command in [('supervisor', [env['SHOTCRAFT_PYTHON'], str(workspace/'director/a-mode-supervisor.py')]),
                              ('console', [str(PACKAGE/'runtime/node/node.exe'), str(workspace/'console-server.mjs')])]:
            handle = (data/(name+'.log')).open('ab'); handles.append(handle)
            child = subprocess.Popen(command, cwd=workspace, env=env, stdout=handle, stderr=handle,
                creationflags=subprocess.CREATE_NO_WINDOW)
            children.append(child)
        deadline = time.monotonic()+10
        while time.monotonic()<deadline:
            if children[0].poll() is not None: raise RuntimeError('任务桥接器启动失败')
            try:
                with socket.create_connection(('127.0.0.1',supervisor_port),timeout=.1): break
            except OSError: time.sleep(.1)
        else: raise RuntimeError('任务桥接器未就绪')
        url = f'http://127.0.0.1:{port}'
        wait_ready(children[1], url+'/api/runtime-health', instance)
        state = dict(url=url, instance=instance, pid=children[1].pid, version=manifest['version'], workspace=str(workspace))
        (data/'launcher-state.json').write_text(json.dumps(state, ensure_ascii=False, indent=2), 'utf-8')
        print('SHOTCRAFT_READY '+url,flush=True)
        if args.smoke_test:
            completed = subprocess.run([str(PACKAGE/'runtime/node/node.exe'), str(PACKAGE/'smoke.mjs'), url, str(data)], env=env, cwd=workspace, capture_output=True, text=True, encoding='utf-8', timeout=240)
            (data/'smoke.log').write_text(completed.stdout+'\n'+completed.stderr, 'utf-8')
            if completed.returncode: raise RuntimeError('安装包业务验证失败，请查看 smoke.log')
            return 0
        if not args.headless: webbrowser.open(url+'/')
        while children[0].poll() is None and children[1].poll() is None: time.sleep(.3)
        return 1
    except Exception:
        log_file.write_text(traceback.format_exc(), 'utf-8')
        return 1
    finally:
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
                try: child.wait(timeout=5)
                except subprocess.TimeoutExpired: child.kill(); child.wait()
        for handle in handles: handle.close()
        lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1); lock.close()

if __name__ == '__main__':
    try: raise SystemExit(main())
    except Exception:
        # 启动锁/数据目录异常也形成文件证据，不把密钥写入日志。
        print('启动前置检查失败', file=sys.stderr)
        raise SystemExit(1)
