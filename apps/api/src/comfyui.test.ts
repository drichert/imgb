import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { matchesComfySampler, readComfySamplers } from './comfyPrompt.js';
import { hasComfyUiMetadata, readPngTextMetadata } from './comfyui.js';

function chunk(type: string, data: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, data, Buffer.alloc(4)]); // parser doesn't validate CRC
}
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = chunk('IHDR', Buffer.alloc(13));
const iend = chunk('IEND');
function png(...chunks: Buffer[]): Buffer {
  return Buffer.concat([signature, ihdr, ...chunks, iend]);
}
function textChunk(key: string, value: string, type = 'tEXt'): Buffer {
  return chunk(type, Buffer.from(key + '\0' + value));
}
function itxtChunk(key: string, value: string): Buffer {
  return chunk('iTXt', Buffer.concat([
    Buffer.from(key + '\0'),
    Buffer.from([0, 0]),
    Buffer.from('\0\0' + value),
  ]));
}

test('detects ComfyUI-style PNG metadata without decoding pixels', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'imgbae-comfyui-'));
  t.after(async () => { await rm(dir, { recursive: true, force: true }); });

  const cases: Array<{ name: string; bytes: Buffer; expected: boolean }> = [
    {
      name: 'standard-save.png',
      bytes: png(textChunk('prompt', '{"3":{"class_type":"KSampler"}}'), textChunk('workflow', '{"nodes":[]}')),
      expected: true,
    },
    {
      name: 'prompt-only.png',
      bytes: png(textChunk('prompt', '{"3":{"class_type":"KSampler"}}')),
      expected: true,
    },
    {
      name: 'workflow-only.png',
      bytes: png(textChunk('workflow', '{"nodes":[]}')),
      expected: true,
    },
    {
      name: 'itxt-save.png',
      bytes: png(itxtChunk('prompt', '{"3":{}}'), itxtChunk('workflow', '{"nodes":[]}')),
      expected: true,
    },
    {
      name: 'compressed-text.png',
      bytes: png(chunk('zTXt', Buffer.concat([
        Buffer.from('workflow\0\0'),
        deflateSync(JSON.stringify({ nodes: Array.from({ length: 4096 }, (_, id) => ({ id })) })),
      ]))),
      expected: true,
    },
    {
      name: 'compressed-itxt.png',
      bytes: png(chunk('iTXt', Buffer.concat([
        Buffer.from('prompt\0\x01\0\0\0'),
        deflateSync('{"3":{}}'),
      ]))),
      expected: true,
    },
    {
      name: 'invalid-compressed-text.png',
      bytes: png(textChunk('prompt', '\0invalid deflate data', 'zTXt')),
      expected: false,
    },
    {
      name: 'apng-style.png',
      bytes: png(chunk('IDAT', Buffer.alloc(1024)), textChunk('prompt', '{"3":{}}', 'comf'), textChunk('workflow', '{"nodes":[]}', 'comf')),
      expected: true,
    },
    {
      name: 'ordinary.png',
      bytes: png(textChunk('Comment', 'prompt workflow')),
      expected: false,
    },
    {
      name: 'bad-text.png',
      bytes: png(textChunk('prompt', 'this is not JSON'), textChunk('workflow', 'not a workflow')),
      expected: false,
    },
    {
      name: 'not-png.png',
      bytes: Buffer.from('not a PNG file'),
      expected: false,
    },
    {
      name: 'truncated.png',
      bytes: png(textChunk('prompt', '{"a":{}}')).subarray(0, 28),
      expected: false,
    },
  ];
  for (const item of cases) {
    const path = join(dir, item.name);
    await writeFile(path, item.bytes);
    assert.equal(await hasComfyUiMetadata(path), item.expected, item.name);
  }
});

test('extracts decoded PNG text without changing field order or raw values', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'imgbae-metadata-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'metadata.png');
  const workflow = ' { "nodes": [] }\n';
  const compressed = chunk('zTXt', Buffer.concat([Buffer.from('workflow\0\0'), deflateSync(workflow)]));
  await writeFile(path, png(
    chunk('tEXt', Buffer.from('Comment\0café', 'latin1')),
    compressed,
    itxtChunk('Comment', 'こんにちは'),
    textChunk('prompt', '\0invalid deflate data', 'zTXt'),
    textChunk('prompt', '{"3":{}}', 'comf'),
  ));
  assert.deepEqual(await readPngTextMetadata(path), {
    incomplete: true,
    entries: [
      { key: 'Comment', value: 'café', chunk: 'tEXt' },
      { key: 'workflow', value: workflow, chunk: 'zTXt' },
      { key: 'Comment', value: 'こんにちは', chunk: 'iTXt' },
      { key: 'prompt', value: '{"3":{}}', chunk: 'comf' },
    ],
  });

  await writeFile(path, png(compressed));
  assert.deepEqual(await readPngTextMetadata(path), {
    incomplete: false,
    entries: [{ key: 'workflow', value: workflow, chunk: 'zTXt' }],
  });
});

test('matches prompt and sampler settings from the same ComfyUI pass', () => {
  const samplers = readComfySamplers(JSON.stringify({
    positive: { class_type: 'CLIPTextEncode', inputs: { text: 'Rainy forest' } },
    negative: { class_type: 'CLIPTextEncode', inputs: { text: 'Motion blur' } },
    generated: { class_type: 'CaptionGenerator', inputs: {} },
    encoded: { class_type: 'CLIPTextEncode', inputs: { text: ['generated', 0] } },
    first: {
      class_type: 'KSampler',
      inputs: { positive: ['positive', 0], negative: ['negative', 0], sampler_name: 'euler', scheduler: 'normal', steps: 20, cfg: 4.5 },
    },
    second: {
      class_type: 'KSamplerAdvanced',
      inputs: { positive: ['encoded', 0], sampler_name: 'heun', scheduler: 'karras', steps: 35, cfg: 7 },
    },
  }), false);
  const matches = (filters: Parameters<typeof matchesComfySampler>[1]) =>
    samplers.some((sampler) => matchesComfySampler(sampler, filters));

  assert.equal(matches({ prompt: 'FOREST', sampler: 'EULER', scheduler: 'normal', steps: '20', cfg: '4.50' }), true);
  assert.equal(matches({ prompt: 'blur', steps: '20' }), true);
  assert.equal(matches({ sampler: 'heun', steps: '35' }), true);
  assert.equal(matches({ prompt: 'forest', sampler: 'heun' }), false);
  assert.equal(matches({ sampler: 'heun', scheduler: 'normal' }), false);
  assert.equal(matches({ prompt: 'CaptionGenerator' }), false);
});
