export interface User { id: string; email: string; displayName: string; passwordHash: string }
export interface AuthStore {
  createUser(user: User): Promise<boolean>;
  findUserByEmail(email: string): Promise<User | null>;
  createSession(hash: string, userId: string, expiresAt: Date): Promise<void>;
  findUserBySession(hash: string): Promise<User | null>;
  deleteSession(hash: string): Promise<void>;
}
