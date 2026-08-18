import { computeWebhookSignature, verifyWebhookSignature } from './webhook-signature.util';

describe('webhook-signature.util', () => {
  const secret = 'test-app-secret';
  const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');

  it('calcule sha256=<hex>', () => {
    const sig = computeWebhookSignature(rawBody, secret);
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('accepte une signature valide', () => {
    const signature = computeWebhookSignature(rawBody, secret);
    expect(verifyWebhookSignature(rawBody, signature, secret)).toBe(true);
  });

  it('refuse une signature invalide', () => {
    expect(
      verifyWebhookSignature(rawBody, 'sha256=deadbeef', secret),
    ).toBe(false);
  });

  it('refuse un header ou secret manquant', () => {
    expect(verifyWebhookSignature(undefined, 'sha256=abc', secret)).toBe(
      false,
    );
    expect(
      verifyWebhookSignature(rawBody, computeWebhookSignature(rawBody, secret), ''),
    ).toBe(false);
  });
});
