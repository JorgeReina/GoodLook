import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { AuthStore, User } from './store.js';
interface UserRow extends RowDataPacket { id: string; email: string; display_name: string; password_hash: string }
const userFrom = (r: UserRow): User => ({ id: r.id, email: r.email, displayName: r.display_name, passwordHash: r.password_hash });
export class MysqlAuthStore implements AuthStore {
  constructor(private readonly pool: Pool) {}
  async createUser(user: User): Promise<boolean> {
    try {
      await this.pool.execute('INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))', [user.id, user.email, user.passwordHash, user.displayName]);
      return true;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') return false;
      throw error;
    }
  }
  async findUserByEmail(email: string): Promise<User | null> {
    const [rows] = await this.pool.execute<UserRow[]>('SELECT id, email, display_name, password_hash FROM users WHERE email = ? LIMIT 1', [email]);
    return rows[0] ? userFrom(rows[0]) : null;
  }
  async createSession(hash: string, userId: string, expiresAt: Date): Promise<void> {
    await this.pool.execute('INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))', [hash, userId, expiresAt]);
  }
  async findUserBySession(hash: string): Promise<User | null> {
    const [rows] = await this.pool.execute<UserRow[]>('SELECT u.id, u.email, u.display_name, u.password_hash FROM auth_sessions s INNER JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) LIMIT 1', [hash]);
    return rows[0] ? userFrom(rows[0]) : null;
  }
  async deleteSession(hash: string): Promise<void> { await this.pool.execute('DELETE FROM auth_sessions WHERE token_hash = ?', [hash]); }
}
