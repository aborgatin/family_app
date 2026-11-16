/*
 * Opened files kept on this device (spec #128 "Web caching", D6): one named Cache Storage cache,
 * each file under the URL it was downloaded from, so a Document opened once opens again offline.
 * The cache goes on logout (`clearFileCache`), an entry when its Document is deleted (`forgetFile`,
 * `forgetFilesExcept`). Without Cache Storage (an old browser, a private window that refuses it),
 * nothing is kept and every call is a no-op: the file is downloaded each time.
 */

const FILE_CACHE = 'family-app-documents';

async function openCache(): Promise<Cache | undefined> {
  try {
    return typeof caches === 'undefined' ? undefined : await caches.open(FILE_CACHE);
  } catch {
    return undefined;
  }
}

/** The kept response of the file at `url`, if this device has it. */
export async function cachedFile(url: string): Promise<Response | undefined> {
  const cache = await openCache();
  return cache === undefined ? undefined : cache.match(url).catch(() => undefined);
}

/** Keeps a copy of the file's response (its body is read here: pass a clone). */
export async function keepFile(url: string, response: Response): Promise<void> {
  const cache = await openCache();
  await cache?.put(url, response).catch(() => undefined);
}

/** Forgets the file at `url`. */
export async function forgetFile(url: string): Promise<void> {
  const cache = await openCache();
  await cache?.delete(url).catch(() => undefined);
}

/** Forgets every kept file whose URL `keep` refuses (e.g. a Document deleted meanwhile). */
export async function forgetFilesExcept(keep: (url: string) => boolean): Promise<void> {
  const cache = await openCache();
  if (cache === undefined) return;
  const requests = await cache.keys().catch(() => []);
  await Promise.all(
    requests
      .filter((request) => !keep(request.url))
      .map((request) => cache.delete(request).catch(() => undefined)),
  );
}

/** Forgets every kept file: the whole cache (logout). */
export async function clearFileCache(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') await caches.delete(FILE_CACHE);
  } catch {
    // Nothing kept, or nothing to clear.
  }
}
