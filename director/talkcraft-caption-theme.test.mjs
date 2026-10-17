import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {captionTheme,captionCardProps} from './talkcraft-caption-style.mjs';
import {installPresentationSkin} from './talkcraft-presentation-install.mjs';

test('字幕颜色继承两种任务主题，不沿用红黄演示色',()=>{
 for(const t of [
  {text:'#1a1a1a',captionColor:'#ffffff',accentPrimary:'#1a4a8a',surface:'#ffffff'},
  {text:'#eeeeee',captionColor:'#101010',accentPrimary:'#ffcc44',surface:'#181818'}]){
  assert.deepEqual(captionTheme(t),{text:t.text,keyword:t.captionColor,panel:t.accentPrimary,surface:t.surface});
  const props={keyword:'重点',delay:.6,fontSize:34};
  assert.deepEqual(captionCardProps('keyword-pop-highlight',props,t),{...props,ink:t.text,kwColor:t.captionColor,blockColor:t.accentPrimary});
  assert.deepEqual(captionCardProps('other-card',props,t),props);
 }
});
test('原卡承担同句字幕时仍安装主题，重复安装不重复注入',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'caption-theme-'));
 try{
  const src=path.join(dir,'remotion/src');fs.mkdirSync(src,{recursive:true});
  const file=path.join(src,'Subtitles.tsx');
  fs.writeFileSync(file,"import {KeywordCaption} from './KeywordCaption';\nreturn line && !cardOwnsNarrationCaption(shot,line.text) ? <KeywordCaption line={line} /> : null;");
  const adapter=path.join(src,'talkcraft-template-adapter.tsx');
  fs.writeFileSync(adapter,'const props = {...params.cardProps as Record<string,unknown>};');
  installPresentationSkin(dir);const bound=fs.readFileSync(adapter,'utf8');
  assert.match(bound,/captionCardProps\(shot.shotCard,params.cardProps as Record<string,unknown>,THEME\)/);
  const code=fs.readFileSync(file,'utf8');
  assert.match(code,/!cardOwnsNarrationCaption/);
  installPresentationSkin(dir);assert.equal(fs.readFileSync(file,'utf8'),code);
  const runtime=fs.readFileSync(path.join(src,'KeywordCaption.tsx'),'utf8');
  assert.match(runtime,/import \{THEME\} from '.\/theme'/);
  assert.match(runtime,/captionTheme\(THEME\)/);
  assert.equal(fs.readFileSync(adapter,'utf8'),bound);
  assert.doesNotMatch(runtime,/#b33131|#ffd23e/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('操作台字幕示意取任务快照，不取正在编辑的其他主题',()=>{
 const server=fs.readFileSync(new URL('../console-server.mjs',import.meta.url),'utf8');
 assert.match(server,/captionTheme = source.themeSnapshot \? normalizeTheme\(source.themeSnapshot\).tokens : null/);
 const ui=fs.readFileSync(new URL('../console-ui.html',import.meta.url),'utf8');
 assert.match(ui,/captionPreview.hidden = !plan.captionTheme/);
 assert.match(ui,/captionPreview.style.setProperty\(`--caption-\$\{slot\}`, plan.captionTheme\[token\]\)/);
});
