import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {assertBackgroundCoverage} from './background-policy.mjs';
import {GRAPHIC_CONTRACTS,validateGraphicParams,BUSINESS_CARD_CONTRACTS,validateBusinessCardParams} from './graphic-contracts.mjs';
import {admittedGraphicCards} from './card-admission.mjs';
import {NUMERIC_CARD_CONTRACTS,validateNumericCardParams,assertNumericCardDuration} from './numeric-card-contracts.mjs';
import {admittedNumericCards} from './numeric-card-admission.mjs';
import {admittedTextCards} from './text-card-admission.mjs';
import {admittedBusinessDataCards} from './business-data-admission.mjs';
import {KARAOKE_CARD,validateKaraokeTimings} from './karaoke-timing.mjs';
import {LIST_CARD_IDS,validateListCardParams} from './list-card-contracts.mjs';
import {SCREEN_CARD_IDS} from './screen-card-contracts.mjs';
import {assertScreenCardAssets} from './screen-card-assets.mjs';
import {TEXT_CARD_CONTRACTS,validateTextCardLines,assertTextCardDuration} from './text-card-contracts.mjs';
import {assertNoAdjacentVideoReuse} from './video-material-policy.mjs';
import {readShortAcceptance,assertShortShot} from './short-card-admission.mjs';
import {OPENING_POLICY,validateOpeningShots} from './opening-visual-timeline.mjs';

export function preflightAModeRender(root, {runId = null, runDir = null, probe} = {}) {
  const file = path.join(runDir || path.join(root, 'director'), 'storyboard.json');
  if (!fs.existsSync(file)) throw new Error('分镜文件不存在，请先完成编导');
  const sb = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (runId && (sb.runId !== runId || sb.audio !== `audio/a-mode/${runId}.mp3`))
    throw new Error('分镜与本任务配音关联不一致，已阻止串线渲染');
  if (!Array.isArray(sb.shots) || !sb.shots.length || !Number.isFinite(sb.fps) || sb.fps <= 0 ||
      sb.shots.some(shot => !Number.isInteger(shot.durationInFrames) || shot.durationInFrames <= 0))
    throw new Error('分镜时间轴无效');
  const frames = sb.shots.reduce((sum, shot) => sum + shot.durationInFrames, 0);
  for (const shot of sb.shots) {
    if (sb.mode === 'A') {
      if(TEXT_CARD_CONTRACTS[shot.shotCard]){
        if(sb.fps!==30) throw new Error('文字卡验收使用30fps，不能混用帧率');
        if(shot.durationInFrames<=60) assertShortShot(shot,shot.durationInFrames,readShortAcceptance(root));
        else {
          validateTextCardLines(shot.shotCard,shot.displayLines);
          assertTextCardDuration(shot.shotCard,shot.durationInFrames);
          if(!admittedTextCards(root).includes(shot.shotCard))
            throw new Error(`文字卡 ${shot.shotCard} 尚未完成当前版本与时长的业务验收`);
        }
      }
      if (NUMERIC_CARD_CONTRACTS[shot.shotCard]) {
        validateNumericCardParams(shot.shotCard,shot.templateParams,shot.text);
        assertNumericCardDuration(shot.shotCard,shot.durationInFrames,sb.fps);
        if (!Array.isArray(shot.displayLines) || shot.displayLines.length!==1 ||
            typeof shot.displayLines[0]!=='string' || !shot.displayLines[0].trim() || [...shot.displayLines[0]].length>14)
          throw new Error('数字卡业务标题必须为一行且最多14字，不得裁切文案');
        if (!admittedNumericCards(root).includes(shot.shotCard)) throw new Error(`数值卡 ${shot.shotCard} 尚未完成当前版本的业务渲染验收`);
      } else if(LIST_CARD_IDS.has(shot.shotCard)) validateListCardParams(shot.shotCard,shot.templateParams);
      else if(SCREEN_CARD_IDS.has(shot.shotCard)) assertScreenCardAssets(root,shot.shotCard,shot.templateParams);
      else if(shot.shotCard===KARAOKE_CARD) validateKaraokeTimings(shot.templateParams?.timedWords,shot.displayLines,shot.durationInFrames);
      else if (BUSINESS_CARD_CONTRACTS[shot.shotCard]) validateBusinessCardParams(shot.shotCard,shot.templateParams,shot.text);
      else validateGraphicParams(shot.shotCard,shot.templateParams,shot.text);
      if (BUSINESS_CARD_CONTRACTS[shot.shotCard] && !admittedBusinessDataCards(root).includes(shot.shotCard))
        throw new Error(`业务卡 ${shot.shotCard} 尚未完成当前版本的业务渲染验收`);
      if (GRAPHIC_CONTRACTS[shot.shotCard] && !admittedGraphicCards(root).includes(shot.shotCard))
        throw new Error(`模板 ${shot.shotCard} 尚未完成当前版本的业务渲染验收`);
    }
  }
  if (runId || sb.mode === 'A' || sb.backgroundPolicy === 'video-default-v1')
    assertBackgroundCoverage(sb.shots);
  if (sb.mode === 'A') assertNoAdjacentVideoReuse(sb.shots);
  if (sb.openingPolicy === OPENING_POLICY) validateOpeningShots(sb.shots,readShortAcceptance(root),sb.fps);
  const publicDir = path.resolve(root, 'template', 'public');
  const audio = path.resolve(publicDir, String(sb.audio || ''));
  if (!audio.startsWith(publicDir + path.sep) || !fs.existsSync(audio)) throw new Error('原配音文件缺失，无法渲染');
  let seconds;
  try {
    seconds = probe ? probe(audio) : Number(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration',
      '-of','default=noprint_wrappers=1:nokey=1',audio], {encoding:'utf8',timeout:5000,windowsHide:true}).trim());
  } catch {
    // In the managed Windows runtime Node cannot spawn ffprobe, while the
    // TTS timing file is the authoritative duration used by this run.
    const timingPath = runDir && path.join(runDir, 'timing.json');
    if (!timingPath || !fs.existsSync(timingPath)) throw new Error('无法检测原配音时长，请检查 ffprobe 或音频文件；未启动渲染');
    const timing = JSON.parse(fs.readFileSync(timingPath, 'utf8'));
    seconds = Number(timing.totalFrames) / Number(timing.fps || sb.fps);
  }
  if (!Number.isFinite(seconds) || seconds <= 0 || Math.abs(seconds - frames / sb.fps) > 2)
    throw new Error(`分镜与原配音时长不匹配（画面 ${(frames/sb.fps).toFixed(1)} 秒，配音 ${Number(seconds).toFixed(1)} 秒），未启动渲染`);
  if (runDir) {
    const timing = JSON.parse(fs.readFileSync(path.join(runDir, 'timing.json'), 'utf8'));
    if (timing.totalFrames !== frames || timing.fps !== sb.fps) throw new Error('字幕时间轴与分镜不一致，未启动渲染');
  }
  return sb;
}
