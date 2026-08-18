import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryZone } from './entities/delivery-zone.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryZone])],
  exports: [TypeOrmModule],
})
export class DeliveryZonesModule {}
