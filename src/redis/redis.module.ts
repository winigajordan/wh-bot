import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { DEFAULT_REDIS_URL, REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const url = configService.get<string>('redis.url') || DEFAULT_REDIS_URL;
        return new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          keepAlive: 10_000,
          connectTimeout: 10_000,
          retryStrategy: (times) => Math.min(times * 200, 2_000),
        });
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
