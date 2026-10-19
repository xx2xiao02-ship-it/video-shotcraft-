import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveCandidates} from './talkcraft-source-archive.mjs';
import {sourceSearchContract,declaredBackgroundAlternatives} from './talkcraft-material-completion.mjs';
test('第二在线来源只接受逐项明确自由许可，不把公开归档和作者缺失当授权',()=>{
 const data={metadata:{title:'Economic academic lecture',description:'Economics lecture',creator:'University',licenseurl:'https://creativecommons.org/licenses/by/4.0/'},files:[{name:'lecture.mp4',source:'original',size:'10000'}]};
 const match=sourceSearchContract('学术现场');assert.equal(archiveCandidates('lecture',data,{kind:'video'},match).length,1);
 for(const mutate of [d=>delete d.metadata.licenseurl,d=>d.metadata.licenseurl='https://creativecommons.org/licenses/by-nc/4.0/',d=>d.metadata.creator='',d=>d.files[0].size='999999999']){
  const d=structuredClone(data);mutate(d);assert.equal(archiveCandidates('lecture',d,{kind:'video'},match).length,0);
 }
 assert.equal(archiveCandidates('../escape',data,{kind:'video'},match).length,0);
});
test('仅执行编导已经声明的学术替代背景；奖项身份和相邻学科不借此放行',()=>{
 const row={backgroundConcepts:['academic audience'],backgroundReason:'选择诺贝尔奖颁奖或学术现场画面仅作语境承接'};
 const alternatives=declaredBackgroundAlternatives(row);assert.equal(alternatives.length,1);
 const match=sourceSearchContract('诺贝尔经济学奖 颁奖现场',[],alternatives);
 assert.equal(match.matches('Economics academic lecture'),true);
 assert.equal(match.matches('Physics academic lecture'),false);
 assert.equal(match.matches('Nobel medicine lecture'),false);
 assert.equal(sourceSearchContract('诺贝尔经济学奖 颁奖现场').matches('Economics academic lecture'),false);
 assert.deepEqual(declaredBackgroundAlternatives({...row,backgroundReason:'必须奖项颁奖'}),[]);
});
