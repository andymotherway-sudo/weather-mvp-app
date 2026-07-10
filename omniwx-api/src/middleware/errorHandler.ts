import { applyApiSafetyHeaders } from "../security/headers";
import { publicCorsHeaders } from "../security/cors";
import type { ApiErrorCode, ApiErrorPayload, RequestContext } from "../types/api";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  context: RequestContext,
  headers: Record<string, string> = {},
) {
  const payload: ApiErrorPayload = {
    success: false,
    error: { code, message, requestId: context.requestId },
  };

  return applyApiSafetyHeaders(
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...publicCorsHeaders(),
        ...headers,
      },
    }),
    context,
  );
}

export async function withErrorBoundary(
  context: RequestContext,
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return applyApiSafetyHeaders(await handler(), context);
  } catch (error) {
    const err = error instanceof ApiError
      ? error
      : new ApiError(500, "INTERNAL_ERROR", "The request could not be completed.");

    console.error(JSON.stringify({
      requestId: context.requestId,
      route: context.route,
      method: context.method,
      status: err.status,
      code: err.code,
      durationMs: Date.now() - context.startedAtMs,
    }));

    return jsonError(err.status, err.code, err.message, context);
  }
}
