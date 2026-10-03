import fs from 'node:fs';
import path from 'node:path';

// Transport failures are never automatically retried: the provider may have billed them.
// Only a completed response that fails local validation gets one bounded correction.
export async function validatedCheckpoint({file, prompt, call, validate, context, onRepair = () => {}}) {
  let value;
  let invalid;
  if (fs.existsSync(file)) {
    try { value = JSON.parse(fs.readFileSync(file, 'utf8')); validate(value); return value; }
    catch (error) {
      invalid = error;
      fs.copyFileSync(file, file.replace(/\.json$/, '') + `.rejected-${Date.now()}.json`);
    }
  }
  const attempts = invalid ? 1 : 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const correction = invalid ? `\n上次结果未通过校验：${invalid.message}。请保留正确决策，只修正违规部分；不随机替换素材，确实无合适素材可以不用。返回完整修正 JSON。上次结果：${JSON.stringify(value ?? null)}` : '';
    if (invalid) onRepair(invalid.message);
    value = await call(prompt + correction, context);
    // Retain every completed paid response, including rejected proposals.
    const archive = path.join(path.dirname(file), `${path.basename(file, '.json')}.response-${Date.now()}-${attempt}.json`);
    fs.writeFileSync(archive, JSON.stringify(value, null, 2), 'utf8');
    try {
      validate(value);
      fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2), 'utf8');
      fs.renameSync(file + '.tmp', file);
      return value;
    } catch (error) {
      // Cache the failed response too so explicit continuation can repair it.
      fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
      if (invalid) throw new Error(`模型修正后仍未通过校验：${error.message}`);
      invalid = error;
    }
  }
  throw invalid;
}
