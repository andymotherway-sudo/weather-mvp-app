export type RateLimitSubject = {
  ip?: string | null;
  userId?: string | null;
  route: string;
  tier?: "free" | "paid" | "internal";
};

export type RateLimitBinding = {
  limit(args: { key: string; delta?: number }): Promise<{ success: boolean }>;
};

export function requestRateLimitSubject(request: Request, route: string): RateLimitSubject {
  // Cloudflare supplies this header at the edge. Do not use X-Forwarded-For:
  // a client can forge it before its request reaches the Worker.
  return { ip: request.headers.get("CF-Connecting-IP"), route, tier: "free" };
}

export async function checkRateLimit(
  limiter: RateLimitBinding | undefined,
  subject: RateLimitSubject,
  options: { delta?: number; retryAfterSeconds?: number } = {},
) {
  // Protected production routes must fail closed if their configured binding
  // disappears. This prevents a deployment error from becoming a cost spike.
  if (!limiter) return { allowed: false, retryAfterSeconds: options.retryAfterSeconds ?? 60 };

  const actor = subject.userId || subject.ip || "unknown";
  const key = `${subject.tier ?? "free"}:${subject.route}:${actor}`;
  const outcome = await limiter.limit({ key, delta: options.delta ?? 1 });
  return {
    allowed: outcome.success,
    retryAfterSeconds: outcome.success ? null : options.retryAfterSeconds ?? 60,
  };
}
