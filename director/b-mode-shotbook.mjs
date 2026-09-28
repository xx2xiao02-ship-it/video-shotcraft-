import {annotateScenes} from './b-mode-semantic-annotate.mjs';

const CARD_POOLS = {
  person: [
    'typography/blur-slide',
    'typography/flying-words',
    'typography/typewriter-moves/terminal-typewriter',
    'typography/marker-underline-title',
  ],
  graphics: [
    'ui-entrance/list-reveal',
    'ui-entrance/list-stack-press',
    'ui-entrance/bezier-source-converge-merge',
    'ui-entrance/neon-frame-forerun',
    'typography/type-entrance-moves/scramble-decode',
    'typography/type-assembly-moves/text-on-path',
  ],
  material: [],
};

const LAYOUTS = {
  person: ['avatar-right-copy', 'avatar-left-copy', 'avatar-chip-right'],
  graphics: ['full-copy-left', 'three-line-hero', 'diagram-copy-split'],
  material: ['broll-full-bleed', 'broll-panel-right', 'broll-panel-left'],
};

const uniqueRecent = (values, candidate) => !values.slice(-2).includes(candidate);

export function buildShotbook(scenes, propsStoryboard) {
  const semantics = annotateScenes(scenes);
  const recentCards = [];
  const recentLayouts = [];
  const shots = scenes.map((scene, index) => {
    const semantic = semantics[index];
    const base = propsStoryboard?.shots?.[index] || {};
    const pool = CARD_POOLS[scene.subject] || [];
    const candidates = [base.shotCard, ...pool].filter(Boolean);
    const card = scene.subject === 'material'
      ? null
      : candidates.find(candidate => uniqueRecent(recentCards, candidate)) || candidates[0] || null;
    const layoutPool = LAYOUTS[scene.subject] || LAYOUTS.graphics;
    const layout = layoutPool.find(candidate => uniqueRecent(recentLayouts, candidate)) || layoutPool[0];
    if (card) recentCards.push(card);
    recentLayouts.push(layout);
    return {
      sceneId: `s-${String(index + 1).padStart(2, '0')}`,
      index,
      text: scene.text,
      visualText: scene.visualText || '',
      subtitle: scene.subtitle || '',
      subject: scene.subject,
      fromFrame: scene.fromFrame,
      durationInFrames: scene.durationInFrames,
      material: scene.videoPath || null,
      semantic,
      primaryVisualJob: semantic.intent,
      materialMode: scene.subject === 'material' ? 'broll' : scene.subject === 'person' ? 'avatar-plus-broll' : 'card-plus-broll',
      cardCandidates: candidates,
      selectedCard: card,
      layoutVariant: layout,
      transition: index === 0 ? 'opening' : semantic.l1 === 'cta' ? 'settle' : 'cut-on-sentence',
      holdFrames: semantic.weight === 'main' ? 18 : 12,
      rationale: `${semantic.l1}/${semantic.l2} · ${semantic.intent} · ${layout}${card ? ` · ${card}` : ' · 素材承载'}`,
    };
  });
  return {version:1, mode:'B-talkcraft-incremental', fps:30, semantics, shots,
    cardsUsed:shots.map(shot => shot.selectedCard).filter(Boolean),
    cardsUnique:[...new Set(shots.map(shot => shot.selectedCard).filter(Boolean))],
    layouts:shots.map(shot => shot.layoutVariant),
  };
}
