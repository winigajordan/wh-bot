import { Module } from '@nestjs/common';
import { BusinessesModule } from '../businesses/businesses.module';
import { ConversationModule } from '../conversation/conversation.module';
import { ConversationQueueModule } from '../conversation-queue/conversation-queue.module';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [BusinessesModule, ConversationModule, ConversationQueueModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
