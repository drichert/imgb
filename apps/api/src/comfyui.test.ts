import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { hasComfyUiMetadata } from './comfyui.js';

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
