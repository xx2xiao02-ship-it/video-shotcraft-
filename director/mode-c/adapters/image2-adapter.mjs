import path from 'node:path';

function safeName(value) {
  return String(value || 'asset').replace(/[^a-zA-Z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'asset';
}

export function planImage2Generation({job, modeCRoot, outputRoot = modeCRoot, config}) {
  if (job.assetKind !== 'image') throw new Error('Image2 适配器只接收图片任务');
  const executable = path.resolve(modeCRoot, config.image.skillPath, config.image.binary);
  const output = path.resolve(outputRoot, job.outputPath || `generated/${safeName(job.jobId)}.png`);
  return {
    provider:config.image.provider,
    model:config.image.model,
    executable,
    args:['generate', '--prompt-file', '<prompt-file>', '--size', config.image.defaultSize,
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
