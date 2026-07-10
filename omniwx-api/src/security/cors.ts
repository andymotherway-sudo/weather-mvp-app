export type CorsMode = "public" | "authenticated";

export function publicCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type,x-request-id",
  };
}

export function corsHeadersForMode(mode: CorsMode) {
  // Public weather data remains open. Future authenticated routes should replace
  // this with explicit app/web origins before user-owned data is exposed.
  if (mode === "authenticated") return publicCorsHeaders();
  return publicCorsHeaders();
}

