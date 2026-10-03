import { Composition } from 'remotion';
import { AiflMain, AIFL_TOTAL } from './aifl/Main';
import { DynamicVideo, DEFAULT_STORYBOARD, getTotalDuration, type Storyboard } from './DynamicVideo';
import { PreviewGallery, PREVIEW_TOTAL } from './PreviewGallery';
import { BModeBaseline, type BModeBaselineProps } from './BModeBaseline';
import {CardAcceptance} from './CardAcceptance';

export const Root: React.FC = () => {
  return (
    <>
      <Composition id="CardAcceptance" component={CardAcceptance} durationInFrames={180} fps={30}
        width={1920} height={1080} defaultProps={{card:'typography/brace-expand'}} />
      <Composition
        id="AiflPromo"
        component={AiflMain}
        durationInFrames={AIFL_TOTAL}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="DynamicVideo"
        component={DynamicVideo}
        durationInFrames={3000}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: DEFAULT_STORYBOARD }}
        calculateMetadata={({ props }) => {
          const sb = (props as { storyboard: Storyboard }).storyboard;
          return { durationInFrames: getTotalDuration(sb),
            width:sb.aspectRatio === '9:16' ? 1080 : 1920,
            height:sb.aspectRatio === '9:16' ? 1920 : 1080 };
        }}
      />
      <Composition
        id="BModeBaseline"
        component={BModeBaseline}
        durationInFrames={300}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{avatar: '', audio: '', totalFrames: 300, scenes: []}}
        calculateMetadata={({props}) => ({durationInFrames: (props as BModeBaselineProps).totalFrames})}
      />
      <Composition
        id="PreviewGallery"
        component={PreviewGallery}
        durationInFrames={PREVIEW_TOTAL}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
