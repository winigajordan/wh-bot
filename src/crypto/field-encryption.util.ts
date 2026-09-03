import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'crypto';

export const FIELD_ENCRYPTION_VERSION = 0x01;
export const AES_KEY_LENGTH = 32;
export const IV_LENGTH = 12;
export const AUTH_TAG_LENGTH = 16;

const HKDF_INFO_AES = Buffer.from('wini-food-aes-v1');
const HKDF_INFO_PHONE = Buffer.from('wini-food-phone-hmac-v1');

export function parseMessageEncryptionKey(
  messageKeyBase64: string | undefined,
): Buffer | null {
  if (!messageKeyBase64?.trim()) {
    return null;
  }
  try {
    const key = Buffer.from(messageKeyBase64.trim(), 'base64');
    if (key.length !== AES_KEY_LENGTH) {
      return null;
    }
    return key;
  } catch {
    return null;
  }
}

export function deriveAesKey(masterKey: Buffer): Buffer {
  return Buffer.from(
    hkdfSync('sha256', masterKey, Buffer.alloc(0), HKDF_INFO_AES, AES_KEY_LENGTH),
  );
}

export function derivePhoneHmacKey(masterKey: Buffer): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      masterKey,
      Buffer.alloc(0),
      HKDF_INFO_PHONE,
      AES_KEY_LENGTH,
    ),
  );
}

export function encryptField(aesKey: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([
    Buffer.from([FIELD_ENCRYPTION_VERSION]),
    iv,
    ciphertext,
    authTag,
  ]).toString('base64');
}

export function decryptField(aesKey: Buffer, payloadBase64: string): string {
  const payload = Buffer.from(payloadBase64, 'base64');
  const minLength = 1 + IV_LENGTH + AUTH_TAG_LENGTH;
  if (payload.length < minLength) {
    throw new Error('Payload chiffré invalide (trop court)');
  }

  const version = payload[0];
  if (version !== FIELD_ENCRYPTION_VERSION) {
    throw new Error(`Version de chiffrement non supportée: ${version}`);
  }

  const iv = payload.subarray(1, 1 + IV_LENGTH);
  const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(
    1 + IV_LENGTH,
    payload.length - AUTH_TAG_LENGTH,
  );

  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

export function hashPhone(phoneHmacKey: Buffer, phone: string): string {
  return createHmac('sha256', phoneHmacKey)
    .update(phone, 'utf8')
    .digest('hex');
}
