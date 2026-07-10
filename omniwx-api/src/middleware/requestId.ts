import type { RequestContext } from "../types/api";

const SAFE_REQUEST_ID = /^[a-zA-Z0-9._:-]{1,80}$/;

export function createRequestContext(request: Request): RequestContext {
  const incoming = request.headers.get("x-request-id")?.trim() ?? "";
  const requestId = SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  const url = new URL(request.url);

  return {
    requestId,
    startedAtMs: Date.now(),
    route: url.pathname,
    method: request.method,
  };
}

