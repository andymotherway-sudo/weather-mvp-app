import type { RequestContext } from "../types/api";

export function applyApiSafetyHeaders(response: Response, context: RequestContext) {
  const out = new Response(response.body, response);
  out.headers.set("X-Request-ID", context.requestId);
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("Referrer-Policy", "no-referrer");
  return out;
}

