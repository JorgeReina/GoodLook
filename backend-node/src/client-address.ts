import { isIP } from 'node:net';

/** Subset of an incoming request used to choose a rate-limit address. */
export interface ClientAddressRequest {
  socket: { remoteAddress?: string | undefined };
  headers: NodeJS.Dict<string | string[] | undefined>;
}

function parseIpv6(value: string): number[] | null {
  const halves = value.toLowerCase().split('::');
  if (halves.length > 2) return null;
  const parseSide = (side: string): number[] | null => {
    if (side === '') return [];
    const parts = side.split(':');
    const groups: number[] = [];
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (part.includes('.')) {
        if (index !== parts.length - 1) return null;
        const octets = part.split('.');
        if (octets.length !== 4 || octets.some(octet => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)) return null;
        const numbers = octets.map(Number);
        groups.push((numbers[0] << 8) | numbers[1], (numbers[2] << 8) | numbers[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      groups.push(Number.parseInt(part, 16));
    }
    return groups;
  };
  const left = parseSide(halves[0]);
  const right = halves.length === 2 ? parseSide(halves[1]) : [];
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  if (left.length + right.length > 7) return null;
  return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right];
}

/** RFC 5952 text, or the embedded IPv4 when the address is IPv4-mapped. */
function canonicalIp(groups: number[]): string {
  if (!groups[0] && !groups[1] && !groups[2] && !groups[3] && !groups[4] && groups[5] === 0xffff) {
    const high = groups[6];
    const low = groups[7];
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < groups.length; index += 1) {
    if (groups[index] !== 0) continue;
    const start = index;
    while (index < groups.length && groups[index] === 0) index += 1;
    const length = index - start;
    if (length > bestLength) { bestStart = start; bestLength = length; }
  }
  const text = groups.map(group => group.toString(16));
  if (bestLength < 2) return text.join(':');
  return `${text.slice(0, bestStart).join(':')}::${text.slice(bestStart + bestLength).join(':')}`;
}

function normalize(value: string): string | null {
  const trimmed = value.trim();
  if (isIP(trimmed) === 4) return trimmed;
  if (isIP(trimmed) !== 6) return null;
  const groups = parseIpv6(trimmed);
  return groups ? canonicalIp(groups) : null;
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
 * IPv4-mapped addresses are stored as IPv4. Other IPv6 addresses use RFC 5952.
 */
export function clientAddress(req: ClientAddressRequest, env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.VERCEL !== '1') return req.socket.remoteAddress ? normalize(req.socket.remoteAddress) : null;
  const parts = headerText(req.headers, 'x-vercel-forwarded-for').split(',').map(part => part.trim()).filter(part => part.length > 0);
  if (parts.length < 1) return null;
  const addresses = parts.map(normalize);
  if (addresses.some(address => address === null)) return null;
  return addresses[0];
}
