# imgbae

**imgb** is an image-first, self-hosted browser for local folders and mounted network shares.

## Milestone 1: browse and view

The first PR is deliberately **read-only**:

- Browse folders within one explicitly configured filesystem root
- View a responsive image thumbnail grid and open a larger image preview
- See file sizes, modified times and image dimensions
- Move through image previews with the keyboard
- Page through large directories

There is no delete, rename, write, upload or conversion API in milestone 1.

### Requirements

Node.js 22+ and a local or mounted directory containing images.

### Development

```sh
npm install
IMGB_ROOT=/absolute/path/to/images npm run dev
```

Open http://localhost:5173. The API listens only on `127.0.0.1:3001` by default, and Vite proxies `/api` to it.

If your images live on another LAN machine, **mount the remote share** on the machine running the API (NFS, SMB/CIFS, sshfs, etc.), then point `IMGB_ROOT` to the mount. The app does not require an agent on your NAS.

Optional API environment variables: `IMGB_PORT=3001`, `IMGB_HOST=127.0.0.1`. Do **not** expose the unauthenticated API or Vite development server directly to the internet or an untrusted LAN. Authentication and production deployment are future milestones. Prefer an SSH tunnel for remote testing.

### Build

```sh
npm run typecheck
npm run build
```

Build output is not yet a bundled production deployment; this first milestone is aimed at local development and review.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the explicitly staged features, including ComfyUI provenance badges, metadata management, ImageMagick conversion, resizing, and GPU-accelerated AI upscaling.

## Safety

Every API request must resolve inside the configured library root, including after resolving symlinks. Unsupported files cannot be served through the image endpoint. All milestone-1 routes are read-only. Subsequent destructive operations will require separate review and explicit confirmations.
