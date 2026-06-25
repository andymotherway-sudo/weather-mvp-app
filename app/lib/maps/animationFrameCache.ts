import * as FileSystem from 'expo-file-system/legacy';

const CACHE_FOLDER = 'omniwx-atmospheric-frames';
const MAX_CACHE_FILES = 36;
const MAX_CACHE_AGE_MS = 6 * 60 * 60_000;
const MAX_CONCURRENT_DOWNLOADS = 3;

const inFlight = new Map<string, Promise<string>>();
let lastPruneAt = 0;
let activeDownloads = 0;
const downloadWaiters: (() => void)[] = [];

async function acquireDownloadSlot() {
  if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
    activeDownloads += 1;
    return;
  }
  await new Promise<void>((resolve) => downloadWaiters.push(resolve));
  activeDownloads += 1;
}

function releaseDownloadSlot() {
  activeDownloads = Math.max(0, activeDownloads - 1);
  downloadWaiters.shift()?.();
}

function shortHash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function cacheRoot() {
  const root = FileSystem.cacheDirectory;
  return root ? `${root}${CACHE_FOLDER}/` : null;
}

async function ensureCacheRoot() {
  const root = cacheRoot();
  if (!root) throw new Error('Animation cache is unavailable');
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  }
  return root;
}

async function pruneCache(root: string) {
  const now = Date.now();
  if (now - lastPruneAt < 10 * 60_000) return;
  lastPruneAt = now;

  try {
    const names = await FileSystem.readDirectoryAsync(root);
    const files = (
      await Promise.all(
        names
          .filter((name) => name.endsWith('.png'))
          .map(async (name) => {
            const uri = `${root}${name}`;
            const info = await FileSystem.getInfoAsync(uri);
            return {
              uri,
              modified:
                info.exists && typeof (info as { modificationTime?: number }).modificationTime === 'number'
                  ? (info as { modificationTime: number }).modificationTime * 1000
                  : 0,
            };
          }),
      )
    ).sort((a, b) => b.modified - a.modified);

    await Promise.all(
      files
        .filter((file, index) => index >= MAX_CACHE_FILES || (file.modified > 0 && now - file.modified > MAX_CACHE_AGE_MS))
        .map((file) => FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => undefined)),
    );
  } catch {
    // Cache maintenance must never interrupt map playback.
  }
}

export async function cacheAtmosphericFrame(remoteUrl: string) {
  const existingRequest = inFlight.get(remoteUrl);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const root = await ensureCacheRoot();
    void pruneCache(root);

    const finalUri = `${root}${shortHash(remoteUrl)}.png`;
    const existing = await FileSystem.getInfoAsync(finalUri);
    if (existing.exists && (existing.size ?? 0) > 0) return finalUri;

    const tempUri = `${root}${shortHash(`${remoteUrl}:${Date.now()}`)}.tmp`;
    await acquireDownloadSlot();
    try {
      const result = await FileSystem.downloadAsync(remoteUrl, tempUri);
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Frame download failed (${result.status})`);
      }

      const downloaded = await FileSystem.getInfoAsync(tempUri);
      if (!downloaded.exists || (downloaded.size ?? 0) <= 0) {
        throw new Error('Frame download was empty');
      }

      await FileSystem.moveAsync({ from: tempUri, to: finalUri });
      return finalUri;
    } catch (error) {
      await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => undefined);
      throw error;
    } finally {
      releaseDownloadSlot();
    }
  })();

  inFlight.set(remoteUrl, request);
  try {
    return await request;
  } finally {
    inFlight.delete(remoteUrl);
  }
}
