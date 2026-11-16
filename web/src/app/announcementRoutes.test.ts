import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './routes';

// The web half of the Announcement catalog guard (spec #120 "Testing Decisions", D3): every `url`
// in the backend's catalog is a screen of this app's router, so a tap never opens a blank page. The
// backend's AnnouncementCatalogFileTest checks ids, lengths and the `/` prefix. The web CI job's
// path filter includes the catalog file, so a catalog-only change runs this test.
const CATALOG = resolve(
  import.meta.dirname,
  '../../../backend/src/main/resources/announcements.json',
);

interface CatalogEntry {
  id: string;
  url?: string;
}

const entries = JSON.parse(readFileSync(CATALOG, 'utf8')) as CatalogEntry[];

function isScreen(url: string): boolean {
  const { pathname } = new URL(url, 'https://family.invalid');
  return matchRoutes(routes, pathname) !== null;
}

describe('the Announcement catalog', () => {
  it('opens only screens the app has', () => {
    const unknown = entries.filter((e) => e.url !== undefined && !isScreen(e.url)).map((e) => e.id);

    expect(unknown).toEqual([]);
  });
});
