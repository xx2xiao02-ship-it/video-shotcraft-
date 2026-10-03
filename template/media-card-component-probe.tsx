import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {ReticleLockOn} from '../demos/effects/fui-hud-moves/ReticleLockOn';
import {BrandFrameSnap} from '../demos/effects/brand-frame-snap/BrandFrameSnap';
import {GlowWakeSleepPanel} from '../demos/effects/spotlight-sweep-moves/GlowWakeSleepPanel';
import {SlideSpotlightPan} from '../demos/effects/spotlight-sweep-moves/SlideSpotlightPan';
import {CornerSpotlightReveal} from '../demos/effects/spotlight-sweep-moves/CornerSpotlightReveal';
import {RadialRipplePhoneChips} from '../demos/effects/radial-ripple-phone-chips/RadialRipplePhoneChips';
import {LogoStingButton} from '../demos/outro/edit-hook-moves/LogoStingButton';

const ProbeRoot:React.FC=()=> <>
  <Composition id="ReticleMediaProbe" component={ReticleLockOn} width={1920} height={1080} fps={30} durationInFrames={180}/>
  <Composition id="ReticleMediaPortraitProbe" component={ReticleLockOn} width={1080} height={1920} fps={30} durationInFrames={180}/>
  <Composition id="BrandFrameMediaProbe" component={BrandFrameSnap} width={1920} height={1080} fps={30} durationInFrames={180}/>
  <Composition id="GlowPanelMediaProbe" component={GlowWakeSleepPanel} width={1920} height={1080} fps={30} durationInFrames={180}/>
  <Composition id="SlideSpotlightMediaProbe" component={SlideSpotlightPan} width={1920} height={1080} fps={30} durationInFrames={180}/>
  <Composition id="CornerSpotlightMediaProbe" component={CornerSpotlightReveal} width={1920} height={1080} fps={30} durationInFrames={180}/>
  <Composition id="PhoneMediaProbe" component={RadialRipplePhoneChips} width={1920} height={1080} fps={30} durationInFrames={180}/>
  <Composition id="LogoButtonMediaProbe" component={LogoStingButton} width={1920} height={1080} fps={30} durationInFrames={180}/>
</>;
registerRoot(ProbeRoot);
