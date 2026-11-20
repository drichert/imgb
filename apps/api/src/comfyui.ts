import { open, type FileHandle } from 'node:fs/promises';
import { constants, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_CHUNKS = 256;
const MAX_TEXT_PREFIX = 1024;
const MAX_METADATA_BYTES = 4 * 1024 * 1024;

// Read only the requested small range. No image pixels or IDAT bodies are decoded.
async function readBytes(file: FileHandle, length: number, position: number): Promise<Buffer | null> {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await file.read(buffer, offset, length - offset, position + offset);
    if (bytesRead === 0) return null;
    offset += bytesRead;
  }
  return buffer;
}

function textHeader(type: string, prefix: Buffer) {
  // ComfyUI SaveImage writes uncompressed PNG tEXt chunks. Current animated
  // PNGs can instead use a private "comf" chunk, including after IDAT.
  const separator = prefix.indexOf(0);
  if (separator < 1 || separator > 79) return null;
  const key = prefix.subarray(0, separator).toString('latin1');

  let valueOffset = separator + 1;
  let compressed = type === 'zTXt';
  if (compressed) {
    if (prefix[valueOffset] !== 0) return null;
    valueOffset++;
  } else if (type === 'iTXt') {
    if (valueOffset + 2 > prefix.length) return null;
    const flag = prefix[valueOffset];
    const method = prefix[valueOffset + 1];
    if ((flag !== 0 && flag !== 1) || method !== 0) return null;
    compressed = flag === 1;
    valueOffset += 2;
    for (let i = 0; i < 2; i++) {
      const end = prefix.indexOf(0, valueOffset);
      if (end < 0) return null;
      valueOffset = end + 1;
    }
  }

  return { key, valueOffset, compressed };
}

function decodeText(value: Buffer, compressed: boolean, maxBytes: number, truncated = false): Buffer | null {
  if (!compressed) return value.length <= maxBytes ? value : null;
  if (maxBytes === 0) return null;
  try {
    return inflateSync(value, {
      finishFlush: truncated ? constants.Z_SYNC_FLUSH : constants.Z_FINISH,
      maxOutputLength: maxBytes,
    });
  } catch {
    return null;
  }
}

type TextChunk = { type: string; length: number; position: number };

async function* textChunks(file: FileHandle): AsyncGenerator<TextChunk, boolean> {
  const { size } = await file.stat();
  if (size < 45 || !(await readBytes(file, 8, 0))?.equals(PNG_SIGNATURE)) return false;

  let position = 8;
  for (let count = 0; count < MAX_CHUNKS && position + 12 <= size; count++) {
    const header = await readBytes(file, 8, position);
    if (!header) return false;
    const length = header.readUInt32BE(0);
    const type = header.toString('ascii', 4, 8);
    if (length > 0x7fffffff || position + length + 12 > size) return false;
    if (count === 0 && (type !== 'IHDR' || length !== 13)) return false;
    if (type === 'IEND') return true;
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt' || type === 'comf') {
      yield { type, length, position: position + 8 };
    }
    position += length + 12;
  }
  return false;
}

export async function hasComfyUiMetadata(path: string): Promise<boolean> {
  const file = await open(path, 'r');
  try {
    for await (const { type, length, position } of textChunks(file)) {
      const prefix = await readBytes(file, Math.min(length, MAX_TEXT_PREFIX), position);
      if (!prefix) return false;
      const header = textHeader(type, prefix);
      if (!header || (header.key !== 'prompt' && header.key !== 'workflow')) continue;
      const value = decodeText(prefix.subarray(header.valueOffset), header.compressed, 1024 * 1024, length > prefix.length);
      if (value?.subarray(0, MAX_TEXT_PREFIX).toString('utf8').trimStart().startsWith('{')) return true;
    }
    return false;
  } finally {
    await file.close();
  }
}

export async function readPngTextMetadata(path: string) {
  const entries: { key: string; value: string; chunk: string }[] = [];
  const file = await open(path, 'r');
  try {
    let remainingInput = MAX_METADATA_BYTES;
    let remainingOutput = MAX_METADATA_BYTES;
    let incomplete = false;
    const chunks = textChunks(file);
    let next = await chunks.next();
    for (; !next.done; next = await chunks.next()) {
      const { type, length, position } = next.value;
      if (length > remainingInput) {
        incomplete = true;
        continue;
      }
      remainingInput -= length;
      const bytes = await readBytes(file, length, position);
      const header = bytes && textHeader(type, bytes);
      const value = bytes && header && decodeText(bytes.subarray(header.valueOffset), header.compressed, remainingOutput);
      if (!value || !header) {
        incomplete = true;
        continue;
      }
      remainingOutput -= value.length;
      entries.push({
        key: header.key,
        value: value.toString(type === 'iTXt' ? 'utf8' : 'latin1'),
        chunk: type,
      });
    }
    // The generator's completion value indicates whether it reached IEND.
    return { entries, incomplete: incomplete || !next.value };
  } finally {
    await file.close();
  }
}
