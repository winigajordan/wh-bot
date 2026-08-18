import { Module } from '@nestjs/common';
import { DeliveryZonesModule } from './delivery-zones/delivery-zones.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [MenuModule, OrdersModule, DeliveryZonesModule],
  exports: [MenuModule, OrdersModule, DeliveryZonesModule],
})
export class RestaurantOrderingModule {}
