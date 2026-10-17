import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWordRuntime} from './talkcraft-word-runtime-validation.mjs';
const beats=[{id:'s09',startFrame:0,endFrame:120}];
const events=[{id:'context',beatId:'s09',globalFrame:0,role:'context'},{id:'spoken',beatId:'s09',globalFrame:90,role:'spoken'}];
const row=(frame,context,spoken,found=true)=>({frame,beatId:'s09',events:[{id:'context',found:true,visible:context},{id:'spoken',found,visible:spoken}],contentVisible:context||spoken,unplanned:[],layoutIssues:[]});
const check=rows=>validateWordRuntime({frames:rows.map(r=>r.frame),rows,events,beats,native:true});
test('原生主题淡入可见而口播锚点准时出现，通过审计',()=>assert.deepEqual(check([row(3,false,false,false),row(15,true,false,false),row(89,true,false),row(93,true,true)]),[]));
test('提前出现、锚点缺字或仍隐藏都不能通过',()=>{
 assert.ok(check([row(15,true,false),row(89,true,true),row(93,true,true)]).some(f=>f.reason==='early reveal'));
 assert.ok(check([row(15,true,false),row(93,true,false,false)]).some(f=>f.reason==='target absent at voice anchor'));
 assert.ok(check([row(15,true,false),row(93,true,false)]).some(f=>f.reason==='late/hidden reveal'));
});
test('背景说明也必须实际显示，不能靠跳过精确发声检查放行永久隐藏',()=>assert.ok(check([row(3,false,false),row(93,false,true)]).some(f=>f.reason==='context text never visibly evidenced')));
test('内容提前退场、未知字和手机版式问题继续阻断',()=>{
 const rows=[row(15,true,false),row(93,true,true),row(100,false,false)];rows[1].unplanned=['演示文案'];rows[1].layoutIssues=[{reason:'文字裁切'}];
 const failures=check(rows);for(const reason of ['unplanned visible business text','layout not readable','native content exited before shot ended'])assert.ok(failures.some(f=>f.reason===reason));
});
test('原生卡片入场空帧不误报，首次可见后空幕仍阻断',()=>{
 const rows=[row(3,false,false),row(15,true,false),row(30,false,false)];
 const failures=check(rows);
 assert.ok(!failures.some(f=>f.reason==='native content exited before shot ended'&&f.frame===3));
 assert.ok(failures.some(f=>f.reason==='native content exited before shot ended'&&f.frame===30));
});
