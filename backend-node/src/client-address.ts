import { isIP } from 'node:net';

/** Subset of an incoming request used to choose a rate-limit address. */
export interface ClientAddressRequest {
  socket: { remoteAddress?: string | undefined };
  headers: NodeJS.Dict<string | string[] | undefined>;
}

function normalize(value: string): string | null {
  const trimmed = value.trim();
  const withoutMapping = /^::ffff:/i.test(trimmed) ? trimmed.slice('::ffff:'.length) : trimmed;
  const candidate = withoutMapping.includes(':') ? withoutMapping.toLowerCase() : withoutMapping;
  return isIP(candidate) ? candidate : null;
}

function headerText(headers: ClientAddressRequest['headers'], name: string): string {
  const value = headers[name];
  if (Array.isArray(value)) return value.join(',');
  return typeof value === 'string' ? value : '';
}

/**
 * Address keyed by the access and availability limiters.
 * Outside Vercel only the TCP peer counts. On a Vercel deployment (`VERCEL=1`)
 * only `x-vercel-forwarded-for` counts: the edge overwrites client forwarding
 * headers, and this one stays the address Vercel observed. Any other header,
 * including `X-Forwarded-For`, is ignored. A missing or malformed platform
 * address fails closed (null) instead of falling back to the shared proxy socket.
 * The key is the leftmost address; every comma-separated token must be an IP.
 */
export function clientAddress(req: ClientAddressRequest, env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.VERCEL !== '1') return req.socket.remoteAddress ? normalize(req.socket.remoteAddress) : null;
  const parts = headerText(req.headers, 'x-vercel-forwarded-for').split(',').map(part => part.trim()).filter(part => part.length > 0);
  if (parts.length < 1) return null;
  const addresses = parts.map(normalize);
  if (addresses.some(address => address === null)) return null;
  return addresses[0];
}
