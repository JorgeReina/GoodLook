import type { Request, Response } from 'express';
import type { PageLimit } from './pagination.js';

export const PAGE_EXPOSE_HEADERS = 'X-Has-More, Link';

function relativeCatalogPath(req: Request): string {
  const combined = `${req.baseUrl}${req.path}`;
  if (combined.startsWith('/') && !combined.includes('://')) return combined;
  return req.path.startsWith('/') ? req.path : `/${req.path}`;
}

export function applyCatalogPageHeaders(req: Request, res: Response, page: PageLimit, hasMore: boolean) {
  res.setHeader('X-Has-More', hasMore ? 'true' : 'false');
  if (hasMore) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'page' || key === 'limit') continue;
      if (typeof value === 'string') params.set(key, value);
    }
    params.set('page', String(page.page + 1));
    params.set('limit', String(page.limit));
    const path = relativeCatalogPath(req);
    res.setHeader('Link', `<${path}?${params.toString()}>; rel="next"`);
  }
  // Same-origin today (no CORS middleware). Expose so a future CORS layer
  // does not hide these custom headers from the browser.
  res.setHeader('Access-Control-Expose-Headers', PAGE_EXPOSE_HEADERS);
}