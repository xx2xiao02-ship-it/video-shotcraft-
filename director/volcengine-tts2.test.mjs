import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {decodeTts2Frame, encodeTts2Frame, synthesizeVolcengineTts2,
  synthesizeVolcengineTts2WebSocket, TTS2_HTTP_URL, tts2Request} from './volcengine-tts2.mjs';

function serverFrame(type, event, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
  const header = Buffer.from([0x11, (type << 4) | 4, 0x10, 0]);
  const eventBytes = Buffer.alloc(4);
  eventBytes.writeInt32BE(event);
  const idSize = Buffer.alloc(4);
  const bodySize = Buffer.alloc(4);
  bodySize.writeUInt32BE(body.length);
  return Buffer.concat([header, eventBytes, idSize, bodySize, body]);
}

test('v3 frame uses documented event and payload lengths', () => {
  const frame = encodeTts2Frame(100, {req_params:{text:'你好'}}, 'session-1');
  assert.deepEqual([...frame.subarray(0, 4)], [0x11, 0x14, 0x10, 0]);
  assert.equal(frame.readInt32BE(4), 100);
  assert.equal(frame.readUInt32BE(8), 9);
  assert.deepEqual(JSON.parse(frame.subarray(25).toString()), {req_params:{text:'你好'}});
  assert.deepEqual(decodeTts2Frame(serverFrame(11, 352, Buffer.from('audio'))).payload, Buffer.from('audio'));
  assert.throws(() => decodeTts2Frame(serverFrame(11, 352, Buffer.from('audio')).subarray(0, 10)), /截断|长度/);
});

test('stock voice request omits clone-only model', () => {
  const request = tts2Request('你好', 'zh_female_vv_uranus_bigtts');
  assert.equal(request.req_params.speaker, 'zh_female_vv_uranus_bigtts');
  assert.equal(request.req_params.model, undefined);
  assert.equal(request.req_params.audio_params.enable_subtitle, true);
  assert.throws(() => tts2Request('你好', 'bad speaker'), /音色 ID/);
});

test('WebSocket synthesis accumulates audio and writes only after SessionFinished', async () => {
  const previous = process.env.VOLCENGINE_TTS_API_KEY;
  process.env.VOLCENGINE_TTS_API_KEY = 'test-key';
  const root = mkdtempSync(path.join(os.tmpdir(), 'volc-tts2-'));
  const outputFile = path.join(root, 'voice.mp3');
  const timingFile = path.join(root, 'timing.json');
  let socket;
  class FakeSocket extends EventEmitter {
    constructor(url, options) {
      super();
      socket = this;
      this.url = url;
      this.headers = options.headers;
      queueMicrotask(() => this.emit('open'));
    }
    send(frame) {
      const event = frame.readInt32BE(4);
      if (event === 1) {
        queueMicrotask(() => this.emit('message', serverFrame(9, 50, {}), true));
      } else if (event === 100) {
        const idSize = frame.readUInt32BE(8);
        this.request = JSON.parse(frame.subarray(16 + idSize).toString());
        queueMicrotask(() => {
          this.emit('message', serverFrame(9, 150, {}), true);
          this.emit('message', serverFrame(11, 352, Buffer.from('first')), true);
          this.emit('message', serverFrame(9, 364, {words:[{word:'你', startTime:0, endTime:0.2}]}), true);
          this.emit('message', serverFrame(11, 352, Buffer.from('second')), true);
          assert.equal(existsSync(outputFile), false);
          this.emit('message', serverFrame(9, 152, {}), true);
        });
      }
    }
    close() { this.closed = true; }
  }
  try {
    const result = await synthesizeVolcengineTts2WebSocket({text:'你好', speakerId:'zh_female_vv_uranus_bigtts',
      outputFile, timingFile, WebSocketImpl:FakeSocket});
    assert.equal(socket.headers['X-Api-Key'], 'test-key');
    assert.equal(socket.headers['X-Api-Resource-Id'], 'seed-tts-2.0');
    assert.equal(socket.request.req_params.model, undefined);
    assert.equal(socket.request.req_params.speaker, 'zh_female_vv_uranus_bigtts');
    assert.equal(result.audioBytes.toString(), 'firstsecond');
    assert.equal(readFileSync(outputFile).toString(), 'firstsecond');
    assert.equal(JSON.parse(readFileSync(timingFile)).words[0].word, '你');
    assert.equal(socket.closed, true);
  } finally {
    if (previous === undefined) delete process.env.VOLCENGINE_TTS_API_KEY;
    else process.env.VOLCENGINE_TTS_API_KEY = previous;
    rmSync(root, {recursive:true, force:true});
  }
});

test('empty completed session never writes an output file', async () => {
  const previous = process.env.VOLCENGINE_TTS_API_KEY;
  process.env.VOLCENGINE_TTS_API_KEY = 'test-key';
  const root = mkdtempSync(path.join(os.tmpdir(), 'volc-tts2-empty-'));
  const outputFile = path.join(root, 'voice.mp3');
  class EmptySocket extends EventEmitter {
    constructor() { super(); queueMicrotask(() => this.emit('open')); }
    send(frame) {
      if (frame.readInt32BE(4) === 1) queueMicrotask(() => this.emit('message', serverFrame(9, 50, {}), true));
      else queueMicrotask(() => this.emit('message', serverFrame(9, 152, {}), true));
    }
    close() {}
  }
  try {
    await assert.rejects(synthesizeVolcengineTts2WebSocket({text:'你好', speakerId:'zh_female_vv_uranus_bigtts',
      outputFile, WebSocketImpl:EmptySocket}), /未返回音频/);
    assert.equal(existsSync(outputFile), false);
  } finally {
    if (previous === undefined) delete process.env.VOLCENGINE_TTS_API_KEY;
    else process.env.VOLCENGINE_TTS_API_KEY = previous;
    rmSync(root, {recursive:true, force:true});
  }
});

test('short audition can return audio without saving a production file', async () => {
  const previous = process.env.VOLCENGINE_TTS_API_KEY;
  process.env.VOLCENGINE_TTS_API_KEY = 'test-key';
  class PreviewSocket extends EventEmitter {
    constructor() { super(); queueMicrotask(() => this.emit('open')); }
    send(frame) {
      const event = frame.readInt32BE(4);
      if (event === 1) queueMicrotask(() => this.emit('message', serverFrame(9, 50, {}), true));
      if (event === 100) queueMicrotask(() => {
        this.emit('message', serverFrame(11, 352, Buffer.from('preview')), true);
        this.emit('message', serverFrame(9, 152, {}), true);
      });
    }
    close() {}
  }
  try {
    const result = await synthesizeVolcengineTts2WebSocket({text:'试听。', speakerId:'zh_female_vv_uranus_bigtts',
      WebSocketImpl:PreviewSocket});
    assert.equal(result.audioBytes.toString(), 'preview');
  } finally {
    if (previous === undefined) delete process.env.VOLCENGINE_TTS_API_KEY;
    else process.env.VOLCENGINE_TTS_API_KEY = previous;
  }
});

test('service error rejects without writing audio', async () => {
  const previous = process.env.VOLCENGINE_TTS_API_KEY;
  process.env.VOLCENGINE_TTS_API_KEY = 'test-key';
  const root = mkdtempSync(path.join(os.tmpdir(), 'volc-tts2-error-'));
  const outputFile = path.join(root, 'voice.mp3');
  class ErrorSocket extends EventEmitter {
    constructor() { super(); queueMicrotask(() => this.emit('open')); }
    send() { queueMicrotask(() => this.emit('message', serverFrame(9, 51, {message:'authentication failed'}), true)); }
    close() {}
  }
  try {
    await assert.rejects(synthesizeVolcengineTts2WebSocket({text:'你好', speakerId:'zh_female_vv_uranus_bigtts',
      outputFile, WebSocketImpl:ErrorSocket}), /authentication failed/);
    assert.equal(existsSync(outputFile), false);
  } finally {
    if (previous === undefined) delete process.env.VOLCENGINE_TTS_API_KEY;
    else process.env.VOLCENGINE_TTS_API_KEY = previous;
    rmSync(root, {recursive:true, force:true});
  }
});

test('HTTP Chunked synthesis uses new API key and preserves word timestamps', async () => {
  const previous = process.env.VOLCENGINE_TTS_API_KEY;
  process.env.VOLCENGINE_TTS_API_KEY = 'test-key';
  const root = mkdtempSync(path.join(os.tmpdir(), 'volc-tts2-http-'));
  const outputFile = path.join(root, 'voice.mp3');
  const timingFile = path.join(root, 'timing.json');
  let request;
  try {
    const lines = [
      JSON.stringify({code:0, message:'OK', data:Buffer.from('first').toString('base64'),
        sentence:{words:[{word:'你', startTime:0, endTime:0.2}]}}),
      JSON.stringify({code:0, message:'OK', data:Buffer.from('second').toString('base64')}),
      JSON.stringify({code:20000000, message:'OK'}),
    ].join('\n');
    const result = await synthesizeVolcengineTts2({text:'你好', speakerId:'zh_female_xiaohe_uranus_bigtts',
      outputFile, timingFile, fetchImpl:async (url, options) => {
        request = {url, options};
        return new Response(new ReadableStream({start(controller) {
          controller.enqueue(Buffer.from(lines.slice(0, 23)));
          controller.enqueue(Buffer.from(lines.slice(23)));
          controller.close();
        }}), {status:200});
      }});
    assert.equal(request.url, TTS2_HTTP_URL);
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers['X-Api-Key'], 'test-key');
    assert.equal(request.options.headers['X-Api-Resource-Id'], 'seed-tts-2.0');
    assert.equal(request.options.headers['X-Api-Request-Id'].length, 36);
    assert.equal(JSON.parse(request.options.body).req_params.model, undefined);
    assert.equal(JSON.parse(request.options.body).req_params.speaker, 'zh_female_xiaohe_uranus_bigtts');
    assert.equal(result.audioBytes.toString(), 'firstsecond');
    assert.equal(readFileSync(outputFile).toString(), 'firstsecond');
    assert.equal(JSON.parse(readFileSync(timingFile)).words[0].word, '你');
  } finally {
    if (previous === undefined) delete process.env.VOLCENGINE_TTS_API_KEY;
    else process.env.VOLCENGINE_TTS_API_KEY = previous;
    rmSync(root, {recursive:true, force:true});
  }
});

test('HTTP Chunked service error does not write audio', async () => {
  const previous = process.env.VOLCENGINE_TTS_API_KEY;
  process.env.VOLCENGINE_TTS_API_KEY = 'test-key';
  const root = mkdtempSync(path.join(os.tmpdir(), 'volc-tts2-http-error-'));
  const outputFile = path.join(root, 'voice.mp3');
  try {
    await assert.rejects(synthesizeVolcengineTts2({text:'你好', speakerId:'zh_female_xiaohe_uranus_bigtts',
      outputFile, fetchImpl:async () => Response.json({code:55000000, message:'resource ID is mismatched with speaker related resource'})}),
    /code 55000000.*resource ID is mismatched/);
    assert.equal(existsSync(outputFile), false);
  } finally {
    if (previous === undefined) delete process.env.VOLCENGINE_TTS_API_KEY;
    else process.env.VOLCENGINE_TTS_API_KEY = previous;
    rmSync(root, {recursive:true, force:true});
  }
});
