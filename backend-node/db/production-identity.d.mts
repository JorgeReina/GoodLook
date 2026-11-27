export interface DatabaseIdentity {
  host: string;
  database: string;
  user: string;
  engine?: 'mysql' | 'mariadb';
}

export type DataRole = 'development' | 'preview' | 'production' | 'undeclared';

export function parseDatabaseIdentity(value: unknown): DatabaseIdentity | null;
export function parseProductionDatabase(value: unknown): DatabaseIdentity | null;
export function readProductionDatabase(): DatabaseIdentity | null;
export function readPreviewDatabase(): DatabaseIdentity | null;
export function isLoopbackHost(host: string): boolean;
export function matchesProductionDatabase(candidate: DatabaseIdentity, production: DatabaseIdentity | null): boolean;
export function matchesDatabaseIdentity(candidate: DatabaseIdentity, expected: DatabaseIdentity | null): boolean;
export function resolveDataRole(env: NodeJS.ProcessEnv): DataRole;
export function assertDatabaseIsolation(
  env: NodeJS.ProcessEnv,
  identity: DatabaseIdentity,
  production: DatabaseIdentity | null,
  preview?: DatabaseIdentity | null,
): DataRole;
