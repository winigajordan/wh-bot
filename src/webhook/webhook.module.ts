import { Module } from '@nestjs/common';
import { BusinessesModule } from '../businesses/businesses.module';
import { ConversationModule } from '../conversation/conversation.module';
import { WhatsappClientModule } from '../whatsapp-client/whatsapp-client.module';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [BusinessesModule, ConversationModule, WhatsappClientModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
