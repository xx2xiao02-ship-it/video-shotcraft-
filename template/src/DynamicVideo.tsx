import React from 'react';
import { translateShot, splitToWords, hasContract } from './TemplateAdapter';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Sequence,
  Audio,
  OffthreadVideo,
  staticFile,
} from 'remotion';

// ---------- 镜头卡组件注册表 ----------
// 路径对应 storyboard.shots[].shotCard（如 "typography/cel-flash-stomp"）
import { CelFlashStomp } from '../../demos/typography/cel-flash-stomp/CelFlashStomp';
import { BlurSlide } from '../../demos/typography/blur-slide/BlurSlide';
import { FlyingWords } from '../../demos/typography/flying-words/FlyingWords';
import { CountdownArcScatter } from '../../demos/typography/countdown-arc-scatter/CountdownArcScatter';
import { GradientWordSweep } from '../../demos/typography/gradient-word-sweep/GradientWordSweep';
import { LeadWordZoomAssemble } from '../../demos/typography/lead-word-zoom-assemble/LeadWordZoomAssemble';
import { MarkerUnderlineTitle } from '../../demos/typography/marker-underline-title/MarkerUnderlineTitle';
import { OutlineWordFill } from '../../demos/typography/outline-word-fill/OutlineWordFill';
import { PaperTitleCard } from '../../demos/typography/paper-title-card/PaperTitleCard';
import { PillSlotCycle } from '../../demos/typography/pill-slot-cycle/PillSlotCycle';
import { Scramble } from '../../demos/typography/scramble/Scramble';
import { SplitFlapFlip } from '../../demos/typography/split-flap-title/SplitFlapFlip';
import { TextColumnConverge } from '../../demos/typography/text-column-converge/TextColumnConverge';
import { TitleDemoteToLabel } from '../../demos/typography/title-demote-to-label/TitleDemoteToLabel';
import { LetterformDriftAssembly } from '../../demos/typography/type-assembly-moves/LetterformDriftAssembly';
import { SplitTextStagger } from '../../demos/typography/type-assembly-moves/SplitTextStagger';
import { TextOnPath } from '../../demos/typography/type-assembly-moves/TextOnPath';
import { TrackingExpandReveal } from '../../demos/typography/type-assembly-moves/TrackingExpandReveal';
import { LetterDropPhysics } from '../../demos/typography/type-entrance-moves/LetterDropPhysics';
import { ScrambleDecode } from '../../demos/typography/type-entrance-moves/ScrambleDecode';
import { FontWeightPump } from '../../demos/typography/type-rhythm-sync/FontWeightPump';
import { KaraokeFillSync } from '../../demos/typography/type-rhythm-sync/KaraokeFillSync';
import { TerminalTypewriter } from '../../demos/typography/typewriter-moves/TerminalTypewriter';
import { TypewriterErrorRetype } from '../../demos/typography/typewriter-moves/TypewriterErrorRetype';
import { TypingCodeBlock } from '../../demos/typography/typing-code-block/TypingCodeBlock';
import { VerticalWordRollBlurCycle } from '../../demos/typography/vertical-word-roll-blur-cycle/VerticalWordRollBlurCycle';
import { WordRelayFilmstrip } from '../../demos/typography/word-relay-filmstrip/WordRelayFilmstrip';
import { WordRelayGeometry } from '../../demos/typography/word-relay-geometry/WordRelayGeometry';
import { BraceExpand } from '../../demos/typography/brace-expand/BraceExpand';
import { BrandInkOpen } from '../../demos/typography/brand-ink-open/BrandInkOpen';
import { GlitchCycle } from '../../demos/typography/glitch-cycle/GlitchCycle';

// camera
import { CrashImpactReal } from '../../demos/camera/crash-zoom-punch/CrashImpactReal';
import { CrashZoomReal } from '../../demos/camera/crash-zoom-punch/CrashZoomReal';
import { CursorFlyover } from '../../demos/camera/cursor-flyover/CursorFlyover';
import { DollyZoomReal } from '../../demos/camera/depth-layer-moves/DollyZoomReal';
import { MultiplaneReal } from '../../demos/camera/depth-layer-moves/MultiplaneReal';
import { GrazeFaceTour } from '../../demos/camera/graze-face-tour/GrazeFaceTour';
import { OverheadTabletopDrop } from '../../demos/camera/overhead-camera-moves/OverheadTabletopDrop';
import { TiltReveal } from '../../demos/camera/overhead-camera-moves/TiltReveal';
import { DroneDiveLanding } from '../../demos/camera/space-camera-moves/DroneDiveLanding';
import { ExplodedView } from '../../demos/camera/space-camera-moves/ExplodedView';
import { SteepTiltGlide } from '../../demos/camera/steep-tilt-glide/SteepTiltGlide';
import { BulletTimeFreezeOrbit } from '../../demos/camera/tension-camera-moves/BulletTimeFreezeOrbit';
import { DutchRollToLevel } from '../../demos/camera/tension-camera-moves/DutchRollToLevel';
import { PullBackIsolation } from '../../demos/camera/tension-camera-moves/PullBackIsolation';
import { SlowPushIn } from '../../demos/camera/tension-camera-moves/SlowPushIn';
import { Terminal3D } from '../../demos/camera/terminal-3d/Terminal3D';
import { Basic3DScene } from '../../demos/camera/basic-3d-scene/Basic3DScene';

// data
import { AvatarGridRadialBuildColorize } from '../../demos/data/avatar-grid-radial-build-colorize/AvatarGridRadialBuildColorize';
import { BeforeAfterSliderScrub } from '../../demos/data/before-after-slider-scrub/BeforeAfterSliderScrub';
import { AxisRescaleShockV2 } from '../../demos/data/chart-live-moves/AxisRescaleShockV2';
import { OscilloscopeStreamV2 } from '../../demos/data/chart-live-moves/OscilloscopeStreamV2';
import { UnitDotSwarmRegroupV2 } from '../../demos/data/chart-live-moves/UnitDotSwarmRegroupV2';
import { CounterConfetti } from '../../demos/data/counter-confetti/CounterConfetti';
import { CycleGlassNodeMorph } from '../../demos/data/cycle-glass-node-morph/CycleGlassNodeMorph';
import { NeedleSweepSelftest } from '../../demos/data/gauge-readout-moves/NeedleSweepSelftest';
import { TapeScrollFixedPointer } from '../../demos/data/gauge-readout-moves/TapeScrollFixedPointer';
import { HatchDepth } from '../../demos/data/hatch-depth/HatchDepth';
import { OdometerDigitRoll } from '../../demos/data/odometer-digit-roll/OdometerDigitRoll';
import { ConfettiCrossfire } from '../../demos/data/particle-celebrate-hits/ConfettiCrossfire';
import { CounterTickSparks } from '../../demos/data/particle-celebrate-hits/CounterTickSparks';
import { ParticleSandFill } from '../../demos/data/particle-sand-fill/ParticleSandFill';
import { RingDiagramAnnotationReveal } from '../../demos/data/ring-diagram-annotation-reveal/RingDiagramAnnotationReveal';
import { BrakeReticleLock } from '../../demos/data/scroll-brake-moves/BrakeReticleLock';
import { ChangelogScrollBrake } from '../../demos/data/scroll-brake-moves/ChangelogScrollBrake';
import { TimelineTravel } from '../../demos/data/timeline-travel/TimelineTravel';

// opening
import { CraneRiseReveal } from '../../demos/opening/crane-rise-reveal/CraneRiseReveal';
import { DatavizLandscapeOpen } from '../../demos/opening/dataviz-landscape-open/DatavizLandscapeOpen';
import { Fracture } from '../../demos/opening/fracture/Fracture';
import { IconFieldColorize } from '../../demos/opening/icon-field-colorize/IconFieldColorize';
import { LetterspaceMaterialize } from '../../demos/opening/letterspace-materialize/LetterspaceMaterialize';
import { MagicianCardFlourish } from '../../demos/opening/magician-card-flourish/MagicianCardFlourish';
import { OrbitRingTitleOpen } from '../../demos/opening/orbit-ring-title-open/OrbitRingTitleOpen';
import { SpotlightHeroCard } from '../../demos/opening/spotlight-hero-card/SpotlightHeroCard';
import { StrokeSegmentBuild } from '../../demos/opening/stroke-segment-build/StrokeSegmentBuild';
import { TextAsMask } from '../../demos/opening/text-as-mask/TextAsMask';

// outro
import { LogoStingButton } from '../../demos/outro/edit-hook-moves/LogoStingButton';
import { GrainDissolve } from '../../demos/outro/grain-dissolve/GrainDissolve';
import { LogoShrinkWordmarkLockup } from '../../demos/outro/logo-shrink-wordmark-lockup/LogoShrinkWordmarkLockup';
import { NeonTripleMarquee } from '../../demos/outro/neon-triple-marquee/NeonTripleMarquee';
import { OutroGroupPhotoLaunch } from '../../demos/outro/outro-group-photo-launch/OutroGroupPhotoLaunch';
import { UiStripAwayOutro } from '../../demos/outro/ui-strip-away-outro/UiStripAwayOutro';
import { IconFlipBloomLogo } from '../../demos/outro/ui-to-brand-morph/IconFlipBloomLogo';
import { InputMorphsIntoLogo } from '../../demos/outro/ui-to-brand-morph/InputMorphsIntoLogo';

// transition
import { BottomPushStackWipe } from '../../demos/transition/bottom-push-stack-wipe/BottomPushStackWipe';
import { BubbleSwarmTakeover } from '../../demos/transition/bubble-swarm-takeover/BubbleSwarmTakeover';
import { CardFlipReveal } from '../../demos/transition/card-flip-reveal/CardFlipReveal';
import { CardFlockTumble } from '../../demos/transition/card-flock-tumble/CardFlockTumble';
import { CircleMatchIris } from '../../demos/transition/circle-match-iris/CircleMatchIris';
import { ColorBlockStepWipe } from '../../demos/transition/color-block-step-wipe/ColorBlockStepWipe';
import { CubeNavigation } from '../../demos/transition/cube-navigation/CubeNavigation';
import { GradientTransition } from '../../demos/transition/gradient-transition/GradientTransition';
import { LineCarryTransition } from '../../demos/transition/line-carry-transition/LineCarryTransition';
import { MosaicReframe } from '../../demos/transition/mosaic-reframe/MosaicReframe';
import { BarnDoorSplit } from '../../demos/transition/page-turn-transitions/BarnDoorSplit';
import { CubeRotate } from '../../demos/transition/page-turn-transitions/CubeRotate';
import { PaperPlaneMessenger } from '../../demos/transition/paper-plane-messenger/PaperPlaneMessenger';
import { InkBleedReveal } from '../../demos/transition/print-texture-transitions/InkBleedReveal';
import { BlackCardTransition } from '../../demos/transition/shot-transitions/BlackCardTransition';
import { DarkTunnelTransition } from '../../demos/transition/shot-transitions/DarkTunnelTransition';
import { FocusHandoffTransition } from '../../demos/transition/shot-transitions/FocusHandoffTransition';
import { MaskWipeReal } from '../../demos/transition/shot-transitions/MaskWipeReal';
import { PortalWipeV2 } from '../../demos/transition/shot-transitions/PortalWipeV2';
import { WhipBrakeReal } from '../../demos/transition/shot-transitions/WhipBrakeReal';
import { WhipPanReal } from '../../demos/transition/shot-transitions/WhipPanReal';
import { GlitchDisplace } from '../../demos/transition/tear-streak-transitions/GlitchDisplace';
import { InvisibleCut } from '../../demos/transition/transition-hidden-cut/InvisibleCut';
import { LightLeakBurn } from '../../demos/transition/transition-hidden-cut/LightLeakBurn';
import { VersusSlam } from '../../demos/transition/transition-hidden-cut/VersusSlam';
import { LetterformZoom } from '../../demos/transition/transition-travel/LetterformZoom';
import { SharedElementMorph } from '../../demos/transition/transition-travel/SharedElementMorph';
import { WhiteFlashLogoSimplifyCut } from '../../demos/transition/white-flash-logo-simplify-cut/WhiteFlashLogoSimplifyCut';
import { BlindsSlice } from '../../demos/transition/wipe-transitions/BlindsSlice';
import { ClockWipe } from '../../demos/transition/wipe-transitions/ClockWipe';

// rhythm
import { BeatCutAccelerando } from '../../demos/rhythm/beat-cut-moves/BeatCutAccelerando';
import { PaparazziFlash } from '../../demos/rhythm/beat-cut-moves/PaparazziFlash';
import { BeatStepListThemeCycle } from '../../demos/rhythm/beat-step-list-theme-cycle/BeatStepListThemeCycle';
import { DominoCascade } from '../../demos/rhythm/montage-rhythm-moves/DominoCascade';
import { DropBlackoutSlam } from '../../demos/rhythm/montage-rhythm-moves/DropBlackoutSlam';
import { WrightTripleCut } from '../../demos/rhythm/montage-rhythm-moves/WrightTripleCut';
import { ComicPanelSplit } from '../../demos/rhythm/panel-grid-moves/ComicPanelSplit';
import { FlipGridReflow } from '../../demos/rhythm/panel-grid-moves/FlipGridReflow';
import { GridFlashMosaic } from '../../demos/rhythm/panel-grid-moves/GridFlashMosaic';
import { QuadSplitParallelScenes } from '../../demos/rhythm/quad-split-parallel-scenes/QuadSplitParallelScenes';
import { JumpCutPunchIn } from '../../demos/rhythm/rhythm-interrupt-moves/JumpCutPunchIn';
import { StrobeBlackFrames } from '../../demos/rhythm/rhythm-interrupt-moves/StrobeBlackFrames';
import { SakugaTimingShift } from '../../demos/rhythm/sakuga-timing-shift/SakugaTimingShift';
import { SmearMultiples } from '../../demos/rhythm/smear-multiples/SmearMultiples';
import { SpectrumMorphUi } from '../../demos/rhythm/spectrum-morph-ui/SpectrumMorphUi';
import { FreezeAnnotateReal } from '../../demos/rhythm/speed-ramp-freeze/FreezeAnnotateReal';
import { SpeedRampReal } from '../../demos/rhythm/speed-ramp-freeze/SpeedRampReal';
import { CardFootageCadence } from '../../demos/rhythm/trailer-grammar-moves/CardFootageCadence';
import { SmashCut } from '../../demos/rhythm/trailer-grammar-moves/SmashCut';
import { TrailerBumper } from '../../demos/rhythm/trailer-grammar-moves/TrailerBumper';

// ui-entrance
import { AvatarBracketCarousel } from '../../demos/ui-entrance/avatar-bracket-carousel/AvatarBracketCarousel';
import { BezierSourceConvergeMerge } from '../../demos/ui-entrance/bezier-source-converge-merge/BezierSourceConvergeMerge';
import { CardStack } from '../../demos/ui-entrance/card-stack/CardStack';
import { Carousel3D } from '../../demos/ui-entrance/carousel-3d/Carousel3D';
import { ClipCardLooping } from '../../demos/ui-entrance/clipcard-looping/ClipCardLooping';
import { ClonerDepthEcho } from '../../demos/ui-entrance/cloner-depth-echo/ClonerDepthEcho';
import { DeckDealFlyin } from '../../demos/ui-entrance/deck-deal-flyin/DeckDealFlyin';
import { DocParkLeftPillDeal } from '../../demos/ui-entrance/doc-park-left-pill-deal/DocParkLeftPillDeal';
import { DocumentTypewriterReveal } from '../../demos/ui-entrance/document-typewriter-reveal/DocumentTypewriterReveal';
import { DrawSvgTrace } from '../../demos/ui-entrance/draw-svg-trace/DrawSvgTrace';
import { AxialStretch } from '../../demos/ui-entrance/element-body-moves/AxialStretch';
import { ContactShadowLift } from '../../demos/ui-entrance/element-body-moves/ContactShadowLift';
import { FloatingGlossyLabelPills } from '../../demos/ui-entrance/floating-glossy-label-pills/FloatingGlossyLabelPills';
import { IntegrationHubMap } from '../../demos/ui-entrance/integration-hub-map/IntegrationHubMap';
import { ListReveal } from '../../demos/ui-entrance/list-reveal/ListReveal';
import { ListStackPress } from '../../demos/ui-entrance/list-stack-press/ListStackPress';
import { MorphFromPrimitive } from '../../demos/ui-entrance/morph-from-primitive/MorphFromPrimitive';
import { NeonFrameForerun } from '../../demos/ui-entrance/neon-frame-forerun/NeonFrameForerun';
import { NeonFrameForerunOrbit } from '../../demos/ui-entrance/neon-frame-orbit-drop/NeonFrameForerunOrbit';
import { PageWaterfallWall } from '../../demos/ui-entrance/page-waterfall-wall/PageWaterfallWall';
import { VerticalTicker } from '../../demos/ui-entrance/page-waterfall-wall/VerticalTicker';
import { MaskingTapeSlap } from '../../demos/ui-entrance/paper-craft-moves/MaskingTapeSlap';
import { PopupBookRise } from '../../demos/ui-entrance/paper-craft-moves/PopupBookRise';
import { PlatformHingeRise } from '../../demos/ui-entrance/platform-hinge-rise/PlatformHingeRise';
import { ProductCardProgressiveAssemble } from '../../demos/ui-entrance/product-card-progressive-assemble/ProductCardProgressiveAssemble';
import { RadialWave } from '../../demos/ui-entrance/radial-wave/RadialWave';
import { ResearchCardStackScroll } from '../../demos/ui-entrance/research-card-stack-scroll/ResearchCardStackScroll';
import { RowEmbed } from '../../demos/ui-entrance/row-embed/RowEmbed';
import { RunwayGroundSkim } from '../../demos/ui-entrance/runway-ground-skim/RunwayGroundSkim';
import { SkeletonReveal } from '../../demos/ui-entrance/skeleton-reveal/SkeletonReveal';
import { SvgShapeMorph } from '../../demos/ui-entrance/svg-shape-morph/SvgShapeMorph';
import { ValueStaggerGradient } from '../../demos/ui-entrance/value-stagger-gradient/ValueStaggerGradient';
import { BentoLightUp } from '../../demos/ui-entrance/wall-reveal-moves/BentoLightUp';
import { GridWaveFlip } from '../../demos/ui-entrance/wall-reveal-moves/GridWaveFlip';
import { WireframeDrawOn } from '../../demos/ui-entrance/wall-reveal-moves/WireframeDrawOn';

// interaction
import { StreamResponse } from '../../demos/interaction/ai-stream-response/StreamResponse';
import { AutolayoutGapDial } from '../../demos/interaction/autolayout-gap-dial/AutolayoutGapDial';
import { DiagramCascadeBuild } from '../../demos/interaction/canvas-materialize-moves/DiagramCascadeBuild';
import { PanelToCanvasMaterialize } from '../../demos/interaction/canvas-materialize-moves/PanelToCanvasMaterialize';
import { ChipGridSingleSelectBlackout } from '../../demos/interaction/chip-grid-single-select-blackout/ChipGridSingleSelectBlackout';
import { ChipLiftToUserPill } from '../../demos/interaction/chip-lift-to-user-pill/ChipLiftToUserPill';
import { CursorCastEnsemble } from '../../demos/interaction/collab-cursor-moves/CursorCastEnsemble';
import { CursorDialogueDuet } from '../../demos/interaction/collab-cursor-moves/CursorDialogueDuet';
import { CommandPaletteSummon } from '../../demos/interaction/command-palette-summon/CommandPaletteSummon';
import { GlassPillDictationTyping } from '../../demos/interaction/glass-pill-dictation-typing/GlassPillDictationTyping';
import { HashtagToPillMaterialize } from '../../demos/interaction/hashtag-to-pill-materialize/HashtagToPillMaterialize';
import { CursorPerformancePunchIn } from '../../demos/interaction/input-trigger-moves/CursorPerformancePunchIn';
import { KeycapSmashCut } from '../../demos/interaction/input-trigger-moves/KeycapSmashCut';
import { PickerCarouselFeatureCycle } from '../../demos/interaction/picker-carousel-feature-cycle/PickerCarouselFeatureCycle';
import { SegmentedThumbHero } from '../../demos/interaction/segmented-thumb-hero/SegmentedThumbHero';
import { PaletteThemeRipple } from '../../demos/interaction/theme-switch-moves/PaletteThemeRipple';
import { ThemeSweepToggle } from '../../demos/interaction/theme-switch-moves/ThemeSweepToggle';
import { TypeAndFilter } from '../../demos/interaction/type-and-filter/TypeAndFilter';
import { VoiceWaveformLive } from '../../demos/interaction/voice-waveform-live/VoiceWaveformLive';

// effects
import { AssembleThenTypeFlyin } from '../../demos/effects/assemble-then-type-flyin/AssembleThenTypeFlyin';
import { AuroraBloomBgFlip } from '../../demos/effects/aurora-bloom-bg-flip/AuroraBloomBgFlip';
import { BrandFrameSnap } from '../../demos/effects/brand-frame-snap/BrandFrameSnap';
import { DashboardGlowHighlightPill } from '../../demos/effects/dashboard-glow-highlight-pill/DashboardGlowHighlightPill';
import { LineUnfoldPanel } from '../../demos/effects/fui-hud-moves/LineUnfoldPanel';
import { ReticleLockOn } from '../../demos/effects/fui-hud-moves/ReticleLockOn';
import { FlylineArc } from '../../demos/effects/glow-flyline-moves/FlylineArc';
import { GlowOrbAmbient } from '../../demos/effects/glow-flyline-moves/GlowOrbAmbient';
import { OrbFlylineRelay } from '../../demos/effects/glow-flyline-moves/OrbFlylineRelay';
import { AttentionBounce } from '../../demos/effects/icon-performance-moves/AttentionBounce';
import { PopBurstConfirm } from '../../demos/effects/icon-performance-moves/PopBurstConfirm';
import { AnimeImpact } from '../../demos/effects/impact-feedback/AnimeImpact';
import { HitCounter } from '../../demos/effects/impact-feedback/HitCounter';
import { HalationBloom } from '../../demos/effects/light-play-moves/HalationBloom';
import { SheenSweepRetry } from '../../demos/effects/light-play-moves/SheenSweepRetry';
import { SpotlightSweepReveal } from '../../demos/effects/light-play-moves/SpotlightSweepReveal';
import { LineBoil } from '../../demos/effects/line-boil/LineBoil';
import { RadialRipplePhoneChips } from '../../demos/effects/radial-ripple-phone-chips/RadialRipplePhoneChips';
import { RisoBeatPump } from '../../demos/effects/riso-print-hits/RisoBeatPump';
import { RisoMisregistrationHit } from '../../demos/effects/riso-print-hits/RisoMisregistrationHit';
import { ScanBracketSweep } from '../../demos/effects/scan-bracket-sweep/ScanBracketSweep';
import { ScanlineAnnotateFocus } from '../../demos/effects/scanline-annotate-focus/ScanlineAnnotateFocus';
import { ScanlineAssembleFlyin } from '../../demos/effects/scanline-assemble-flyin/ScanlineAssembleFlyin';
import { ImpactBurstKit } from '../../demos/effects/slam-entrance-moves/ImpactBurstKit';
import { KanadaPerspectiveSnap } from '../../demos/effects/slam-entrance-moves/KanadaPerspectiveSnap';
import { ScoreSlam } from '../../demos/effects/slam-entrance-moves/ScoreSlam';
import { CornerSpotlightReveal } from '../../demos/effects/spotlight-sweep-moves/CornerSpotlightReveal';
import { GlowWakeSleepPanel } from '../../demos/effects/spotlight-sweep-moves/GlowWakeSleepPanel';
import { SlideSpotlightPan } from '../../demos/effects/spotlight-sweep-moves/SlideSpotlightPan';

// ---------- 注册表 ----------
const COMPONENT_MAP: Record<string, React.ComponentType> = {
  // typography
  'typography/cel-flash-stomp': CelFlashStomp,
  'typography/blur-slide': BlurSlide,
  'typography/flying-words': FlyingWords,
  'typography/countdown-arc-scatter': CountdownArcScatter,
  'typography/gradient-word-sweep': GradientWordSweep,
  'typography/lead-word-zoom-assemble': LeadWordZoomAssemble,
  'typography/marker-underline-title': MarkerUnderlineTitle,
  'typography/outline-word-fill': OutlineWordFill,
  'typography/paper-title-card': PaperTitleCard,
  'typography/pill-slot-cycle': PillSlotCycle,
  'typography/scramble': Scramble,
  'typography/split-flap-title': SplitFlapFlip,
  'typography/text-column-converge': TextColumnConverge,
  'typography/title-demote-to-label': TitleDemoteToLabel,
  'typography/type-assembly-moves/letterform-drift-assembly': LetterformDriftAssembly,
  'typography/type-assembly-moves/split-text-stagger': SplitTextStagger,
  'typography/type-assembly-moves/text-on-path': TextOnPath,
  'typography/type-assembly-moves/tracking-expand-reveal': TrackingExpandReveal,
  'typography/type-entrance-moves/letter-drop-physics': LetterDropPhysics,
  'typography/type-entrance-moves/scramble-decode': ScrambleDecode,
  'typography/type-rhythm-sync/font-weight-pump': FontWeightPump,
  'typography/type-rhythm-sync/karaoke-fill-sync': KaraokeFillSync,
  'typography/typewriter-moves/terminal-typewriter': TerminalTypewriter,
  'typography/typewriter-moves/typewriter-error-retype': TypewriterErrorRetype,
  'typography/typing-code-block': TypingCodeBlock,
  'typography/vertical-word-roll-blur-cycle': VerticalWordRollBlurCycle,
  'typography/word-relay-filmstrip': WordRelayFilmstrip,
  'typography/word-relay-geometry': WordRelayGeometry,
  'typography/brace-expand': BraceExpand,
  'typography/brand-ink-open': BrandInkOpen,
  'typography/glitch-cycle': GlitchCycle,
  // camera
  'camera/crash-zoom-punch/crash-impact': CrashImpactReal,
  'camera/crash-zoom-punch/crash-zoom': CrashZoomReal,
  'camera/cursor-flyover': CursorFlyover,
  'camera/depth-layer-moves/dolly-zoom': DollyZoomReal,
  'camera/depth-layer-moves/multiplane': MultiplaneReal,
  'camera/graze-face-tour': GrazeFaceTour,
  'camera/overhead-camera-moves/overhead-tabletop-drop': OverheadTabletopDrop,
  'camera/overhead-camera-moves/tilt-reveal': TiltReveal,
  'camera/space-camera-moves/drone-dive-landing': DroneDiveLanding,
  'camera/space-camera-moves/exploded-view': ExplodedView,
  'camera/steep-tilt-glide': SteepTiltGlide,
  'camera/tension-camera-moves/bullet-time-freeze-orbit': BulletTimeFreezeOrbit,
  'camera/tension-camera-moves/dutch-roll-to-level': DutchRollToLevel,
  'camera/tension-camera-moves/pull-back-isolation': PullBackIsolation,
  'camera/tension-camera-moves/slow-push-in': SlowPushIn,
  'camera/terminal-3d': Terminal3D,
  'camera/basic-3d-scene': Basic3DScene,
  // data
  'data/avatar-grid-radial-build-colorize': AvatarGridRadialBuildColorize,
  'data/before-after-slider-scrub': BeforeAfterSliderScrub,
  'data/chart-live-moves/axis-rescale-shock': AxisRescaleShockV2,
  'data/chart-live-moves/oscilloscope-stream': OscilloscopeStreamV2,
  'data/chart-live-moves/unit-dot-swarm-regroup': UnitDotSwarmRegroupV2,
  'data/counter-confetti': CounterConfetti,
  'data/cycle-glass-node-morph': CycleGlassNodeMorph,
  'data/gauge-readout-moves/needle-sweep': NeedleSweepSelftest,
  'data/gauge-readout-moves/tape-scroll-fixed-pointer': TapeScrollFixedPointer,
  'data/hatch-depth': HatchDepth,
  'data/odometer-digit-roll': OdometerDigitRoll,
  'data/particle-celebrate-hits/confetti-crossfire': ConfettiCrossfire,
  'data/particle-celebrate-hits/counter-tick-sparks': CounterTickSparks,
  'data/particle-sand-fill': ParticleSandFill,
  'data/ring-diagram-annotation-reveal': RingDiagramAnnotationReveal,
  'data/scroll-brake-moves/brake-reticle-lock': BrakeReticleLock,
  'data/scroll-brake-moves/changelog-scroll-brake': ChangelogScrollBrake,
  'data/timeline-travel': TimelineTravel,
  // opening
  'opening/crane-rise-reveal': CraneRiseReveal,
  'opening/dataviz-landscape-open': DatavizLandscapeOpen,
  'opening/fracture': Fracture,
  'opening/icon-field-colorize': IconFieldColorize,
  'opening/letterspace-materialize': LetterspaceMaterialize,
  'opening/magician-card-flourish': MagicianCardFlourish,
  'opening/orbit-ring-title-open': OrbitRingTitleOpen,
  'opening/spotlight-hero-card': SpotlightHeroCard,
  'opening/stroke-segment-build': StrokeSegmentBuild,
  'opening/text-as-mask': TextAsMask,
  // outro
  'outro/edit-hook-moves/logo-sting-button': LogoStingButton,
  'outro/grain-dissolve': GrainDissolve,
  'outro/logo-shrink-wordmark-lockup': LogoShrinkWordmarkLockup,
  'outro/neon-triple-marquee': NeonTripleMarquee,
  'outro/outro-group-photo-launch': OutroGroupPhotoLaunch,
  'outro/ui-strip-away-outro': UiStripAwayOutro,
  'outro/ui-to-brand-morph/icon-flip-bloom-logo': IconFlipBloomLogo,
  'outro/ui-to-brand-morph/input-morphs-into-logo': InputMorphsIntoLogo,
  // transition
  'transition/bottom-push-stack-wipe': BottomPushStackWipe,
  'transition/bubble-swarm-takeover': BubbleSwarmTakeover,
  'transition/card-flip-reveal': CardFlipReveal,
  'transition/card-flock-tumble': CardFlockTumble,
  'transition/circle-match-iris': CircleMatchIris,
  'transition/color-block-step-wipe': ColorBlockStepWipe,
  'transition/cube-navigation': CubeNavigation,
  'transition/gradient-transition': GradientTransition,
  'transition/line-carry-transition': LineCarryTransition,
  'transition/mosaic-reframe': MosaicReframe,
  'transition/page-turn-transitions/barn-door-split': BarnDoorSplit,
  'transition/page-turn-transitions/cube-rotate': CubeRotate,
  'transition/paper-plane-messenger': PaperPlaneMessenger,
  'transition/print-texture-transitions/ink-bleed-reveal': InkBleedReveal,
  'transition/shot-transitions/black-card': BlackCardTransition,
  'transition/shot-transitions/dark-tunnel': DarkTunnelTransition,
  'transition/shot-transitions/focus-handoff': FocusHandoffTransition,
  'transition/shot-transitions/mask-wipe': MaskWipeReal,
  'transition/shot-transitions/portal-wipe': PortalWipeV2,
  'transition/shot-transitions/whip-brake': WhipBrakeReal,
  'transition/shot-transitions/whip-pan': WhipPanReal,
  'transition/tear-streak-transitions/glitch-displace': GlitchDisplace,
  'transition/transition-hidden-cut/invisible-cut': InvisibleCut,
  'transition/transition-hidden-cut/light-leak-burn': LightLeakBurn,
  'transition/transition-hidden-cut/versus-slam': VersusSlam,
  'transition/transition-travel/letterform-zoom': LetterformZoom,
  'transition/transition-travel/shared-element-morph': SharedElementMorph,
  'transition/white-flash-logo-simplify-cut': WhiteFlashLogoSimplifyCut,
  'transition/wipe-transitions/blinds-slice': BlindsSlice,
  'transition/wipe-transitions/clock-wipe': ClockWipe,
  // rhythm
  'rhythm/beat-cut-moves/beat-cut-accelerando': BeatCutAccelerando,
  'rhythm/beat-cut-moves/paparazzi-flash': PaparazziFlash,
  'rhythm/beat-step-list-theme-cycle': BeatStepListThemeCycle,
  'rhythm/montage-rhythm-moves/domino-cascade': DominoCascade,
  'rhythm/montage-rhythm-moves/drop-blackout-slam': DropBlackoutSlam,
  'rhythm/montage-rhythm-moves/wright-triple-cut': WrightTripleCut,
  'rhythm/panel-grid-moves/comic-panel-split': ComicPanelSplit,
  'rhythm/panel-grid-moves/flip-grid-reflow': FlipGridReflow,
  'rhythm/panel-grid-moves/grid-flash-mosaic': GridFlashMosaic,
  'rhythm/quad-split-parallel-scenes': QuadSplitParallelScenes,
  'rhythm/rhythm-interrupt-moves/jump-cut-punch-in': JumpCutPunchIn,
  'rhythm/rhythm-interrupt-moves/strobe-black-frames': StrobeBlackFrames,
  'rhythm/sakuga-timing-shift': SakugaTimingShift,
  'rhythm/smear-multiples': SmearMultiples,
  'rhythm/spectrum-morph-ui': SpectrumMorphUi,
  'rhythm/speed-ramp-freeze/freeze-annotate': FreezeAnnotateReal,
  'rhythm/speed-ramp-freeze/speed-ramp': SpeedRampReal,
  'rhythm/trailer-grammar-moves/card-footage-cadence': CardFootageCadence,
  'rhythm/trailer-grammar-moves/smash-cut': SmashCut,
  'rhythm/trailer-grammar-moves/trailer-bumper': TrailerBumper,
  // ui-entrance
  'ui-entrance/avatar-bracket-carousel': AvatarBracketCarousel,
  'ui-entrance/bezier-source-converge-merge': BezierSourceConvergeMerge,
  'ui-entrance/card-stack': CardStack,
  'ui-entrance/carousel-3d': Carousel3D,
  'ui-entrance/clipcard-looping': ClipCardLooping,
  'ui-entrance/cloner-depth-echo': ClonerDepthEcho,
  'ui-entrance/deck-deal-flyin': DeckDealFlyin,
  'ui-entrance/doc-park-left-pill-deal': DocParkLeftPillDeal,
  'ui-entrance/document-typewriter-reveal': DocumentTypewriterReveal,
  'ui-entrance/draw-svg-trace': DrawSvgTrace,
  'ui-entrance/element-body-moves/axial-stretch': AxialStretch,
  'ui-entrance/element-body-moves/contact-shadow-lift': ContactShadowLift,
  'ui-entrance/floating-glossy-label-pills': FloatingGlossyLabelPills,
  'ui-entrance/integration-hub-map': IntegrationHubMap,
  'ui-entrance/list-reveal': ListReveal,
  'ui-entrance/list-stack-press': ListStackPress,
  'ui-entrance/morph-from-primitive': MorphFromPrimitive,
  'ui-entrance/neon-frame-forerun': NeonFrameForerun,
  'ui-entrance/neon-frame-orbit-drop': NeonFrameForerunOrbit,
  'ui-entrance/page-waterfall-wall': PageWaterfallWall,
  'ui-entrance/page-waterfall-wall/vertical-ticker': VerticalTicker,
  'ui-entrance/paper-craft-moves/masking-tape-slap': MaskingTapeSlap,
  'ui-entrance/paper-craft-moves/popup-book-rise': PopupBookRise,
  'ui-entrance/platform-hinge-rise': PlatformHingeRise,
  'ui-entrance/product-card-progressive-assemble': ProductCardProgressiveAssemble,
  'ui-entrance/radial-wave': RadialWave,
  'ui-entrance/research-card-stack-scroll': ResearchCardStackScroll,
  'ui-entrance/row-embed': RowEmbed,
  'ui-entrance/runway-ground-skim': RunwayGroundSkim,
  'ui-entrance/skeleton-reveal': SkeletonReveal,
  'ui-entrance/svg-shape-morph': SvgShapeMorph,
  'ui-entrance/value-stagger-gradient': ValueStaggerGradient,
  'ui-entrance/wall-reveal-moves/bento-light-up': BentoLightUp,
  'ui-entrance/wall-reveal-moves/grid-wave-flip': GridWaveFlip,
  'ui-entrance/wall-reveal-moves/wireframe-draw-on': WireframeDrawOn,
  // interaction
  'interaction/ai-stream-response/stream-response': StreamResponse,
  'interaction/autolayout-gap-dial': AutolayoutGapDial,
  'interaction/canvas-materialize-moves/diagram-cascade-build': DiagramCascadeBuild,
  'interaction/canvas-materialize-moves/panel-to-canvas-materialize': PanelToCanvasMaterialize,
  'interaction/chip-grid-single-select-blackout': ChipGridSingleSelectBlackout,
  'interaction/chip-lift-to-user-pill': ChipLiftToUserPill,
  'interaction/collab-cursor-moves/cursor-cast-ensemble': CursorCastEnsemble,
  'interaction/collab-cursor-moves/cursor-dialogue-duet': CursorDialogueDuet,
  'interaction/command-palette-summon': CommandPaletteSummon,
  'interaction/glass-pill-dictation-typing': GlassPillDictationTyping,
  'interaction/hashtag-to-pill-materialize': HashtagToPillMaterialize,
  'interaction/input-trigger-moves/cursor-performance-punch-in': CursorPerformancePunchIn,
  'interaction/input-trigger-moves/keycap-smash-cut': KeycapSmashCut,
  'interaction/picker-carousel-feature-cycle': PickerCarouselFeatureCycle,
  'interaction/segmented-thumb-hero': SegmentedThumbHero,
  'interaction/theme-switch-moves/palette-theme-ripple': PaletteThemeRipple,
  'interaction/theme-switch-moves/theme-sweep-toggle': ThemeSweepToggle,
  'interaction/type-and-filter': TypeAndFilter,
  'interaction/voice-waveform-live': VoiceWaveformLive,
  // effects
  'effects/assemble-then-type-flyin': AssembleThenTypeFlyin,
  'effects/aurora-bloom-bg-flip': AuroraBloomBgFlip,
  'effects/brand-frame-snap': BrandFrameSnap,
  'effects/dashboard-glow-highlight-pill': DashboardGlowHighlightPill,
  'effects/fui-hud-moves/line-unfold-panel': LineUnfoldPanel,
  'effects/fui-hud-moves/reticle-lock-on': ReticleLockOn,
  'effects/glow-flyline-moves/flyline-arc': FlylineArc,
  'effects/glow-flyline-moves/glow-orb-ambient': GlowOrbAmbient,
  'effects/glow-flyline-moves/orb-flyline-relay': OrbFlylineRelay,
  'effects/icon-performance-moves/attention-bounce': AttentionBounce,
  'effects/icon-performance-moves/pop-burst-confirm': PopBurstConfirm,
  'effects/impact-feedback/anime-impact': AnimeImpact,
  'effects/impact-feedback/hit-counter': HitCounter,
  'effects/light-play-moves/halation-bloom': HalationBloom,
  'effects/light-play-moves/sheen-sweep-retry': SheenSweepRetry,
  'effects/light-play-moves/spotlight-sweep-reveal': SpotlightSweepReveal,
  'effects/line-boil': LineBoil,
  'effects/radial-ripple-phone-chips': RadialRipplePhoneChips,
  'effects/riso-print-hits/riso-beat-pump': RisoBeatPump,
  'effects/riso-print-hits/riso-misregistration-hit': RisoMisregistrationHit,
  'effects/scan-bracket-sweep': ScanBracketSweep,
  'effects/scanline-annotate-focus': ScanlineAnnotateFocus,
  'effects/scanline-assemble-flyin': ScanlineAssembleFlyin,
  'effects/slam-entrance-moves/impact-burst-kit': ImpactBurstKit,
  'effects/slam-entrance-moves/kanada-perspective-snap': KanadaPerspectiveSnap,
  'effects/slam-entrance-moves/score-slam': ScoreSlam,
  'effects/spotlight-sweep-moves/corner-spotlight-reveal': CornerSpotlightReveal,
  'effects/spotlight-sweep-moves/glow-wake-sleep-panel': GlowWakeSleepPanel,
  'effects/spotlight-sweep-moves/slide-spotlight-pan': SlideSpotlightPan,
};

//  fallback：映射不到时用的默认组件
const FallbackComponent: React.FC = () => (
  <AbsoluteFill style={{ background: '#0d0f14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ color: '#666', fontSize: 48, fontWeight: 600 }}>·</div>
  </AbsoluteFill>
);

export type ShotType = 'hook' | 'pain' | 'claim' | 'proof' | 'quote' | 'cta';

export type Shot = {
  type: ShotType;
  l2?: string;
  shotCard?: string;
  text: string;
  subText?: string;
  durationInFrames: number;
  base?: string;
  material?: string;
  materialOpacity?: number;
  media?: string;
  fallback?: {
    keyword: string;
    gradient: [string, string];
  };
};

export type Theme = {
  bg: string;
  surface: string;
  text: string;
  textDim: string;
  accent: string;
  accent2: string;
  danger: string;
};

export type CaptionStyle = 'pill' | 'plain' | 'bold' | 'underline';

export type Storyboard = {
  title: string;
  style: {
    bg: string;
    text: string;
    accent: string;
    sub: string;
    captionStyle?: CaptionStyle;
    // P1 文字公共参数（来源：风格中心 C4 → current-theme.json → build-storyboard）
    fontFamily?: string;
    captionSize?: number;
    captionWeight?: number;
    captionColor?: string;
    // P2 媒体公共参数
    materialOpacity?: number;
    fallbackSize?: number;
    fallbackAlpha?: number;
  };
  fps: number;
  audio?: string;
  base?: string;
  theme?: Theme;
  shots: Shot[];
};

// ---------- 字幕样式预设 ----------
const captionStylePresets: Record<CaptionStyle, {
  wrapper: React.CSSProperties;
  text: React.CSSProperties;
}> = {
  pill: {
    wrapper: {
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      borderRadius: 12,
      padding: '14px 28px',
    },
    text: {
      fontSize: 36,
      fontWeight: 600,
      color: '#fff',
      lineHeight: 1.5,
      textAlign: 'center',
      textShadow: '0 1px 4px rgba(0,0,0,0.9)',
      wordBreak: 'break-word',
    },
  },
  plain: {
    wrapper: { padding: '8px 20px' },
    text: {
      fontSize: 38,
      fontWeight: 500,
      color: '#fff',
      lineHeight: 1.5,
      textAlign: 'center',
      textShadow: '0 2px 12px rgba(0,0,0,0.9)',
      wordBreak: 'break-word',
    },
  },
  bold: {
    wrapper: { padding: '8px 20px' },
    text: {
      fontSize: 48,
      fontWeight: 900,
      color: '#ffe600',
      lineHeight: 1.4,
      textAlign: 'center',
      textShadow: '3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000',
      wordBreak: 'break-word',
    },
  },
  underline: {
    wrapper: { padding: '8px 0', borderBottom: '2px solid rgba(255,255,255,0.3)' },
    text: {
      fontSize: 32,
      fontWeight: 400,
      color: 'rgba(255,255,255,0.9)',
      lineHeight: 1.5,
      textAlign: 'center',
      letterSpacing: 2,
      textShadow: '0 1px 6px rgba(0,0,0,0.8)',
      wordBreak: 'break-word',
    },
  },
};

// ---------- 转译注入组件 ----------
// 有契约的组件：按契约注入 shot 数据（文案进入模板画面）
// 无契约的组件：原样渲染（保留演示内容），字幕浮层兜底
const TranslatedShot: React.FC<{
  shotCard?: string;
  shotData: {
    text: string;
    subText?: string;
    accent?: string;
    bg?: string;
    durationInFrames: number;
    media?: string;
  };
  FallbackComponent: React.ComponentType;
}> = ({ shotCard, shotData, FallbackComponent }) => {
  if (!shotCard) return <FallbackComponent />;
  const injected = translateShot(shotCard, shotData);
  if (!injected) return <FallbackComponent />;
  const C: React.ComponentType<any> = FallbackComponent;
  return <C {...injected} />;
};

// ---------- 单镜头：模板组件 + 字幕浮层 ----------
const ShotView: React.FC<{
  shot: Shot; style: Storyboard['style']; index: number; total: number;
}> = ({ shot, style, index, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = shot.durationInFrames;
  const progress = interpolate(frame, [0, d], [0, 100], { extrapolateRight: 'clamp' });
  const captionStyle = style.captionStyle || 'pill';
  const preset = captionStylePresets[captionStyle];
  // P1：公共文字参数覆盖预设默认（未设则回落预设值）——数据链 current-theme.json → storyboard.style
  const capFont = style.fontFamily || "'Noto Sans SC','Microsoft YaHei',sans-serif";
  const capSize = style.captionSize || preset.text.fontSize || 36;
  const capWeight = style.captionWeight || preset.text.fontWeight || 600;
  const capColor = style.captionColor || preset.text.color || '#fff';

  // 根据 shotCard 找组件（支持目录级：先精确，再按目录前缀匹配第一个组件）
  const exactComponent = shot.shotCard ? COMPONENT_MAP[shot.shotCard] : undefined;
  const dirComponent = shot.shotCard ? Object.entries(COMPONENT_MAP).find(([k]) => k.startsWith(shot.shotCard + '/'))?.[1] : undefined;
  const ShotComponent = exactComponent || dirComponent || FallbackComponent;

  return (
    <AbsoluteFill style={{ fontFamily: capFont }}>
      {/* 素材视频层（如果有匹配素材，放在模板下面做底） */}
      {shot.material && (
        <OffthreadVideo
          src={"http://127.0.0.1:8765/api/library/video?path=" + encodeURIComponent(shot.material)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: shot.materialOpacity ?? style.materialOpacity ?? 0.6 }}
          muted
        />
      )}

      {/* 失败回退层（无素材时：渐变底 + 关键词占位大字） */}
      {!shot.material && shot.fallback && (
        <div style={{
          position: 'absolute', inset: 0,
          background: "linear-gradient(135deg, ${shot.fallback.gradient[0]}, ${shot.fallback.gradient[1]})",
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              fontSize: style.fallbackSize || 96, fontWeight: 900, letterSpacing: 4,
              color: 'rgba(255,255,255,' + (style.fallbackAlpha ?? 0.14) + ')',
              fontFamily: capFont,
            }}>{shot.fallback.keyword}</div>
          </div>
        </div>
      )}

      {/* 模板组件层（全屏视觉）—— TemplateAdapter 转译注入文案
          素材主体镜头（shotCard 为空且 material 存在）：素材即视觉主体，跳过模板层避免遮挡 */}
      {!(shot.shotCard == null && shot.material) && (
      <TranslatedShot shotCard={shot.shotCard} shotData={{
        text: shot.text,
        subText: shot.subText,
        accent: style.accent,
        bg: style.bg,
        durationInFrames: shot.durationInFrames,
        media: shot.media,
      }} FallbackComponent={ShotComponent} />
      )}


      {/* 字幕层（独立浮层，永远在底部） */}
      <div style={{
        position: 'absolute', bottom: 70, left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
        padding: '0 120px',
        zIndex: 10,
      }}>
        <div style={{ ...preset.wrapper, maxWidth: 1400 }}>
          <div style={{ ...preset.text, fontFamily: capFont, fontSize: capSize, fontWeight: capWeight, color: capColor }}>{shot.text}</div>
        </div>
      </div>

      {/* 顶部进度条 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 4,
        background: 'rgba(255,255,255,0.08)',
        zIndex: 20,
      }}>
        <div style={{ width: `${progress}%`, height: '100%', background: style.accent }} />
      </div>
    </AbsoluteFill>
  );
};

// ---------- 主组件 ----------
export const DynamicVideo: React.FC<{ storyboard: Storyboard }> = ({ storyboard }) => {
  let currentFrom = 0;
  const t = storyboard.theme || { bg: '#0d0f14', surface: '#1a1d24', text: '#e8e6e1', textDim: '#8a8680', accent: '#d4a853', accent2: '#4ecdc4', danger: '#ff6b6b' };
  return (
    <AbsoluteFill style={{
      background: storyboard.style.bg,
      ['--bg' as any]: t.bg,
      ['--surface' as any]: t.surface,
      ['--text' as any]: t.text,
      ['--text-dim' as any]: t.textDim,
      ['--accent' as any]: t.accent,
      ['--accent2' as any]: t.accent2,
      ['--danger' as any]: t.danger,
      ['--font-family' as any]: storyboard.style.fontFamily || "'Noto Sans SC','Microsoft YaHei',sans-serif",
    }}>
      {storyboard.audio && (
        <Audio src={staticFile(storyboard.audio)} volume={0.9} />
      )}
      {storyboard.shots.map((shot, i) => {
        const from = currentFrom;
        currentFrom += shot.durationInFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={shot.durationInFrames}>
            <ShotView shot={shot} style={storyboard.style} index={i} total={storyboard.shots.length} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const DEFAULT_STORYBOARD: Storyboard = {
  title: '示例',
  style: { bg: '#0d0f14', text: '#e8e6e1', accent: '#d4a853', sub: '#8a8680', captionStyle: 'pill' },
  fps: 30,
  shots: [
    { type: 'hook', text: '示例开场钩子', shotCard: 'typography/cel-flash-stomp', durationInFrames: 90 },
    { type: 'proof', text: '示例正文内容', shotCard: 'typography/blur-slide', durationInFrames: 90 },
  ],
};

export const getTotalDuration = (storyboard: Storyboard) =>
  storyboard.shots.reduce((sum, s) => sum + s.durationInFrames, 0);
