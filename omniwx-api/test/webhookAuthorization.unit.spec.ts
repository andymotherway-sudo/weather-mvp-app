import { describe, expect, it } from 'vitest';

import {
  constantTimeSecretEqual,
  hasValidWebhookAuthorization,
} from '../src/security/webhookAuthorization';

describe('webhook authorization', () => {
  it('accepts an exact authorization value', () => {
    const request = new Request('https://api.example.test/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer expected-secret' },
    });

    expect(hasValidWebhookAuthorization(request, 'Bearer expected-secret')).toBe(true);
  });

  it('rejects missing configuration or headers', () => {
    const request = new Request('https://api.example.test/webhooks/revenuecat');

    expect(hasValidWebhookAuthorization(request, 'Bearer expected-secret')).toBe(false);
    expect(hasValidWebhookAuthorization(request, undefined)).toBe(false);
  });

  it('rejects different values and lengths', () => {
    expect(constantTimeSecretEqual('expected-secret', 'expected-secreu')).toBe(false);
    expect(constantTimeSecretEqual('expected-secret', 'expected-secret-extra')).toBe(false);
  });
});
