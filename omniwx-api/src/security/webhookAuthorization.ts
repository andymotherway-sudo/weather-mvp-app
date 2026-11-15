/**
 * Compare two secrets without returning early on the first differing byte.
 * The function is deliberately provider-agnostic so webhook routes can fail
 * closed before parsing or persisting untrusted event data.
 */
export function constantTimeSecretEqual(expected: string, actual: string): boolean {
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expected);
  const actualBytes = encoder.encode(actual);
  const length = Math.max(expectedBytes.length, actualBytes.length);
  let difference = expectedBytes.length ^ actualBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (expectedBytes[index] ?? 0) ^ (actualBytes[index] ?? 0);
  }

  return difference === 0;
}

export function hasValidWebhookAuthorization(
  request: Request,
  expectedAuthorization: string | undefined,
): boolean {
  const actualAuthorization = request.headers.get('authorization');
  if (!expectedAuthorization || !actualAuthorization) return false;
  return constantTimeSecretEqual(expectedAuthorization, actualAuthorization);
}
