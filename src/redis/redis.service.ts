import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {
    this.client.on('error', (error: Error) => {
      this.logger.error(`Erreur Redis : ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      await this.client.ping();
      this.logger.log(
        `Connexion Redis OK (${this.describeUrl(this.client.options)})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Connexion Redis échouée au boot (${this.describeUrl(this.client.options)}) : ${message}`,
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }
    await this.client.quit();
  }

  async setSession(
    key: string,
    data: object,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(key, JSON.stringify(data), 'EX', ttlSeconds);
  }

  async getSession(key: string): Promise<object | null> {
    const raw = await this.client.get(key);
    if (raw === null) {
      return null;
    }

    try {
      return JSON.parse(raw) as object;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Impossible de parser la valeur Redis pour la clé "${key}" : ${message}`,
      );
      return null;
    }
  }

  async deleteSession(key: string): Promise<void> {
    await this.client.del(key);
  }

  private describeUrl(options: Redis['options']): string {
    const host = options.host ?? 'localhost';
    const port = options.port ?? 6379;
    return `${host}:${port}`;
  }
}
