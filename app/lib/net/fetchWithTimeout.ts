export async function fetchWithTimeout(
  url: string,
  ms = 12000,
  init?: RequestInit
) {
  const timeout = new AbortController();
  const t = setTimeout(() => timeout.abort(), ms);

  // If caller provided a signal, abort timeout when caller aborts, and abort caller when timeout aborts.
  const caller = init?.signal;

  const onCallerAbort = () => timeout.abort();
  if (caller) caller.addEventListener('abort', onCallerAbort, { once: true });

  try {
    // Prefer AbortSignal.any if available (RN Hermes usually has it nowadays, but not guaranteed)
    const signal =
      (AbortSignal as any)?.any
        ? (AbortSignal as any).any([timeout.signal, caller].filter(Boolean))
        : timeout.signal;

    return await fetch(url, { ...init, signal });
  } finally {
    clearTimeout(t);
    if (caller) caller.removeEventListener('abort', onCallerAbort);
  }
}