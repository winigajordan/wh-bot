import { Module } from '@nestjs/common';
import { WhatsappClientService } from './whatsapp-client.service';

@Module({
  providers: [WhatsappClientService],
  exports: [WhatsappClientService],
})
export class WhatsappClientModule {}
