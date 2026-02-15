// app/lib/noaa/noaaRateLimiter.ts
// Global single-flight queue + conservative spacing + 429 cooldown.
//
// NOAA may say "5/sec" but real-world behavior (mobile, paging, multi-hook bursts)
// is much happier at ~1 req/sec with a shared cooldown on 429.

const MIN_SPACING_MS = 1000; // ✅ stabilize at ~1 req/sec
const JITTER_MS = 250;       // ✅ spread bursts a bit

let chain = Promise.resolve();

// We space from the last FINISH so slow requests naturally reduce rate.
let lastFinish = 0;

// Global cooldown (e.g., after 429 / Retry-After)
let blockedUntil = 0;

// Track consecutive 429s to escalate cooldown a bit if NOAA is unhappy
let consecutive429 = 0;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number) {
  if (ms <= 0) return 0;
  return Math.floor(Math.random() * Math.min(JITTER_MS, ms));
}

function parseRetryAfterSeconds(retryAfter: any): number | null {
  if (retryAfter == null) return null;

  // number (seconds)
  const n = Number(String(retryAfter).trim());
  if (Number.isFinite(n) && n >= 0) return Math.min(60, n);

  // HTTP date
  const ms = Date.parse(String(retryAfter));
  if (!Number.isFinite(ms)) return null;

  const deltaSec = Math.ceil((ms - Date.now()) / 1000);
  if (!Number.isFinite(deltaSec)) return null;
  return Math.max(0, Math.min(60, deltaSec));
}

function looksLike429(err: any) {
  const status = Number(err?.status ?? err?.details?.status);
  if (status === 429) return true;

  const msg = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
  return msg.includes('http 429') || msg.includes('"status":"429"') || msg.includes('rate limit') || msg.includes('429');
}

function extractRetryAfterSec(err: any): number | null {
  // you already attach retryAfterSec in some places
  const ra1 = err?.retryAfterSec;
  if (typeof ra1 === 'number' && Number.isFinite(ra1) && ra1 >= 0) return Math.min(60, ra1);

  // sometimes you may have headers on the error
  const ra2 = err?.retryAfter ?? err?.headers?.['retry-after'] ?? err?.headers?.get?.('retry-after');
  return parseRetryAfterSeconds(ra2);
}

export async function noaaSchedule<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const now = Date.now();

    // Wait for spacing since last finish, plus any global block
    const waitForSpacing = Math.max(0, MIN_SPACING_MS - (now - lastFinish));
    const waitForBlock = Math.max(0, blockedUntil - now);

    // Add a little jitter so queued bursts don't line up into a predictable pattern
    const wait = Math.max(waitForSpacing, waitForBlock) + jitter(waitForSpacing);

    if (wait > 0) await sleep(wait);

    try {
      const out = await fn();

      // Success resets 429 escalation
      consecutive429 = 0;
      return out;
    } catch (err: any) {
      if (looksLike429(err)) {
        consecutive429 = Math.min(6, consecutive429 + 1);

        const ra = extractRetryAfterSec(err);

        // If NOAA provides Retry-After, respect it (min 3s).
        // If not, use a conservative floor (8s) and escalate slightly on repeats.
        const baseMs =
          ra != null
            ? Math.max(3000, ra * 1000)
            : 8000;

        const escalatedMs = baseMs + consecutive429 * 2000; // +2s per repeated 429 (cap via consecutive429)

        blockedUntil = Math.max(blockedUntil, Date.now() + escalatedMs);
      }

      throw err;
    } finally {
      lastFinish = Date.now();
    }
  };

  const p = chain.then(run, run);

  // keep chain alive even if a request fails
  chain = p.then(
    () => undefined,
    () => undefined
  );

  return p;
}