import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {planDigitalHumanUnits} from './b-mode-digital-human-plan.mjs';
import {renderDigitalHumanComposition} from './b-mode-digital-human-composition.mjs';

const root = process.env.SHOTCRAFT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = process.argv[2] || '';
const outputTag = process.argv.find(arg => arg.startsWith('--revision='))?.slice('--revision='.length) || '';
if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId)) throw new Error('Invalid run ID');
const runDir = path.join(root, 'director', 'b-mode-runs', runId);
const readJson = file => JSON.parse(readFileSync(path.join(runDir, file), 'utf8'));
const settings = readJson('digital-human-settings.json');
const timing = readJson('digital-human-timing.json');
const report = readJson('digital-human-report.json');
const plan = planDigitalHumanUnits(settings.text, settings.scenes, timing);
if (!Array.isArray(report.units) || report.units.some(unit => unit.status !== 'SUCCESS' || !existsSync(unit.output))) {
  throw new Error('仍有数字人素材未成功，不能进行无付费重合成');
}
const avatarPaths = settings.avatarFiles.map(file => path.join(runDir, path.basename(file)));
const composition = renderDigitalHumanComposition({root, runId, timing, plan, units:report.units, avatarPaths, outputTag});
report.status = 'SUCCESS';
report.output = composition.output;
report.composition = composition;
delete report.error;
writeFileSync(path.join(runDir, 'digital-human-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({runId, status:report.status, output:composition.output, runningHubCalled:false}));
