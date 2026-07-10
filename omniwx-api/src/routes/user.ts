import { authenticateRequest, requireAuthenticatedUser } from "../middleware/authentication";
import { publicCorsHeaders } from "../security/cors";
import { getEntitlementsForUser } from "../services/subscriptions";
import type { RequestContext } from "../types/api";

const USER_ROUTE_PREFIXES = [
  "/v1/user",
  "/v1/subscriptions",
  "/v1/devices",
];

export async function handleUserRoute(request: Request, url: URL, context: RequestContext): Promise<Response | null> {
  if (!USER_ROUTE_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
    return null;
  }

  const auth = await authenticateRequest(request);
  const user = requireAuthenticatedUser(auth);

  if (url.pathname === "/v1/subscriptions/entitlements") {
    const entitlements = await getEntitlementsForUser(user);
    return new Response(JSON.stringify({ success: true, data: entitlements, requestId: context.requestId }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...publicCorsHeaders(),
      },
    });
  }

  return new Response(JSON.stringify({
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "OMNIwx account routes are reserved for the future paid-user backend.",
      requestId: context.requestId,
    },
  }), {
    status: 501,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...publicCorsHeaders(),
    },
  });
}
