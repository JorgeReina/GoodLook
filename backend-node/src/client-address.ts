import { isIP, SocketAddress } from 'node:net';

/** Subset of an incoming request used to choose a rate-limit address. */
export interface ClientAddressRequest {
  socket: { remoteAddress?: string | undefined };
  headers: NodeJS.Dict<string | string[] | undefined>;
}

function socketAddress(value: string, family: 'ipv4' | 'ipv6'): string | null {
  try { return new SocketAddress({ address: value, family }).address; }
  catch { return null; }
}

/** Expands the canonical text Node already produced. Untrusted input is not parsed here. */
function expandCanonical(canonical: string): number[] | null {
  const halves = canonical.split('::');
  if (halves.length > 2) return null;
  const read = (side: string): number[] | null => {
    if (side === '') return [];
    const groups: number[] = [];
    for (const part of side.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      groups.push(Number.parseInt(part, 16));
    }
    return groups;
  };
  const left = read(halves[0]);
  const right = halves.length === 2 ? read(halves[1]) : [];
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  if (left.length + right.length > 7) return null;
  return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right];
}

function normalize(value: string): string | null {
  const trimmed = value.trim();
  const version = isIP(trimmed);
  if (version === 4) return socketAddress(trimmed, 'ipv4');
  if (version !== 6) return null;
  const canonical = socketAddress(trimmed, 'ipv6');
  if (!canonical) return null;
  if (canonical.startsWith('::ffff:')) {
    const mapped = canonical.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return mapped;
  }
  const groups = expandCanonical(canonical);
  if (!groups || groups.length !== 8) return null;
  const network = `${groups.slice(0, 4).map(group => group.toString(16)).join(':')}::`;
  return socketAddress(network, 'ipv6');
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
 * Node's SocketAddress accepts the text. IPv4, including IPv4-mapped addresses,
 * stay a single address. Other IPv6 keys are the canonical /64 prefix.
 */
export function clientAddress(req: ClientAddressRequest, env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.VERCEL !== '1') return req.socket.remoteAddress ? normalize(req.socket.remoteAddress) : null;
  const parts = headerText(req.headers, 'x-vercel-forwarded-for').split(',').map(part => part.trim()).filter(part => part.length > 0);
  if (parts.length < 1) return null;
  const addresses = parts.map(normalize);
  if (addresses.some(address => address === null)) return null;
  return addresses[0];
}
