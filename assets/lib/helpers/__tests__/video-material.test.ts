import {describe, expect, it} from 'vitest';
import {translateShot} from '../../../../template/src/TemplateAdapter';

describe('Video card playback adapter', () => {
  it('passes verified media speed to the internal video card without retiming its animation', () => {
    const props = translateShot('ui-entrance/clipcard-looping', {
      text:'元素',media:'http://127.0.0.1/video.mp4',mediaPlaybackRate:0.4,durationInFrames:120,
    });
    expect(props).toMatchObject({src:'http://127.0.0.1/video.mp4',playbackRate:0.4,durationInFrames:120});
  });
  it('preserves default speed for legacy video-card inputs', () => {
    expect(translateShot('ui-entrance/clipcard-looping', {
      text:'元素',media:'video.mp4',durationInFrames:120,
    })).toMatchObject({playbackRate:1});
  });
});
