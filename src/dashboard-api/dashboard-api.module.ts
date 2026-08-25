import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RestaurantOrderingModule } from '../restaurant-ordering/restaurant-ordering.module';
import { DashboardOrdersController } from './orders/dashboard-orders.controller';

@Module({
  imports: [AuthModule, RestaurantOrderingModule],
  controllers: [DashboardOrdersController],
  exports: [AuthModule],
})
export class DashboardApiModule {}
