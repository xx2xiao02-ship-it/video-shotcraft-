import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {nativeCardSfxCues} from './talkcraft-native-preparation.mjs';

test('原版明确登记无音效的卡不等于缺失音效表；未知卡、坏类型仍拒绝',()=>{
 const window={};new Function('window',fs.readFileSync(path.join(resolveTalkcraftSkillRoot(process.cwd()),'demos/_lib/sfx-map.js'),'utf8'))(window);
 assert.deepEqual(nativeCardSfxCues(window.SFX_MAP,'tilt-3d-page'),[]);
 assert.deepEqual(nativeCardSfxCues(window.SFX_MAP,'sway-parallax'),[]);
 assert.throws(()=>nativeCardSfxCues(window.SFX_MAP,'not-registered'),/没有可核验/);
 for(const value of [null,{},'',undefined])assert.throws(()=>nativeCardSfxCues({known:value},'known'),/没有可核验/);
 const original=[{t:1,name:'原音效'}];assert.equal(nativeCardSfxCues({known:original},'known'),original);
});
