import { open, type FileHandle } from 'node:fs/promises';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_CHUNKS = 256;
const MAX_TEXT_PREFIX = 1024;

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

function metadataTag(type: string, prefix: Buffer): 'prompt' | 'workflow' | null {
  // ComfyUI SaveImage writes uncompressed PNG tEXt chunks. Current animated
  // PNGs can instead use a private "comf" chunk, including after IDAT.
  if (type !== 'tEXt' && type !== 'iTXt' && type !== 'comf') return null;
  const separator = prefix.indexOf(0);
  if (separator < 1 || separator > 79) return null;
  const key = prefix.subarray(0, separator).toString('latin1');
  if (key !== 'prompt' && key !== 'workflow') return null;

  let valueOffset = separator + 1;
  if (type === 'iTXt') {
    if (valueOffset + 2 > prefix.length) return null;
    const compressed = prefix[valueOffset];
    const method = prefix[valueOffset + 1];
    if (compressed !== 0 || method !== 0) return null;
    valueOffset += 2;
    for (let i = 0; i < 2; i++) {
      const end = prefix.indexOf(0, valueOffset);
      if (end < 0) return null;
      valueOffset = end + 1;
    }
  }

  // Checking a short prefix instead of decoding potentially megabytes of
  // untrusted workflow JSON keeps folder browsing affordable on SMB/NFS.
  const value = prefix.subarray(valueOffset).toString('utf8').trimStart();
  return value.startsWith('{') ? key : null;
}

/**
 * True means at least one recognizable ComfyUI PNG metadata field was found.
 * No claim is made about whether image pixels are original or transformed.
 */
export async function hasComfyUiMetadata(path: string): Promise<boolean> {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    if (size < 8 + 12 + 13 + 12) return false;

    const signature = await readBytes(file, 8, 0);
    if (!signature?.equals(PNG_SIGNATURE)) return false;

    let position = 8;
    let seenHeader = false;

    for (let count = 0; count < MAX_CHUNKS && position + 12 <= size; count++) {
      const header = await readBytes(file, 8, position);
      if (!header) return false;
      const length = header.readUInt32BE(0);
      const type = header.subarray(4, 8).toString('ascii');
      if (length > 0x7fffffff || position + length + 12 > size) return false;
      if (!seenHeader) {
        if (type !== 'IHDR' || length !== 13) return false;
        seenHeader = true;
      }

      if (type === 'tEXt' || type === 'iTXt' || type === 'comf') {
        const prefix = await readBytes(file, Math.min(length, MAX_TEXT_PREFIX), position + 8);
        if (!prefix) return false;
        if (metadataTag(type, prefix)) return true;
      }

      position += length + 12; // skip IDAT/image data and the chunk CRC
      if (type === 'IEND') break;
    }
    return false;
  } finally {
    await file.close();
  }
}
