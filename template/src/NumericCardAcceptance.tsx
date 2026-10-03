import React from 'react';
import {AbsoluteFill, Composition, registerRoot} from 'remotion';
import {CounterConfetti} from '../../demos/data/counter-confetti/CounterConfetti';

export type NumericFixture = {value:number;unit:string;label:string;title:string;transparent:boolean};
const Sample: React.FC<NumericFixture> = ({transparent,...props}) => <AbsoluteFill
  style={{background:transparent ? 'repeating-linear-gradient(35deg,#183b40 0px,#183b40 50px,#416775 50px,#416775 100px)' : '#182126'}}>
  <CounterConfetti {...props} skin={{bg:'#182126',surface:'#29373e',text:'#ffffff',accent:'#f6aa5b',
    muted:'#dde9eb',fontFamily:'Microsoft YaHei',transparentBackground:transparent}} />
</AbsoluteFill>;

const Root: React.FC = () => <Composition id="NumericCardAcceptance" component={Sample}
  durationInFrames={138} fps={30} width={1920} height={1080}
  defaultProps={{value:1200,unit:'元',label:'应急储备',title:'留住现金底气',transparent:true}} />;
registerRoot(Root);
