import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BusinessesModule } from './businesses/businesses.module';
import { ClaudeModule } from './claude/claude.module';
import configuration from './config/configuration';
import { ConversationModule } from './conversation/conversation.module';
import { ConversationQueueModule } from './conversation-queue/conversation-queue.module';
import { DashboardApiModule } from './dashboard-api/dashboard-api.module';
import { DatabaseModule } from './database/database.module';
import { ModuleRegistryModule } from './module-registry/module-registry.module';
import { RedisModule } from './redis/redis.module';
import { RestaurantOrderingModule } from './restaurant-ordering/restaurant-ordering.module';
import { WebhookModule } from './webhook/webhook.module';
import { WhatsappClientModule } from './whatsapp-client/whatsapp-client.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
    }),
    RedisModule,
    DatabaseModule,
    BusinessesModule,
    ModuleRegistryModule,
    RestaurantOrderingModule,
    ConversationModule,
    ConversationQueueModule,
    WebhookModule,
    ClaudeModule,
    WhatsappClientModule,
    DashboardApiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
