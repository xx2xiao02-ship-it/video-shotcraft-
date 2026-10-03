import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {ChangelogScrollBrake} from '../demos/data/scroll-brake-moves/ChangelogScrollBrake';
import {BrakeReticleLock} from '../demos/data/scroll-brake-moves/BrakeReticleLock';

const ProbeRoot:React.FC=()=> <>
  <Composition id="ChangelogListProbe" component={ChangelogScrollBrake} width={1920} height={1080} fps={30} durationInFrames={180}/>
  <Composition id="ReticleListProbe" component={BrakeReticleLock} width={1920} height={1080} fps={30} durationInFrames={180}/>
</>;
registerRoot(ProbeRoot);
