import {copyFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

export function installBundledFonts(assetRoot, remotion,{resolveSource=file=>file}={}) {
  const source = path.join(assetRoot, 'template', 'public', 'fonts');
  const manifest = JSON.parse(readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  const target = path.join(remotion, 'public', 'fonts');
  mkdirSync(target, {recursive:true});
  for (const name of new Set(['manifest.json', 'fonts.css', ...manifest.flatMap(font => [font.file, font.licenseFile])])) {
    if (path.basename(name) !== name || !existsSync(path.join(source, name))) throw new Error(`随包字体资源缺失：${name}`);
    copyFileSync(resolveSource(path.join(source, name)), path.join(target, name));
  }
  for (const name of ['BundledFonts.tsx', 'bundled-font-manifest.json']) {
    copyFileSync(resolveSource(path.join(assetRoot, 'template', 'src', name)), path.join(remotion, 'src', name));
  }
  return manifest;
}
