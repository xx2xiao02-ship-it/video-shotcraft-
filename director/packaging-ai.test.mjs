import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertPublicHttpUrl, buildGptImageArgs, generateAiCover, generateAiTitles,
  MODEL_CHOICES, QUALITY_TIERS} from './packaging-ai.mjs';

test('buildGptImageArgs maps the skill CLI flag surface', () => {
  const args = buildGptImageArgs({prompt:'cover', outFile:'out.png', model:'gpt-image-2.5-sunburst',
    size:'portrait', quality:'high', referenceImages:['frame.png'], inputFidelity:'high'});
  assert.deepEqual(args, ['--model', 'gpt-image-2.5-sunburst', '--quality', 'high', '--size', 'portrait',
    '-p', 'cover', '-f', 'out.png', '-i', 'frame.png', '--input-fidelity', 'high']);
  assert.throws(() => buildGptImageArgs({prompt:'  ', outFile:'x'}), /prompt 不能为空/);
});

test('transparent background forces PNG output unless webp chosen', () => {
  const args = buildGptImageArgs({prompt:'p', outFile:'o.png', background:'transparent'});
  assert.ok(args.includes('--format') && args.includes('png'));
  const webp = buildGptImageArgs({prompt:'p', outFile:'o.webp', background:'transparent', format:'webp'});
  assert.ok(!webp.includes('png'));
});

test('model menu and quality tiers expose the 2.5 capability surface', () => {
  assert.deepEqual(MODEL_CHOICES.map(model => model.id),
    ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2']);
  for (const tier of ['low', 'medium', 'high', 'xhigh', 'max']) {
    assert.ok(QUALITY_TIERS.includes(tier));
  }
});

test('accepts public http/https endpoints and normalizes trailing slash', () => {
  assert.equal(assertPublicHttpUrl('https://api.openai.com/v1').hostname, 'api.openai.com');
  assert.equal(assertPublicHttpUrl('http://example.com/v1').protocol, 'http:');
  assert.ok(assertPublicHttpUrl('https://api.openai.com/v1').toString().endsWith('/v1/'));
});

const REJECTED = [
  'ftp://api.openai.com/v1',
  'file:///etc/passwd',
  'http://localhost/v1',
  'http://api.localhost/v1',
  'http://router.local/v1',
  'http://svc.internal/v1',
  'http://127.0.0.1:8080/v1',
  'http://10.1.2.3/v1',
  'http://192.168.0.10/v1',
  'http://172.16.5.4/v1',
  'http://172.31.255.255/v1',
  'http://169.254.169.254/latest/meta-data',
  'http://100.64.0.1/v1',
  'http://0.0.0.0/v1',
  'http://224.0.0.1/v1',
  'http://[::1]:9000/v1',
  'http://[::ffff:127.0.0.1]/v1',
  'http://[fd00::1]/v1',
  'http://[fe80::1]/v1',
  'not a url',
  '',
];

test('rejects loopback, private, reserved and non-http targets', () => {
  for (const raw of REJECTED) {
    assert.throws(() => assertPublicHttpUrl(raw), Error, `应拒绝 ${raw || '(空)'}`);
  }
});

test('ai calls fail fast with a clear message when key is missing', async () => {
  const config = {baseUrl:'https://api.openai.com/v1', apiKey:'', imageModel:'gpt-image-1', chatModel:'gpt-4o-mini'};
  await assert.rejects(() => generateAiCover({config, prompt:'封面', imageFile:'a.png', outFile:'b.png'}),
    /未配置 OPENAI_API_KEY/);
  await assert.rejects(() => generateAiTitles({config, topic:'主题'}), /未配置 OPENAI_API_KEY/);
});
