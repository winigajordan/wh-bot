import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversation/conversation.module';
import { CartService } from './cart/cart.service';
import { DeliveryZonesModule } from './delivery-zones/delivery-zones.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { OrdersService } from './orders/orders.service';
import { RestaurantOrderingToolsService } from './tools/restaurant-ordering-tools.service';

@Module({
  imports: [ConversationModule, MenuModule, OrdersModule, DeliveryZonesModule],
  providers: [CartService, OrdersService, RestaurantOrderingToolsService],
  exports: [
    MenuModule,
    OrdersModule,
    DeliveryZonesModule,
    CartService,
    OrdersService,
    RestaurantOrderingToolsService,
  ],
})
export class RestaurantOrderingModule {}
