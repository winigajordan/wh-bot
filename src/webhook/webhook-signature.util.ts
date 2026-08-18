import { createHmac, timingSafeEqual } from 'crypto';

export function computeWebhookSignature(
  rawBody: Buffer,
  appSecret: string,
): string {
  const digest = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

export function verifyWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !signatureHeader || !appSecret) {
    return false;
  }

  const expected = computeWebhookSignature(rawBody, appSecret);
  const received = Buffer.from(signatureHeader);
  const expectedBuf = Buffer.from(expected);

  if (received.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(received, expectedBuf);
}
