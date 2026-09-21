import { Composition } from 'remotion';
import { AiflMain, AIFL_TOTAL } from './aifl/Main';
import { DynamicVideo, DEFAULT_STORYBOARD, getTotalDuration, type Storyboard } from './DynamicVideo';
import { PreviewGallery, PREVIEW_TOTAL } from './PreviewGallery';

export const Root: React.FC = () => {
  return (
    <>
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
          return { durationInFrames: getTotalDuration(sb) };
        }}
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
