export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export interface PageLimit {
  page: number;
  limit: number;
  offset: number;
}

function parsePositiveInt(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 1) return null;
    return value;
  }
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return parsed;
}

export function parsePageLimit(query: unknown): PageLimit | null {
  if (query === undefined || query === null) {
    return { page: 1, limit: DEFAULT_PAGE_SIZE, offset: 0 };
  }
  if (typeof query !== 'object' || Array.isArray(query)) return null;
  const record = query as Record<string, unknown>;
  const page = parsePositiveInt(record.page, 1);
  const limit = parsePositiveInt(record.limit, DEFAULT_PAGE_SIZE);
  if (page === null || limit === null || limit > MAX_PAGE_SIZE) return null;
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset) || offset < 0) return null;
  return { page, limit, offset };
}
