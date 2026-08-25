import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { RestaurantOrderingModule } from '../restaurant-ordering/restaurant-ordering.module';
import { DashboardMenuController } from './menu/dashboard-menu.controller';
import { DashboardOrdersController } from './orders/dashboard-orders.controller';
import { DashboardOrdersGateway } from './orders/dashboard-orders.gateway';
import { DashboardZonesController } from './zones/dashboard-zones.controller';

@Module({
  imports: [AuthModule, BusinessesModule, RestaurantOrderingModule],
  controllers: [
    DashboardOrdersController,
    DashboardMenuController,
    DashboardZonesController,
  ],
  providers: [DashboardOrdersGateway],
  exports: [AuthModule],
})
export class DashboardApiModule {}
