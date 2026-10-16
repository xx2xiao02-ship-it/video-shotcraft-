import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

// EXE 启动器提供绝对路径。开发环境仅使用 PATH 或标准浏览器安装位置。
export function pythonExecutable(env = process.env) {
  return env.TALKCRAFT_PYTHON || env.B_MODE_PYTHON || env.SHOTCRAFT_PYTHON || 'python';
}
export function pythonEnvironment(env=process.env){
  const support=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../release/windows/python-support');
  const paths=[env.TALKCRAFT_PYTHONPATH,existsSync(support)?support:null,env.PYTHONPATH].filter(Boolean);
  return {...env,...(paths.length?{PYTHONPATH:paths.join(path.delimiter)}:{})};
}
// 上游允许缺依赖后降级为逐字匹配；生产入口禁止这个静默降级。
export function requireChineseAlignmentSupport({env=process.env,execute=execFileSync}={}) {
  const code="import json; import zhconv; from pypinyin import lazy_pinyin; from importlib.metadata import version; assert zhconv.convert('獲獎經濟學家','zh-cn')=='获奖经济学家'; assert lazy_pinyin('获奖')==lazy_pinyin('獲獎'); print(json.dumps({name:version(name) for name in ['zhconv','pypinyin','setuptools']}))";
  try {
    return JSON.parse(execute(pythonExecutable(env),['-c',code],{encoding:'utf8',windowsHide:true,timeout:30000,
      env:{...pythonEnvironment(env),PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},stdio:['ignore','pipe','pipe']}));
  } catch(error) {
    if(['EPERM','EACCES','ENOENT','ETIMEDOUT'].includes(error.code))
      throw Error(`中文对齐启动检查无法执行（${error.code}），请检查 Python 路径和任务启动环境；配音已保留。`);
    throw Error('中文对齐运行依赖检查失败：需要随包提供 zhconv、pypinyin 和兼容的 setuptools。配音已保留，请修复运行环境后重对齐失败句。');
  }
}
export function browserExecutable(env = process.env) {
  const explicit = env.REMOTION_BROWSER_EXECUTABLE || env.TALKCRAFT_BROWSER || env.TALKCRAFT_CHROME || env.CHROME;
  if (explicit) {
    if (!existsSync(explicit)) throw new Error('指定的渲染浏览器不存在');
    return explicit;
  }
  const candidates = [
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  return candidates.find(existsSync);
}
export function mediaExecutable(name, env = process.env) {
  if (!['ffmpeg', 'ffprobe'].includes(name)) throw new Error('不支持的媒体程序');
  return env[`SHOTCRAFT_${name.toUpperCase()}`] || name;
}
