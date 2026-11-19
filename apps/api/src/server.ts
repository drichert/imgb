import fastify from 'fastify';
import sharp from 'sharp';
import { createReadStream } from 'node:fs';
import { lstat, realpath, readdir } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const imageMime: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.bmp': 'image/bmp', '.heic': 'image/heic', '.heif': 'image/heif',
};

type Item = {
  name: string;
  path: string;
  kind: 'directory' | 'image' | 'file';
  size: number;
  modifiedAt: string;
};
type BrowseQuery = { path?: string; page?: string };
type PathQuery = { path?: string };

class ForbiddenPath extends Error {}

function isWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}

function publicPath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/');
}

async function main(): Promise<void> {
  const configuredRoot = process.env.IMGB_ROOT;
  if (!configuredRoot || !isAbsolute(configuredRoot)) {
    throw new Error('IMGB_ROOT must be an absolute path to your images or mounted share.');
  }
  const root = await realpath(configuredRoot);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) throw new Error('IMGB_ROOT must refer to a directory.');

  async function resolveSafe(input: string | undefined): Promise<string> {
    if ((input ?? '').length > 4096 || (input ?? '').includes('\0')) {
      throw new ForbiddenPath('Invalid path');
    }
    const target = await realpath(resolve(root, input || '.'));
    if (!isWithinRoot(root, target)) throw new ForbiddenPath('Path is outside library root');
    return target;
  }

  async function imageFile(path: string | undefined): Promise<{ file: string; mime: string }> {
    if (!path) throw new ForbiddenPath('Missing image path');
    const file = await resolveSafe(path);
    const mime = imageMime[extname(file).toLowerCase()];
    if (!mime || !(await lstat(file)).isFile()) throw new ForbiddenPath('Not a supported image');
    return { file, mime };
  }

  const app = fastify({ logger: true });
  app.setErrorHandler((error, request, reply) => {
    const code = (error as NodeJS.ErrnoException).code;
    if (error instanceof ForbiddenPath) {
      void reply.code(403).send({ error: error.message });
    } else if (code === 'ENOENT' || code === 'ENOTDIR') {
      void reply.code(404).send({ error: 'Not found' });
    } else {
      request.log.error(error);
      void reply.code(500).send({ error: 'Unable to read the requested file' });
    }
  });

  app.get('/api/health', async () => ({ ok: true }));

  app.get<{ Querystring: BrowseQuery }>('/api/browse', async (request) => {
    const dir = await resolveSafe(request.query.path);
    if (!(await lstat(dir)).isDirectory()) throw new ForbiddenPath('Not a directory');

    const pageSize = 96;
    const rawPage = Number(request.query.page ?? '0');
    const page = Number.isSafeInteger(rawPage) ? Math.max(0, Math.min(rawPage, 100000)) : 0;
    const entries = (await readdir(dir, { withFileTypes: true }))
      // Deliberately exclude symlinks in v1; the root itself may be a symlink.
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .map((entry) => ({
        entry,
        kind: entry.isDirectory()
          ? 'directory' as const
          : imageMime[extname(entry.name).toLowerCase()]
            ? 'image' as const : 'file' as const,
      }))
      .sort((a, b) =>
        (a.kind === 'directory' ? 0 : 1) - (b.kind === 'directory' ? 0 : 1)
        || a.entry.name.localeCompare(b.entry.name, undefined, { numeric: true, sensitivity: 'base' })
      );

    const slice = entries.slice(page * pageSize, (page + 1) * pageSize);
    const values = await Promise.all(slice.map(async ({ entry, kind }): Promise<Item | null> => {
      const file = join(dir, entry.name);
      try {
        const stat = await lstat(file);
        if (!stat.isDirectory() && !stat.isFile()) return null;
        return {
          name: entry.name, path: publicPath(root, file), kind,
          size: stat.size, modifiedAt: stat.mtime.toISOString(),
        };
      } catch {
        // The directory may change while it is being listed.
        return null;
      }
    }));

    return {
      path: publicPath(root, dir),
      page, pageSize, total: entries.length,
      hasMore: (page + 1) * pageSize < entries.length,
      items: values.filter((value): value is Item => value !== null),
    };
  });

  app.get<{ Querystring: PathQuery }>('/api/details', async (request) => {
    const { file } = await imageFile(request.query.path);
    const [stat, metadata] = await Promise.all([lstat(file), sharp(file).metadata()]);
    return {
      path: publicPath(root, file),
      name: file.split(sep).pop(),
      size: stat.size, modifiedAt: stat.mtime.toISOString(),
      width: metadata.width ?? null, height: metadata.height ?? null,
      format: metadata.format ?? null, orientation: metadata.orientation ?? null,
      pages: metadata.pages ?? null,
    };
  });

  app.get<{ Querystring: PathQuery }>('/api/thumbnail', async (request, reply) => {
    const { file } = await imageFile(request.query.path);
    const buffer = await sharp(file, { animated: false })
      .rotate()
      .resize({ width: 360, height: 260, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 76 })
      .toBuffer();
    return reply.type('image/webp').header('Cache-Control', 'private, max-age=300').send(buffer);
  });

  // Preview unsupported browser formats without changing the original.
  app.get<{ Querystring: PathQuery }>('/api/preview', async (request, reply) => {
    const { file } = await imageFile(request.query.path);
    const buffer = await sharp(file, { animated: false })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();
    return reply.type('image/webp').header('Cache-Control', 'private, max-age=300').send(buffer);
  });

  app.get<{ Querystring: PathQuery }>('/api/image', async (request, reply) => {
    const { file, mime } = await imageFile(request.query.path);
    return reply.type(mime).header('Cache-Control', 'private, max-age=300').send(createReadStream(file));
  });

  const port = Number(process.env.IMGB_PORT || '3001');
  const host = process.env.IMGB_HOST || '127.0.0.1';
  await app.listen({ port, host });
  app.log.info({ root }, 'Serving read-only image library');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
