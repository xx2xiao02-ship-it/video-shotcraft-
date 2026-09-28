const normalize = text => String(text || '').replace(/\s+/gu, ' ').trim();

export function annotateScene(text, index, total) {
  const value = normalize(text);
  const lower = value.toLowerCase();
  let l1 = 'proof';
  let l2 = 'explain';
  let intent = '把口播内容转成可读的视觉承载';
  let weight = 'sub';
  if (index === 0) { l1 = 'hook'; l2 = 'question'; intent = '制造认知缺口'; weight = 'main'; }
  else if (/为什么|怎么|怎么办|吗[？?]/u.test(value)) { l1 = 'hook'; l2 = 'question'; intent = '把问题推到观众面前'; weight = 'main'; }
  else if (/第一步|第二步|第三步|具体做|方法|开始/u.test(value)) { l1 = 'claim'; l2 = 'process'; intent = '给出可执行步骤'; weight = 'main'; }
  else if (/研究|发现|心理学|概率|数据|%|数字/u.test(value)) { l1 = 'proof'; l2 = 'data'; intent = '提供证据或解释'; weight = 'main'; }
  else if (/不是.*而是|真相|其实|可真相|问题本身/u.test(value)) { l1 = 'claim'; l2 = 'contrast'; intent = '完成转折并改写认知'; weight = 'main'; }
  else if (/收藏是|没有力量|才算|终点|起点/u.test(value)) { l1 = index >= total - 2 ? 'cta' : 'quote'; l2 = 'insight'; intent = '收束记忆点'; weight = 'main'; }
  else if (/从今天|删掉|行动|做一件/u.test(value)) { l1 = 'cta'; l2 = 'action'; intent = '推动行动'; weight = 'main'; }
  if (/我见过|朋友|职场|理财|时间管理/u.test(value)) { l2 = 'example'; intent = '用具体场景承载观点'; }
  return {text:value,index,total,l1,l2,intent,weight,entities:[],need: /研究|发现|心理学|数据|概率/u.test(value) ? '证据' : '文'};
}

export function annotateScenes(scenes) {
  return scenes.map((scene, index) => annotateScene(scene.text, index, scenes.length));
}
