import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { isIP } from 'node:net';
import { env } from 'node:process';

// Bind to a specific local/private interface, never a wildcard or public IP.
// This is not a replacement for host firewall rules or authentication.
function permittedHost(host: string): boolean {
  if (host === '::1') return true;
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split('.').map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

const host = env.IMGBAE_WEB_HOST?.trim() || '127.0.0.1';
if (!permittedHost(host)) {
  throw new Error('IMGBAE_WEB_HOST must be loopback or a specific private IPv4 address (not 0.0.0.0 or a public address).');
}

// Keep the development proxy in sync when the API port is overridden.
const apiPort = Number(env.IMGBAE_PORT || '3001');
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
  throw new Error('IMGBAE_PORT must be an integer between 1 and 65535.');
}

export default defineConfig({
  plugins: [react()],
  server: {
    host,
    port: 5173,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
});
