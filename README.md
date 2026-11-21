# imgbae

**imgbae** is an image-first, self-hosted browser for local folders and mounted network shares.

## Milestone 1: browse and view

The first PR is deliberately **read-only**:

- Browse folders within one explicitly configured filesystem root
- View a responsive image thumbnail grid and open a larger image preview
- See file sizes, modified times and image dimensions
- Move through image previews with the keyboard
- Page through large directories
- Show a ComfyUI metadata indicator for PNGs containing recognizable embedded prompt or workflow fields (read-only, bounded metadata reads)

There is no delete, rename, write, upload or conversion API in milestone 1.

### Requirements

Node.js 22+ and a local or mounted directory containing images.

### Development

```sh
npm install
IMGBAE_ROOT=/absolute/path/to/images npm run dev
```

Open http://localhost:5173. By default, both services listen on loopback only: the API at `127.0.0.1:3001` and the Vite frontend at `127.0.0.1:5173`. Vite proxies `/api` to the loopback API.

To use the browser from another machine on your trusted home LAN, bind **only the frontend** to the server's specific private LAN IPv4 address:

```sh
IMGBAE_ROOT=/absolute/path/to/images IMGBAE_WEB_HOST=192.168.1.50 npm run dev
```

Replace `192.168.1.50` with the actual address on the machine running imgbae. From another LAN device, open `http://192.168.1.50:5173`. The API should remain bound to `127.0.0.1`; only port 5173 needs to be reachable across the trusted LAN. Configure any host firewall to allow it **only from the trusted local subnet**.

The server refuses wildcard (`0.0.0.0`) and public-IP bindings for both API and development frontend. These checks reduce accidental exposure, but **cannot defeat router port-forwarding, a publicly reachable reverse proxy, a tunnel, or an insecure host firewall**. Do not enable those routes. The initial read-only app has no authentication, so every permitted LAN user can view the library. Require authentication and authorization **before** enabling rename, move, delete or metadata writes. See [network-access guidance](docs/NETWORK_ACCESS.md).

If your images live on another LAN machine, **mount the remote share** on the machine running the API (NFS, SMB/CIFS, sshfs, etc.), then point `IMGBAE_ROOT` to the mount. The app does not require an agent on your NAS. Current development targets local disks, so share performance hasn't been tested yet; see [docs/NETWORK_SHARES.md](docs/NETWORK_SHARES.md).

When upgrading an existing deployment, update its exported configuration variables to the `IMGBAE_` names; the previous names are no longer recognized. If `IMGBAE_PORT` is changed, the development frontend will proxy to that same API port.

Optional API environment variables: `IMGBAE_PORT=3001`, `IMGBAE_HOST=127.0.0.1`. Prefer keeping the API on loopback and using the web proxy for trusted-LAN access. Do **not** expose the unauthenticated API or development server to the internet or an untrusted LAN. Authentication and production deployment are separate milestones. Prefer an SSH tunnel for remote access outside your home LAN.

### Build

```sh
npm ci
npm run typecheck
npm run test
npm run build
```

Build output is not yet a bundled production deployment; this first milestone is aimed at local development and review.

## Roadmap

See [docs/COMFYUI_METADATA.md](docs/COMFYUI_METADATA.md) for how the embedded ComfyUI metadata indicator works and its detection limits. See [docs/AI_DEVELOPMENT.md](docs/AI_DEVELOPMENT.md) for decision and review evidence.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the explicitly staged features, including ComfyUI metadata indicators, metadata management, ImageMagick conversion, resizing, and GPU-accelerated AI upscaling.

## Safety

Every API request must resolve inside the configured library root, including after resolving symlinks. Unsupported files cannot be served through the image endpoint. All milestone-1 routes are read-only. Subsequent destructive operations will require separate review and explicit confirmations.
