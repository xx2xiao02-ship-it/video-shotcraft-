/**
 * 鎵归噺娓叉煋妯℃澘缂╃暐鍥?- 鐢?Remotion 绋嬪簭 API
 */
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';

const root = 'E:\\video-shotcraft';
const thumbDir = path.join(root, 'director', 'thumbs');
fs.mkdirSync(thumbDir, { recursive: true });

// 璇?taxonomy 鎷挎墍鏈夋ā鏉?const tax = JSON.parse(fs.readFileSync(path.join(root, 'director', 'taxonomy.json'), 'utf-8'));
const allCards = [...new Set(Object.values(tax.levels.L3).flat())].sort();
console.log(`鍏?${allCards.length} 涓ā鏉縛);

const chrome = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
  console.log('鎵撳寘 Remotion...');
  const bundled = await bundle({
    entryPoint: path.join(root, 'template', 'src', 'index.ts'),
    webpackOverride: (c) => c,
  });

  let done = 0, fail = 0;
  for (const card of allCards) {
    const out = path.join(thumbDir, card.replace(/\//g, '__') + '.png');
    if (fs.existsSync(out) && fs.statSync(out).size > 10000) {
      done++;
      continue;
    }

    const props = {
      shots: [{
        shotCard: card,
        text: '绀轰緥鏂囧瓧棰勮',
        durationInFrames: 90,
        pit: { subject: 'remotion', content: { type: 'text' }, position: 'element' },
      }],
      theme: { bg: '#0d0f14', text: '#e8e6e1', accent: '#d4a853' },
      audio: '',
    };

    try {
      const comp = await selectComposition({
        serveUrl: bundled,
        id: 'DynamicVideo',
        inputProps: props,
        browserExecutable: chrome,
      });
      await renderStill({
        composition: comp,
        output: out,
        frame: 45,
        inputProps: props,
        browserExecutable: chrome,
      });
      done++;
      console.log(`  鉁?${card}`);
    } catch (e) {
      fail++;
      console.log(`  鉁?${card}: ${e.message.slice(0, 100)}`);
    }
  }
  console.log(`\n瀹屾垚: ${done} 鎴愬姛, ${fail} 澶辫触`);
}

main().catch(console.error);

