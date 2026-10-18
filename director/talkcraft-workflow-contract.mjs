export const TALKCRAFT_WORKFLOW_SCHEMA = 'talkcraft-workflow-contract-v2';

export const MANAGED_WORKFLOW_NODES = Object.freeze([
  {id:'input',label:'文案与配音',task:'保存文案，生成或接收完整配音',mode:'serial'},
  {id:'word-timing',label:'字级时间轴',task:'核对逐字发音时间与文案映射',mode:'serial'},
  {id:'semantics',label:'逐句语义标注',task:'按原稿标注语义与重点，校验逐句对应',mode:'serial'},
  {id:'editorial',label:'SHOTBOOK 分镜编排',task:'生成分镜提案并完成句序、边界和模板参数校验；本节点不执行候选、规划预检或全量预检',mode:'serial'},
  {id:'generation-input',label:'生成输入检查',task:'核对角色图、原配音和真实画面素材；不要求尚未生成的口型视频',mode:'serial'},
  {id:'candidates',label:'镜头候选与选卡',task:'先按语义检索并核对真实素材与背景，再比较全部已审模板；同等可行性优先图形表达，完成选卡和版本绑定',mode:'serial'},
  {id:'storyboard-review',label:'分镜校验与审核',task:'在本节点审查、补全及局部修订分镜数据，按原规则复检并记录审核版本；保留有效成果，不修改程序代码',mode:'serial',phases:['planning-check','approve-storyboard']},
  {id:'digital-human',label:'数字人生成与验收',task:'优先复用匹配音频和人物区间的素材；不足按任务授权自动生成，仅查询恢复已有taskId，结果未知停止核实；检查帧率、帧数及区间',mode:'serial-join',phases:['digital-human','host-preflight']},
  {id:'preflight',label:'分镜全量预检',task:'本节点恢复或补全素材绑定、汇合人物素材，按 GitHub 原版④→⑤完整复检；局部创作修订沿用单次模型授权，不机械重跑04',mode:'serial-join'},
  {id:'scaffold',label:'渲染工程与场景',task:'按已审模板搭建工程并落实全部场景绑定',mode:'serial'},
  {id:'sample',label:'样片生成与审核',task:'生成有声样片，通过检查后记录用户审核版本',mode:'serial',phases:['sample','approve-sample']},
  {id:'render-all',label:'整片渲染',task:'按镜头分段并行渲染，汇合后合成整条音轨与成片',mode:'parallel-inside'},
  {id:'qa',label:'机器规则检查',task:'检查代码、参数、时间轴、素材绑定、帧数与文件完整性',mode:'serial'},
  {id:'review',label:'人工视觉审核',task:'查看全片，确认布局、可读性、动效、口型与声音观感',mode:'serial'},
  {id:'deliver',label:'交付导出',task:'导出人工审核通过的可播放成片',mode:'serial'},
]);

const recordedNodes=MANAGED_WORKFLOW_NODES.map(node =>
  node.id === 'generation-input' ? {...node,label:'真人素材体检',task:'核验真人口播视频、原声、帧率、时长和画幅'} : node
).filter(node => node.id !== 'digital-human');
const recordedInput=recordedNodes.find(node=>node.id==='generation-input');
export const RECORDED_HOST_WORKFLOW_NODES = Object.freeze([
  ...recordedNodes.filter(node=>!['generation-input','editorial'].includes(node.id)).slice(0,3),
  recordedInput,
  recordedNodes.find(node=>node.id==='editorial'),
  ...recordedNodes.filter(node=>!['input','word-timing','semantics','generation-input','editorial'].includes(node.id)),
]);

const aliases = Object.freeze({
  bootstrap:'input','recover-timing':'input','fact-revision':'input',
  'recover-alignment':'word-timing','word-timing':'word-timing',
  'semantic-init':'semantics','semantic-check':'semantics','semantic-apply':'semantics','semantic-shot-check':'editorial',
  editorial:'editorial','editorial-check':'editorial','editorial-revision':'editorial','editorial-recover':'editorial',
  'media-preflight':'generation-input','material-research':'candidates',candidates:'candidates','planning-check':'storyboard-review','approve-storyboard':'storyboard-review',
  'planning-repair':'storyboard-review','preflight-repair':'preflight',
  'digital-human':'digital-human','host-preflight':'digital-human',preflight:'preflight',
  scaffold:'scaffold','workbench-contract':'scaffold','visual-card-calls':'scaffold',
  sample:'sample','sample-2m':'sample','sample-qa':'sample','approve-sample':'sample',
  'render-all':'render-all',qa:'qa','render-qa':'qa','word-reveal-qa':'qa','text-contrast':'qa',
  'approve-final':'review',deliver:'deliver',
});

export function workflowNodeForTask(name) {
  const stage=String(name||'').replace(/^talkcraft-/u,'');
  return aliases[stage]||stage;
}

export const TALKCRAFT_PARALLEL_CONTRACT = Object.freeze({
  startsAfter:'storyboard-review',
  joinBefore:'preflight',
  lanes:Object.freeze([
    {id:'digital-human',label:'RunningHub 人物区间生成',required:true},
    {id:'template-runtime',label:'已审模板源码与运行依赖准备',required:true},
    {id:'materials',label:'非人物素材下载与规范化',required:true},
    {id:'scaffold-shell',label:'渲染工程骨架准备',required:true,completionDoesNotPassNode:'scaffold'},
  ]),
  rule:'并行支线可以提前准备产物，但不得把全量预检、场景实现、样片或整片标记为完成；全部支线和数字人验收必须在分镜全量预检前汇合。',
});
