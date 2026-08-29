import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BusinessesModule } from '../businesses/businesses.module';
import { ConversationModule } from '../conversation/conversation.module';
import { WhatsappClientModule } from '../whatsapp-client/whatsapp-client.module';
import { ConversationDebounceService } from './conversation-debounce.service';
import { ConversationProcessor } from './conversation.processor';
import { CONVERSATION_QUEUE } from './conversation-queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('redis.url'),
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          keepAlive: 10_000,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: CONVERSATION_QUEUE }),
    BusinessesModule,
    ConversationModule,
    WhatsappClientModule,
  ],
  providers: [ConversationDebounceService, ConversationProcessor],
  exports: [ConversationDebounceService],
})
export class ConversationQueueModule {}
