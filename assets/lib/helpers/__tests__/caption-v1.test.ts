import {describe, expect, it} from 'vitest';
import {makePages} from '../../../../template/src/captions/CaptionV1Track';

describe('字幕分页与语义重点', () => {
  it('在标点处分页并只高亮真正的后半句重点', () => {
    const pages = makePages([{text:'不盲目换车、买奢侈品，减少可花可不花的开销，存款才是底气。',
      startMs:0, endMs:6000, highlight:'存款才是底气'}], 22, false);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.filter(page => page.highlight)).toHaveLength(1);
    expect(pages.find(page => page.highlight)?.text).toContain('存款才是底气');
    expect(pages[0].highlight).toBeUndefined();
  });
});
