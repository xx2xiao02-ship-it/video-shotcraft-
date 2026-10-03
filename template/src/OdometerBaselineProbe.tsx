import React from 'react';
import {AbsoluteFill,Composition,registerRoot} from 'remotion';
import {OdometerDigitRoll} from '../../.isolated/card-governance-batch-002/baseline/demos/data/odometer-digit-roll/OdometerDigitRoll';
const Sample: React.FC = () => <AbsoluteFill style={{'--bg':'#f6f6f6','--text':'#222222','--text-dim':'#999999'} as React.CSSProperties}>
  <OdometerDigitRoll />
</AbsoluteFill>;
registerRoot(()=> <Composition id="OdometerBaselineProbe" component={Sample} durationInFrames={150} fps={30} width={1920} height={1080} />);
