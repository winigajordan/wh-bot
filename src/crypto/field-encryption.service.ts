import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decryptField,
  deriveAesKey,
  derivePhoneHmacKey,
  encryptField,
  hashPhone,
  parseMessageEncryptionKey,
} from './field-encryption.util';

@Injectable()
export class FieldEncryptionService implements OnModuleInit {
  private readonly logger = new Logger(FieldEncryptionService.name);
  private aesKey: Buffer | null = null;
  private phoneHmacKey: Buffer | null = null;
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const master = parseMessageEncryptionKey(
      this.config.get<string>('encryption.messageKeyBase64'),
    );
    const nodeEnv = this.config.get<string>('app.nodeEnv') ?? 'development';

    if (!master) {
      const message =
        'MESSAGE_ENCRYPTION_KEY manquante ou invalide (32 bytes base64 requis). Persist archive désactivée.';
      if (nodeEnv === 'production') {
        throw new Error(message);
      }
      this.logger.warn(message);
      this.ready = false;
      return;
    }

    this.aesKey = deriveAesKey(master);
    this.phoneHmacKey = derivePhoneHmacKey(master);
    this.ready = true;
    this.logger.log('Chiffrement au repos initialisé (AES-256-GCM)');
  }

  isReady(): boolean {
    return this.ready;
  }

  encrypt(plaintext: string): string {
    return encryptField(this.requireAesKey(), plaintext);
  }

  decrypt(payload: string): string {
    return decryptField(this.requireAesKey(), payload);
  }

  hashPhone(phone: string): string {
    return hashPhone(this.requirePhoneHmacKey(), phone);
  }

  private requireAesKey(): Buffer {
    if (!this.aesKey) {
      throw new ServiceUnavailableException(
        'Chiffrement indisponible: MESSAGE_ENCRYPTION_KEY non configurée',
      );
    }
    return this.aesKey;
  }

  private requirePhoneHmacKey(): Buffer {
    if (!this.phoneHmacKey) {
      throw new ServiceUnavailableException(
        'Chiffrement indisponible: MESSAGE_ENCRYPTION_KEY non configurée',
      );
    }
    return this.phoneHmacKey;
  }
}
