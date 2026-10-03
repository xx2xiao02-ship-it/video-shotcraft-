import React from 'react';
import {AbsoluteFill,Composition,registerRoot} from 'remotion';
import {OdometerDigitRoll,type OdometerDigitRollProps} from '../../demos/data/odometer-digit-roll/OdometerDigitRoll';

type Fixture = OdometerDigitRollProps & {transparent?:boolean; light?:boolean; demo?:boolean};
const Sample: React.FC<Fixture> = ({transparent=false,light=false,demo=false,...props}) => <AbsoluteFill
  style={{background:'repeating-linear-gradient(35deg,#183b40 0px,#183b40 50px,#416775 50px,#416775 100px)',
    '--bg':'#f6f6f6','--text':'#222222','--text-dim':'#999999','--surface':'#dddddd'} as React.CSSProperties}>
  <OdometerDigitRoll {...(demo ? {} : {...props,skin:{bg:light?'#f6f6f6':'#182126',text:light?'#222222':'#ffffff',
    accent:light?'#137a65':'#f6aa5b',muted:'#aabbcc',surface:'#29373e',fontFamily:'Microsoft YaHei',transparentBackground:transparent}})} />
</AbsoluteFill>;
const Root: React.FC = () => <Composition id="OdometerAcceptance" component={Sample} fps={30}
  durationInFrames={144} width={1920} height={1080}
  defaultProps={{value:1200,unit:'元',label:'现金储备',title:'留住现金底气',transparent:true}} />;
registerRoot(Root);
