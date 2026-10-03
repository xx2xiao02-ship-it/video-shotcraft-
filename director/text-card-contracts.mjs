const spec=(summary,minLines,maxLines,maxChars,frames=180)=>({summary,minLines,maxLines,maxChars,maxTotalChars:32,acceptedFrames:[frames],fps:30});
export const TEXT_CARD_CONTRACTS=Object.freeze({
  'effects/fui-hud-moves/reticle-lock-on':spec('真实页面截图与同会话实测目标框；锁定一行真实短标签，180帧长版',1,1,12),
  'effects/brand-frame-snap':spec('两种不同真实页面与对应竖版截图；两种模式各一条标签，翻框与内容同帧切换',2,2,8),
  'effects/spotlight-sweep-moves/glow-wake-sleep-panel':spec('真实页面截图与一条短标题；聚光扫亮后收暗，主题色控制光线',1,1,12),
  'effects/spotlight-sweep-moves/slide-spotlight-pan':spec('真实页面截图与一条短标题；贴边泛光横移显影，保留原面板运镜',1,1,12),
  'effects/spotlight-sweep-moves/corner-spotlight-reveal':spec('真实页面截图与一条短标题；角落聚光匀速显影至全屏',1,1,12),
  'effects/radial-ripple-phone-chips':spec('真实手机长截图与两条功能标签；截图足以覆盖264像素屏高及150像素滚动',2,2,8),
  'outro/edit-hook-moves/logo-sting-button':spec('真实前镜与未出现的彩蛋详情截图、实测特写区域和一条品牌字标',1,1,12),
  'data/scroll-brake-moves/changelog-scroll-brake':spec('单行标题与8至40项真实列表；按唯一目标ID指数减速停位并抬升，禁止复制补足记录',1,1,12),
  'data/scroll-brake-moves/brake-reticle-lock':spec('单行标题与8至40项真实列表；按唯一目标ID急刹，第59帧准星咬合并显示真实旁弹说明',1,1,12),
  'typography/type-rhythm-sync/karaoke-fill-sync':spec('1至6个旁白词组；仅有真实词级时间轴时开放，逐词填色，至少20帧静止收尾；时间戳禁止模型编造',1,6,6),
  'data/cycle-glass-node-morph':spec('上下文、同一主体、机制标题与三段循环标签；完整缩入、推近、节点接管及34帧收尾',6,6,6,257),
  'typography/type-rhythm-sync/font-weight-pump':spec('单行实际标题；五拍字重与描边脉冲，第三/五拍额外撑宽；必须本地音轨同帧对拍',1,1,8),
  'rhythm/smear-multiples':spec('标题与同一业务卡的名称/两行正文；四个完整残像在12帧横移后合拢，不代表多份记录',4,4,6),
  'rhythm/sakuga-timing-shift':spec('标题、同一业务卡名称/两行正文与两阶段标签；三帧顿挫转逐帧冲刺，静止收尾',6,6,6),
  'data/ring-diagram-annotation-reveal':spec('两层主体名称、四块短标题与两级注释；向心箭头与布局让位，最后30帧只转外环',8,8,8),
  'data/timeline-travel':spec('标题与四组刻度名称/事件说明；人工复盘步骤，原轴线掠过、弹立及急停推近',9,9,8),
  'rhythm/beat-step-list-theme-cycle':spec('五个短词；前三拍将选中行、胶囊色及底色同步切换，第五词作为未选邻项；对拍声音待验',5,5,6),
  'effects/riso-print-hits/riso-beat-pump':spec('标题与三组标题正文；四拍整场顿推与标题套印逐次加码；浅纸深墨，对拍声音待验',7,7,6),
  'effects/glow-flyline-moves/glow-orb-ambient':spec('标题与两行正文；三团主题光斑漂移后收敛',3,3,8),
  'effects/glow-flyline-moves/orb-flyline-relay':spec('三卡各标题与正文；光斑接力及飞线共振',6,6,6),
  'effects/glow-flyline-moves/flyline-arc':spec('三卡各四字标题与六字正文；人工流程关系的贝塞尔飞线，不代表真实后台事件',6,6,6),
  'interaction/chip-lift-to-user-pill':spec('十二个至多两字名单标签、所选完整人名与结尾短句；选择第六项，绿点为动画验收状态',14,14,10),
  'interaction/collab-cursor-moves/cursor-dialogue-duet':spec('两名实际角色；具名光标交接后巨箭头转场，不执行多人服务',2,2,6),
  'interaction/collab-cursor-moves/cursor-cast-ensemble':spec('五个至多两字角色名、四字标题、六字逐字短句与四个三字便签；人工场景，非在线数据',11,11,6),
  'ui-entrance/svg-shape-morph':spec('两阶段实际语义；抽象装饰轮廓可逆变形，不代表实际产品形状或logo',2,2,8),
  'ui-entrance/value-stagger-gradient':spec('两阶段实际语义；十六根装饰柱的高度色相梯度与中心脉冲，不代表统计值',2,2,8),
  'interaction/canvas-materialize-moves/diagram-cascade-build':spec('输入提示、根节点、两个子节点与各自两叶节点；固定树关系须与业务内容一致',8,8,4),
  'interaction/canvas-materialize-moves/panel-to-canvas-materialize':spec('面板标题、副题、三组标题正文与动作；同一三行内容一一迁移为卡片，不执行持久化',9,9,6),
  'outro/logo-shrink-wordmark-lockup':spec('栏目字标与标语；抽象双弧标记收束，非真实品牌logo',2,2,10),
  'ui-entrance/paper-craft-moves/masking-tape-slap':spec('语境、卡标题与两行正文；双胶带拍定纸面笔记，声音未接入',4,4,6),
  'effects/light-play-moves/spotlight-sweep-reveal':spec('两行真实标题；深底双次聚光摆扫，最后全亮',2,2,8),
  'effects/light-play-moves/sheen-sweep-retry':spec('标题与两行正文；深色主角卡单次扫光',3,3,6),
  'effects/light-play-moves/halation-bloom':spec('语境与标题；撞停后复制文字晕层扩散消散',2,2,6),
  'effects/fui-hud-moves/line-unfold-panel':spec('语境、标题与两行正文；抽线展面后压线卸载',4,4,8),
  'outro/grain-dissolve':spec('整句与其中的短标；砂化后凝聚为同一对象，短标建议最多6字',2,2,10),
  'ui-entrance/draw-svg-trace':spec('语境、标题与两至三行正文；描边闭合交棒再画标题下划线',4,5,8),
  'effects/riso-print-hits/riso-misregistration-hit':spec('单行标题；浅纸底双印版错位后硬套准，需深色surface印版',1,1,6),
  'opening/stroke-segment-build':spec('3至6位大写S H I P字标；断笔乱序后末三段揭晓',1,1,6),
  'effects/icon-performance-moves/pop-burst-confirm':spec('实际确认文案；蓄力、对勾、粒子和环同帧释放，无业务保存操作',1,1,8),
  'effects/icon-performance-moves/attention-bounce':spec('提醒名、面板标题与两行正文；四跳递高后弹出面板',4,4,8),
  'opening/fracture':spec('单行标题；装饰瓦片聚合、停留后飞散退场',1,1,6),
  'outro/neon-triple-marquee':spec('三行实际主题词；对向回绕与轮唱，镜尾淡出',3,3,6),
  'effects/line-boil':spec('语境、主体、两行实际内容；描边抖动后真正静止',4,4,8),
  'interaction/segmented-thumb-hero':spec('两个实际模式名称；点击第二项，滑块严格8帧切换',2,2,6),
  'interaction/picker-carousel-feature-cycle':spec('七项实际功能；前六项依次居中，第七项作为末尾邻项显示',7,7,4),
  'effects/scan-bracket-sweep':spec('文档标题与四项实际检查内容；括号收敛、五趟扫描',5,5,6),
  'interaction/autolayout-gap-dial':spec('标题与五个实际导航名称；读数为布局像素，非业务统计',6,6,6),
  'effects/aurora-bloom-bg-flip':spec('反转前后三词与两词的空格分隔句子；留空档逐词换句',2,2,14),
  'typography/cel-flash-stomp':spec('三个短词依次拍落',3,3,6),
  'typography/blur-slide':spec('主标题与副标题模糊入场',2,2,14),
  'typography/scramble':spec('一次性短句解码',1,1,14),
  'typography/outline-word-fill':spec('轮廓文字填实',1,1,14),
  'typography/lead-word-zoom-assemble':spec('重点词聚焦组装',1,1,14),
  'typography/word-relay-geometry':spec('三组关键词接力',3,3,8),
  'typography/brace-expand':spec('两行观点括号展开',2,2,14),
  'ui-entrance/list-reveal':spec('三项列表逐项显现',3,3,14),
  'typography/paper-title-card':spec('文字逐行压印与单项强调',1,3,10),
  'typography/marker-underline-title':spec('引导语、强调词、副标题；强调词下划线',3,3,8),
  'typography/gradient-word-sweep':spec('第一行关键词充能，其余文字静止',3,3,8),
  'typography/flying-words':spec('8至12个空格分隔的短关键词，作为纵深词云',3,3,14),
  'typography/glitch-cycle':spec('三条长度接近的状态短语依次解码',3,3,8),
  'typography/vertical-word-roll-blur-cycle':spec('第一行为固定句干，其余两行为滚轮对象',3,3,6),
  'typography/type-assembly-moves/split-text-stagger':spec('单行标题逐字裂升',1,1,12),
  'typography/type-assembly-moves/letterform-drift-assembly':spec('单行标题漂移合拢',1,1,12),
  'typography/type-assembly-moves/tracking-expand-reveal':spec('单行标题字距呼吸展开',1,1,12),
  'typography/type-assembly-moves/text-on-path':spec('单行标题沿上升曲线流入',1,1,10),
  'typography/type-entrance-moves/letter-drop-physics':spec('单行标题逐字坠落弹跳归位',1,1,12),
  'typography/type-entrance-moves/scramble-decode':spec('单行标题逐字解码锁定',1,1,12),
  'typography/typewriter-moves/terminal-typewriter':spec('操作命令打字后急推，切出到实际背景素材',1,1,16),
  'typography/typewriter-moves/typewriter-error-retype':spec('第一行原说法退格删除，第二行改写后保留',2,2,12),
  'typography/pill-chip-slot-cycle-handled':spec('句首、四个胶囊短词、句尾；三次宽度挤开滚轮',6,6,4),
  'typography/pill-slot-cycle':spec('句干、四个轮换项、收束短语',6,6,6),
  'typography/split-flap-title':spec('单行机场翻牌标题，逐字三次翻转落定',1,1,10),
  'typography/title-demote-to-label':spec('第一行章标题降格为标签，后两行正文错峰生长',3,3,12),
  'opening/brand-ink-open':spec('品牌名与副标逐字压印；完整停留后于镜尾退场',2,2,12),
  'typography/countdown-arc-scatter':spec('正整数、时间单位、动作；首数是真实承诺，其余扫盘数字为装饰量程',3,3,3),
  'typography/text-column-converge':spec('固定句首、四个轮换项含最终揭晓、收尾副标',6,6,6),
  'ui-entrance/list-stack-press':spec('五项实际清单逐张飞入压栈；计数表示已落地清单项数',5,5,6),
  'ui-entrance/morph-from-primitive':spec('业务标题与两行正文；正圆呼吸后长为文字卡轮廓',3,3,8),
  'ui-entrance/neon-frame-forerun':spec('标题与五项业务模块；描框后错峰带影贴落',6,6,6),
  'ui-entrance/neon-frame-orbit-drop':spec('标题与五项业务模块；全部同帧贴落并由左绕向右',6,6,6),
  'ui-entrance/cloner-depth-echo':spec('标题、同一业务卡的名称与说明；副本排开后合并，不代表统计数量',3,3,8),
  'ui-entrance/skeleton-reveal':spec('标题与四项实际信息；涂鸦变骨架后显影，无虚构人名或时间',5,5,6),
  'typography/typing-code-block':spec('变量名、整数值、函数名；生成赋值与调用片段，不接收任意代码或执行代码',3,3,6),
  'ui-entrance/radial-wave':spec('主题标题与收束语；点阵是装饰扩散波，不代表真实统计或地图',2,2,8),
  'ui-entrance/element-body-moves/axial-stretch':spec('标题与三项实际内容；独立轴向拉伸错峰回弹',4,4,6),
  'ui-entrance/element-body-moves/contact-shadow-lift':spec('标题与三项实际内容；独立接触阴影与抬升点名',4,4,6),
  'ui-entrance/platform-hinge-rise':spec('语境、左右主体、结论；保持反向铰点翻起与结论升台',4,4,6),
  'interaction/glass-pill-dictation-typing':spec('单行真实输入；固定宽度胶囊、先行光标与声波呼吸',1,1,10),
  'interaction/hashtag-to-pill-materialize':spec('标签最多4字、标题最多8字、两行正文；两次硬切与一次缩小滑动',4,4,10),
  'interaction/command-palette-summon':spec('两字符查询词与五个候选名称；按实际包含关系收窄，必须至少一项完整匹配',6,6,6),
  'interaction/chip-grid-single-select-blackout':spec('标题、五个实际选项、结果说明；固定选择第一项，灰闪反黑后居中',7,7,6),
  'opening/letterspace-materialize':spec('1至10位品牌字标，仅支持大写S U P E R H M A N；全字同帧描画',1,1,10),
  'effects/assemble-then-type-flyin':spec('两行主标题、品牌、模块名称、动作、收束语；骨架飞入后逐字3D旋转落位',6,6,6),
});

export function validateTextCardLines(id,lines){
  const contract=TEXT_CARD_CONTRACTS[id];
  if(!contract) return lines;
  if(!Array.isArray(lines)||lines.length<contract.minLines||lines.length>contract.maxLines||
    lines.some(line=>typeof line!=='string'||!line.trim()||/[\r\n]/.test(line)||[...line].length>contract.maxChars)||
    lines.join('').length>contract.maxTotalChars) throw new Error(`文字卡 ${id} 输入超出容量；禁止裁字或丢行`);
  if(id==='typography/flying-words'){
    const words=lines.flatMap(line=>line.trim().split(/\s+/));
    if(words.length<8||words.length>12||words.some(word=>[...word].length>4)) throw new Error('飞词需要8至12个短关键词，每词最多4字');
  }
  if(id==='typography/countdown-arc-scatter' && (!/^[1-9]\d?$/.test(lines[0]) || lines.slice(1).join('').length>5))
    throw new Error('倒计时需要1至99的整数，单位与动作合计最多5字');
  return lines;
}

export function assertTextCardDuration(id,frames){
  const contract=TEXT_CARD_CONTRACTS[id];
  if(contract&&!contract.acceptedFrames.includes(frames)) throw new Error(`文字卡 ${id} 当前长版只验收${contract.acceptedFrames.join('/')}帧/30fps`);
}
