import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/entities/order.entity';
import { DeliveryZone } from './entities/delivery-zone.entity';
import { DeliveryZonesService } from './delivery-zones.service';

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryZone, Order])],
  providers: [DeliveryZonesService],
  exports: [TypeOrmModule, DeliveryZonesService],
})
export class DeliveryZonesModule {}
