import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryZone } from './entities/delivery-zone.entity';
import { DeliveryZonesService } from './delivery-zones.service';

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryZone])],
  providers: [DeliveryZonesService],
  exports: [TypeOrmModule, DeliveryZonesService],
})
export class DeliveryZonesModule {}
