export type RateLimitSubject = {
  ip?: string | null;
  userId?: string | null;
  route: string;
  tier?: "free" | "paid" | "internal";
};

export async function checkRateLimit(_subject: RateLimitSubject) {
  // Placeholder for Cloudflare-native rate limiting. Do not use Worker-local
  // memory for production limits because Worker isolates are distributed.
  return { allowed: true, retryAfterSeconds: null as number | null };
}

