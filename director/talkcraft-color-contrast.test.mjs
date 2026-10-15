import test from 'node:test';import assert from 'node:assert/strict';
import {contrastRatio,compositeColor,chooseReadableText,minimumContrast,backgroundsUnderGlyphs,pictogramWitness,sampledContrast} from './talkcraft-color-contrast.mjs';
test('彩色图标使用真实连续像素，CSS字色不能替代实际图形颜色',()=>{
 const row={glyphKind:'pictogram',color:'#fff',rect:{left:0,top:0,width:2,height:2}},bg=Uint8Array.from(Array(4).fill([255,255,255]).flat());
 const pixels=Uint8Array.from(Array(4).fill([25,45,85]).flat()),w=pictogramWitness(row,pixels,bg,2,2);
 assert.equal(w.pixels.length,4);assert.ok(sampledContrast({...row,pictogramWitness:w})>=4.5);
 assert.equal(pictogramWitness(row,bg,bg,2,2),null);
 const faint=Uint8Array.from(Array(4).fill([210,210,210]).flat());
 assert.ok(sampledContrast({...row,pictogramWitness:pictogramWitness(row,faint,bg,2,2)})<4.5);
 assert.throws(()=>sampledContrast(row),/像素证据/);
});
test('孤立噪点与画框外的高对比色不构成图标可辨识证据',()=>{
 const row={rect:{left:0,top:0,width:2,height:2}},bg=new Uint8Array(12).fill(255),noisy=Uint8Array.from(bg);noisy.set([0,0,0],0);
 assert.equal(pictogramWitness(row,noisy,bg,2,2),null);
 const outside={rect:{left:2,top:0,width:2,height:2}};
 assert.equal(pictogramWitness(outside,new Uint8Array(12),bg,2,2),null);
});
test('黑白及短十六进制颜色',()=>assert.equal(contrastRatio('#000','#fff'),21));
test('黑底暗字选择固定浅字',()=>assert.equal(chooseReadableText('#1d1d1f',[[0,0,0]]).color,'#ffffff'));
test('浅底白字选择固定深字',()=>assert.equal(chooseReadableText('#fff',[[255,255,255]]).color,'#111817'));
test('足够清楚的强调色保留',()=>assert.equal(chooseReadableText('#72e0bf',[[0,0,0]]).changed,false));
test('局部复杂视频背景使用固定底衬',()=>assert.ok(chooseReadableText('#888',[[0,0,0],[255,255,255]]).backgroundColor));
test('透明叠加与渐暗字色要计算实际合成颜色',()=>{assert.deepEqual(compositeColor('rgba(255,255,255,0.5)','#000'),[127.5,127.5,127.5]);assert.ok(minimumContrast('#fff',[[0,0,0]],.1)<4.5);assert.throws(()=>chooseReadableText('#fff',[[0,0,0]],{opacity:.1}),/透明度/);});
test('缺背景不允许猜测通过',()=>assert.throws(()=>chooseReadableText('#fff',[]),/实际背景/));
test('祖先亮度滤镜影响实际字色对比度',()=>{assert.ok(minimumContrast('#fff',[[0,0,0]],1,.35)<4.5);assert.ok(minimumContrast('#fff',[[0,0,0]],1,.5)>4.5);assert.throws(()=>chooseReadableText('#fff',[[0,0,0]],{brightness:.35}),/透明度/);});
test('视频像素变化不冒充文字笔画',()=>{const row={color:'#fff',opacity:1,rect:{left:0,top:0,width:1,height:1}};assert.deepEqual(backgroundsUnderGlyphs(row,Uint8Array.from([80,20,20]),Uint8Array.from([70,40,15]),1,1),[]);});
test('旋转文字包围盒的空白色块不作为笔画背景',()=>{
 const row={rect:{left:0,top:0,width:3,height:1}},normal=Uint8Array.from([255,255,255,0,0,0,114,224,191]),bg=Uint8Array.from([0,0,0,0,0,0,114,224,191]);
 assert.deepEqual(backgroundsUnderGlyphs(row,normal,bg,3,1),[[0,0,0]]);
 assert.deepEqual(backgroundsUnderGlyphs(row,bg,bg,3,1),[]);
});
