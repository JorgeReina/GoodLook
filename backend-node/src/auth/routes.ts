import { Router, type Request } from 'express';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { AuthStore, User } from './store.js';
const scrypt = promisify(scryptCallback);
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const publicUser = (u: User) => ({ id: u.id, email: u.email, displayName: u.displayName });
const cookieName = 'goodlook_session';
// Fixed valid scrypt hash performs the same password derivation for unknown emails.
const dummyHash = 'scrypt$00000000000000000000000000000000$2d17eadb8871aa8a7d33250168f8b81e3f06fb342ae6af3f3a3e90cd11c3cffa4f159ae7d123845c625cafa74faab0c632d07555b0da6367de3e36da63213e9b';
const cookie = (token: string, age: number) => `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const readToken = (header: string | undefined) => {
  const values = (header ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(cookieName + '='));
  if (values.length !== 1) return null;
  const value = values[0].slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
};
export async function sessionUser(req: Request, store: AuthStore): Promise<User | null> {
  const token = readToken(req.headers.cookie);
  return token ? store.findUserBySession(tokenHash(token)) : null;
}
const validEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validPassword = (v: unknown): v is string => typeof v === 'string' && v.length >= 10 && v.length <= 128;
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}
async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, hex, ...rest] = stored.split('$');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(hex ?? '') || rest.length) return false;
  const key = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(hex, 'hex'));
}
export function authRoutes(store: AuthStore, allowedOrigin: string): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.headers.origin !== allowedOrigin) { res.status(403).json({ error: 'Forbidden origin' }); return; }
    next();
  });
  router.post('/register', async (req, res) => {
    const { email, password, displayName } = req.body ?? {};
    if (!validEmail(email) || !validPassword(password) || typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 120) { res.status(400).json({error:'Invalid input'}); return; }
    const user: User = { id: randomUUID(), email: email.toLowerCase(), displayName: displayName.trim(), passwordHash: await hashPassword(password) };
    if (!await store.createUser(user)) { res.status(409).json({error:'Account already exists'}); return; }
    res.status(201).json(publicUser(user));
  });
  router.post('/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!validEmail(email) || !validPassword(password)) { res.status(400).json({error:'Invalid input'}); return; }
    const user = await store.findUserByEmail(email.toLowerCase());
    const passwordMatches = await checkPassword(password, user?.passwordHash ?? dummyHash);
    if (!user || !passwordMatches) { res.status(401).json({error:'Invalid credentials'}); return; }
    const token = randomBytes(32).toString('hex');
    const seconds = 60 * 60 * 24;
    await store.createSession(tokenHash(token), user.id, new Date(Date.now() + seconds * 1000));
    res.setHeader('Set-Cookie', cookie(token, seconds));
    res.json(publicUser(user));
  });
  router.get('/me', async (req, res) => {
    const user = await sessionUser(req, store);
    if (!user) { res.status(401).json({error:'Unauthorized'}); return; }
    res.json(publicUser(user));
  });
  router.post('/logout', async (req, res) => {
    const token = readToken(req.headers.cookie);
    if (token) await store.deleteSession(tokenHash(token));
    res.setHeader('Set-Cookie', cookie('', 0));
    res.status(204).end();
  });
  return router;
}
