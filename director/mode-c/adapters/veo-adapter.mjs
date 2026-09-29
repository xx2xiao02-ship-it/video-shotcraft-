import path from 'node:path';

function validDuration(value) {
  const duration = Number(value);
  if (![4, 6, 8].includes(duration)) throw new Error('Veo 3.1 时长必须为 4、6 或 8 秒');
  return duration;
}

export function planVeoGeneration({job, modeCRoot, outputRoot = modeCRoot, config}) {
  if (job.assetKind !== 'video') throw new Error('Veo 适配器只接收视频任务');
  const duration = validDuration(job.durationSec || config.video.durationSeconds);
  const skillRoot = path.resolve(modeCRoot, config.video.skillPath);
  const script = path.join(skillRoot, 'scripts', 'Generate.ts');
  const output = path.resolve(outputRoot, job.outputPath || `generated/${job.jobId}.mp4`);
  return {
    provider:config.video.provider,
    model:config.video.model,
    command:'npx',
    args:['tsx', script, '--prompt-file', '<prompt-file>', '--model', config.video.model,
      '--duration', String(duration), '--aspect-ratio', job.aspectRatio || config.aspectRatio,
      '--resolution', config.video.resolution, '--output', output],
    output,
    billable:true,
    audioPolicy:config.video.audioPolicy,
    dryRunOnly:true,
  };
}

export function veoDryRun(job, modeCRoot, config, outputRoot = modeCRoot) {
  return {...planVeoGeneration({job, modeCRoot, outputRoot, config}), prompt:job.prompt,
    status:'pending_generation', message:'dry-run：未调用 Veo API'};
}
