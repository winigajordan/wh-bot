import type { DashboardOrderDto } from './orders.service';

export const DASHBOARD_ORDER_CREATED = 'dashboard.order.created';
export const DASHBOARD_ORDER_UPDATED = 'dashboard.order.updated';

export type DashboardOrderEvent = {
  businessId: string;
  order: DashboardOrderDto;
};
