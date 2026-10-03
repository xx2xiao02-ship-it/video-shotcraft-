import path from 'node:path';

function safeName(value) {
  return String(value || 'asset').replace(/[^a-zA-Z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'asset';
}

export function planImage2Generation({job, modeCRoot, outputRoot = modeCRoot, config}) {
  if (job.assetKind !== 'image') throw new Error('Image2 适配器只接收图片任务');
  const executable = path.resolve(modeCRoot, config.image.skillPath, config.image.binary);
  const output = path.resolve(outputRoot, job.outputPath || `generated/${safeName(job.jobId)}.png`);
  const aspectRatio = job.aspectRatio || config.aspectRatio;
  if (!['16:9', '9:16'].includes(aspectRatio)) throw new Error('Image2 素材任务画幅无效');
  const size = aspectRatio === '9:16' ? '1024x1792' : '1792x1024';
  return {
    provider:config.image.provider,
    model:config.image.model,
    executable,
    args:['generate', '--prompt-file', '<prompt-file>', '--size', size,
      '--quality', config.image.quality, '--out', output],
    output,
    billable:true,
    dryRunOnly:true,
  };
}

export function image2DryRun(job, modeCRoot, config, outputRoot = modeCRoot) {
  return {...planImage2Generation({job, modeCRoot, outputRoot, config}), prompt:job.prompt,
    status:'pending_generation', message:'dry-run：未调用 Image2 API'};
}
