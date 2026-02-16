export interface Env {
  NOAA_NCEI_TOKEN: string;
  NASA_API_KEY: string;
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function withCors(headers: Record<string, string>) {
  return { ...headers, ...corsHeaders() };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: withCors({}) });
    }

    // NASA APOD endpoint
    if (url.pathname === "/api/nasa/apod") {
      const date = url.searchParams.get("date");
      const upstream = new URL("https://api.nasa.gov/planetary/apod");
      if (date) upstream.searchParams.set("date", date);
      upstream.searchParams.set("api_key", env.NASA_API_KEY);

      const res = await fetch(upstream.toString());
      return new Response(res.body, {
        status: res.status,
        headers: withCors({
          "content-type": res.headers.get("content-type") || "application/json",
          "cache-control": "public, max-age=0, s-maxage=21600", // 6 hours
        }),
      });
    }

    // NASA DONKI proxy
    // Example: /api/nasa/donki/CME?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
    if (url.pathname.startsWith("/api/nasa/donki/")) {
      const donkiPath = url.pathname.replace("/api/nasa/donki/", ""); // e.g. "CME"
      const upstream = new URL(`https://api.nasa.gov/DONKI/${donkiPath}`);

      // pass through query params
      url.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));
      upstream.searchParams.set("api_key", env.NASA_API_KEY);

      const res = await fetch(upstream.toString(), {
        headers: { accept: "application/json" },
      });

      return new Response(res.body, {
        status: res.status,
        headers: withCors({
          "content-type": res.headers.get("content-type") || "application/json",
          "cache-control": "public, max-age=0, s-maxage=1800", // 30 min
        }),
      });
    }

    // NOAA NCEI proxy
    if (url.pathname.startsWith("/api/ncei/")) {
      const subpath = url.pathname.replace("/api/ncei", "");
      const upstream = `https://www.ncei.noaa.gov/cdo-web/api/v2${subpath}?${url.searchParams.toString()}`;

      const res = await fetch(upstream, {
        headers: {
          token: env.NOAA_NCEI_TOKEN,
          accept: "application/json",
        },
      });

      return new Response(res.body, {
        status: res.status,
        headers: withCors({
          "content-type": res.headers.get("content-type") || "application/json",
          "cache-control": "public, max-age=0, s-maxage=3600", // 1 hour
        }),
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        routes: [
          "/api/nasa/apod?date=YYYY-MM-DD",
          "/api/nasa/donki/<TYPE>?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD  (TYPE: FLR|CME|SEP|GST)",
          "/api/ncei/*",
        ],
      }),
      { headers: withCors({ "content-type": "application/json" }) }
    );
  },
};