import React from 'react';
import { AbsoluteFill, Series } from 'remotion';

// 短时长模板预览（每个展示 3 秒 = 90 帧）
import { GradientWordSweep } from '../../demos/typography/gradient-word-sweep/GradientWordSweep';
import { MarkerUnderlineTitle } from '../../demos/typography/marker-underline-title/MarkerUnderlineTitle';
import { PaperTitleCard } from '../../demos/typography/paper-title-card/PaperTitleCard';
import { TrackingExpandReveal } from '../../demos/typography/type-assembly-moves/TrackingExpandReveal';
import { ConfettiCrossfire } from '../../demos/data/particle-celebrate-hits/ConfettiCrossfire';
import { NeedleSweepSelftest } from '../../demos/data/gauge-readout-moves/NeedleSweepSelftest';
import { CrashImpactReal } from '../../demos/camera/crash-zoom-punch/CrashImpactReal';
import { CrashZoomReal } from '../../demos/camera/crash-zoom-punch/CrashZoomReal';
import { DocumentTypewriterReveal } from '../../demos/ui-entrance/document-typewriter-reveal/DocumentTypewriterReveal';
import { AutolayoutGapDial } from '../../demos/interaction/autolayout-gap-dial/AutolayoutGapDial';
import { RisoMisregistrationHit } from '../../demos/effects/riso-print-hits/RisoMisregistrationHit';
import { ScoreSlam } from '../../demos/effects/slam-entrance-moves/ScoreSlam';
import { KanadaPerspectiveSnap } from '../../demos/effects/slam-entrance-moves/KanadaPerspectiveSnap';
import { JumpCutPunchIn } from '../../demos/rhythm/rhythm-interrupt-moves/JumpCutPunchIn';
import { SpectrumMorphUi } from '../../demos/rhythm/spectrum-morph-ui/SpectrumMorphUi';
import { AxialStretch } from '../../demos/ui-entrance/element-body-moves/AxialStretch';

const DUR = 90; // 每个模板 3 秒

const items: { name: string; Comp: React.FC; dur: string }[] = [
  { name: 'gradient-word-sweep', Comp: GradientWordSweep, dur: '0.4s' },
  { name: 'marker-underline-title', Comp: MarkerUnderlineTitle, dur: '1.4s' },
  { name: 'paper-title-card', Comp: PaperTitleCard, dur: '1.1s' },
  { name: 'breathe (tracking-expand)', Comp: TrackingExpandReveal, dur: '1.9s' },
  { name: 'confetti-crossfire', Comp: ConfettiCrossfire, dur: '0.5s' },
  { name: 'needle-sweep', Comp: NeedleSweepSelftest, dur: '0.7s' },
  { name: 'crash-impact', Comp: CrashImpactReal, dur: '1.3s' },
  { name: 'crash-zoom', Comp: CrashZoomReal, dur: '1.6s' },
  { name: 'document-typewriter', Comp: DocumentTypewriterReveal, dur: '0.5s' },
  { name: 'autolayout-gap-dial', Comp: AutolayoutGapDial, dur: '0.5s' },
  { name: 'riso-misregistration', Comp: RisoMisregistrationHit, dur: '0.7s' },
  { name: 'score-slam', Comp: ScoreSlam, dur: '0.4s' },
  { name: 'kanada-perspective', Comp: KanadaPerspectiveSnap, dur: '0.7s' },
  { name: 'jump-cut-punch-in', Comp: JumpCutPunchIn, dur: '1.4s' },
  { name: 'spectrum-morph-ui', Comp: SpectrumMorphUi, dur: '0.3s' },
  { name: 'axial-stretch', Comp: AxialStretch, dur: '0.3s' },
];

export const PREVIEW_TOTAL = items.length * DUR;

export const PreviewGallery: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: '#0d0f14' }}>
      <Series>
        {items.map((item, i) => (
          <Series.Sequence key={i} durationInFrames={DUR}>
            <item.Comp />
            {/* 角标：模板名 */}
            <div style={{
              position: 'absolute', bottom: 20, left: 20,
              background: 'rgba(0,0,0,0.7)', color: '#4ecdc4',
              fontFamily: 'monospace', fontSize: 20, padding: '6px 14px', borderRadius: 6,
            }}>
              {item.name} · {item.dur}
            </div>
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
