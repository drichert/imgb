# Local network access and default-deny exposure

The current development environment is not a hardened production server. It is intended for a trusted home LAN only.

## Defaults

- Web interface (Vite): binds to `127.0.0.1:5173` unless `IMGBAE_WEB_HOST` selects a specific private LAN IPv4 address.
- Fastify API: binds to `127.0.0.1:3001` unless explicitly configured. Keep it on loopback; Vite proxies `/api` to it.
- Both processes reject wildcard and public-address host bindings. Hostnames and public IPs are not accepted. `::1` is accepted for local-only use.
- Neither process configures router port forwarding, UPnP, a public proxy, or a cloud tunnel.
- All browse/image APIs are currently read-only, **but image contents and metadata are visible to anyone who can connect**. Do not share with an untrusted LAN.

## Trusted-LAN development access

1. Identify the machine's private LAN IPv4 address (for example, `192.168.1.50`).
2. Run `IMGBAE_ROOT=/absolute/path/to/images IMGBAE_WEB_HOST=192.168.1.50 npm run dev`.
3. Open `http://192.168.1.50:5173` on another device on that LAN. Leave `IMGBAE_HOST` unset so the API stays on loopback.
4. If a host firewall is enabled, permit inbound TCP 5173 only from the trusted LAN CIDR, not from all sources. Do not create router port forwarding or UPnP exceptions.
5. On a separate network (such as cellular), the service should not respond. This is a manual deployment check, not a security guarantee.

Binding to a private interface is **not** itself source-IP authorization. NAT port forwarding can make a private interface publicly reachable. A reverse proxy or VPN can also change what appears local. The router and firewall must enforce the network boundary. An application IP allowlist may be useful later but is not a substitute for authentication.

## Future destructive operations

Before rename, move, permanent deletion, batch edits or metadata writes become available over LAN:

- Require real authentication and per-request authorization (not just checking an HTTP Origin header).
- Restrict write operations to explicitly permitted library roots, and re-check file identities and symlink boundaries immediately before mutation.
- Require specific confirmation for permanent deletions; never silently send to trash or perform overwrites.
- Keep the API bound to loopback behind a deliberately configured authenticated frontend or gateway.
- Include tests for unauthorized access, cross-root traversal, symlinks, and destructive action confirmation.

## Verification checklist (manual)

- [ ] Default dev processes listen only on 127.0.0.1.
- [ ] Setting `IMGBAE_WEB_HOST` to the machine's specific private IPv4 binds only that interface.
- [ ] `IMGBAE_WEB_HOST=0.0.0.0` and `IMGBAE_HOST=0.0.0.0` fail with a clear error.
- [ ] An ordinary browser on the trusted LAN can browse images only after explicit LAN binding.
- [ ] A client outside the trusted LAN cannot reach the service under the configured router/firewall rules.
- [ ] No delete/mutation routes exist in this milestone.

These items require testing on the actual deployment machine and network. A code review alone is not proof that the router/firewall is correctly configured.
