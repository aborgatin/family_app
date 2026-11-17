/*
 * Cache Storage for tests (jsdom has none): the global `caches` in every test, empty at the start
 * of each (`setup.ts`). Like a browser's, it keeps whole responses by request URL in named caches;
 * a test reads what is kept with `fakeCaches.cacheNames()` and `fakeCaches.urls(name)`.
 */

function urlOf(request: RequestInfo | URL): string {
  if (typeof request === 'string') return new URL(request, window.location.origin).href;
  return request instanceof URL ? request.href : request.url;
}

class FakeCache {
  readonly responses = new Map<string, { body: ArrayBuffer; init: ResponseInit }>();

  match(request: RequestInfo | URL): Promise<Response | undefined> {
    const kept = this.responses.get(urlOf(request));
    return Promise.resolve(
      kept === undefined ? undefined : new Response(kept.body.slice(0), kept.init),
    );
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    const body = await response.arrayBuffer();
    this.responses.set(urlOf(request), {
      body,
      init: { status: response.status, headers: [...response.headers.entries()] },
    });
  }

  delete(request: RequestInfo | URL): Promise<boolean> {
    return Promise.resolve(this.responses.delete(urlOf(request)));
  }

  keys(): Promise<Request[]> {
    return Promise.resolve([...this.responses.keys()].map((url) => new Request(url)));
  }
}

class FakeCacheStorage {
  private readonly named = new Map<string, FakeCache>();

  open(name: string): Promise<FakeCache> {
    let cache = this.named.get(name);
    if (cache === undefined) {
      cache = new FakeCache();
      this.named.set(name, cache);
    }
    return Promise.resolve(cache);
  }

  has(name: string): Promise<boolean> {
    return Promise.resolve(this.named.has(name));
  }

  delete(name: string): Promise<boolean> {
    return Promise.resolve(this.named.delete(name));
  }

  keys(): Promise<string[]> {
    return Promise.resolve([...this.named.keys()]);
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    for (const cache of this.named.values()) {
      const found = await cache.match(request);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  /** The names of the caches there are now. */
  cacheNames(): string[] {
    return [...this.named.keys()];
  }

  /** The request URLs kept in the named cache (none when there is no such cache). */
  urls(name: string): string[] {
    return [...(this.named.get(name)?.responses.keys() ?? [])];
  }

  reset() {
    this.named.clear();
  }
}

export const fakeCaches = new FakeCacheStorage();

/** Makes `fakeCaches` the global `caches`. */
export function installCacheStorage() {
  globalThis.caches = fakeCaches as unknown as CacheStorage;
}
