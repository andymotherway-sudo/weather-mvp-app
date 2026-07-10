import { weatherServiceHealth } from "../services/weather";
import { publicCorsHeaders } from "../security/cors";
import type { RequestContext } from "../types/api";

export function handleHealthRoute(url: URL, context: RequestContext): Response | null {
  if (url.pathname !== "/health" && url.pathname !== "/v1/health") return null;

  return new Response(JSON.stringify({
    success: true,
    data: {
      service: "omniwx-api",
      status: "ok",
      weather: weatherServiceHealth(),
    },
    requestId: context.requestId,
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...publicCorsHeaders(),
    },
  });
}
