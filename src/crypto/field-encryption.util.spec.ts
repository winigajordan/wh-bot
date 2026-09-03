import { createHash, randomBytes } from 'crypto';
import {
  decryptField,
  deriveAesKey,
  derivePhoneHmacKey,
  encryptField,
  hashPhone,
  parseMessageEncryptionKey,
} from './field-encryption.util';

describe('field-encryption.util', () => {
  const masterKey = randomBytes(32);
  const aesKey = deriveAesKey(masterKey);
  const phoneKey = derivePhoneHmacKey(masterKey);

  it('parse une clé base64 de 32 bytes', () => {
    const parsed = parseMessageEncryptionKey(masterKey.toString('base64'));
    expect(parsed?.equals(masterKey)).toBe(true);
  });

  it('refuse une clé trop courte', () => {
    expect(parseMessageEncryptionKey(randomBytes(16).toString('base64'))).toBeNull();
    expect(parseMessageEncryptionKey('')).toBeNull();
    expect(parseMessageEncryptionKey(undefined)).toBeNull();
  });

  it('round-trip encrypt/decrypt', () => {
    const payload = encryptField(aesKey, 'Bonjour Léa');
    expect(payload).not.toContain('Bonjour');
    expect(decryptField(aesKey, payload)).toBe('Bonjour Léa');
  });

  it('produit un ciphertext différent à chaque appel (IV aléatoire)', () => {
    const a = encryptField(aesKey, 'même texte');
    const b = encryptField(aesKey, 'même texte');
    expect(a).not.toBe(b);
  });

  it('rejette un ciphertext altéré', () => {
    const payload = Buffer.from(encryptField(aesKey, 'secret'), 'base64');
    payload[payload.length - 1] ^= 0xff;
    expect(() =>
      decryptField(aesKey, payload.toString('base64')),
    ).toThrow();
  });

  it('hashPhone est stable et distinct du SHA brut', () => {
    const a = hashPhone(phoneKey, '221700000000');
    const b = hashPhone(phoneKey, '221700000000');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(a).not.toBe(
      createHash('sha256').update('221700000000').digest('hex'),
    );
  });

  it('dérive des clés AES et HMAC distinctes', () => {
    expect(aesKey.equals(phoneKey)).toBe(false);
  });
});
