import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>('app.corsOrigin')?.split(',') ?? [
      'http://localhost:4200',
    ],
    credentials: true,
  });

  await app.listen(config.get<number>('app.port') ?? 3000);
}
void bootstrap();
