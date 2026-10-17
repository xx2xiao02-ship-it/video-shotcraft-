import React, {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import manifest from './bundled-font-manifest.json';

// Only the selected family is loaded; local files and licenses travel with the project.
export const BundledFonts: React.FC<{fontFamily: string}> = ({fontFamily}) => {
  const families = fontFamily.split(',').map(value => value.trim().replace(/^['"]|['"]$/g, ''));
  const selected = families.find(name => manifest.some(font => font.aliases.includes(name)));
  const [handle] = useState(() => delayRender('加载本地成片字体'));
  useEffect(() => {
    if (!selected) { continueRender(handle); return; }
    const weights = [...new Set(manifest.filter(font => font.aliases.includes(selected)).map(font => font.weight))];
    Promise.all(weights.map(weight => document.fonts.load(`${weight} 16px ${JSON.stringify(selected)}`, '视频主题')))
      .then(loaded => {
        if (loaded.some(faces => !faces.length)) throw new Error(`本地字体加载失败：${selected}`);
        continueRender(handle);
      }).catch(cancelRender);
  }, [handle, selected]);
  return <style>{manifest.flatMap(font => font.aliases.map(name =>
    `@font-face{font-family:${JSON.stringify(name)};src:url(${JSON.stringify(staticFile('fonts/' + font.file))});font-weight:${font.weight};font-style:normal;font-display:block;}`
  )).join('\n')}</style>;
};
