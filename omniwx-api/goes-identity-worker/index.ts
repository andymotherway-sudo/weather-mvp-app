export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ ok: false, error: "method-not-allowed" }), {
        status: 405,
        headers: { allow: "GET", "content-type": "application/json; charset=utf-8" },
      });
    }

    // This header is supplied by Cloudflare Access after a Service Auth policy succeeds.
    const assertion = request.headers.get("cf-access-jwt-assertion");
    if (!assertion) {
      return new Response(JSON.stringify({ ok: false, error: "access-assertion-required" }), {
        status: 403,
        headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
      });
    }

    return new Response(JSON.stringify({ ok: true, assertion }), {
      headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
    });
  },
};
