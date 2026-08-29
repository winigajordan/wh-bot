import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { BusinessesService } from '../../businesses/businesses.service';
import type { JwtPayload } from '../../auth/auth.types';
import {
  DASHBOARD_ORDER_CREATED,
  DASHBOARD_ORDER_UPDATED,
  type DashboardOrderEvent,
} from '../../restaurant-ordering/orders/dashboard-order.events';

function businessRoom(businessId: string): string {
  return `business:${businessId}`;
}

type DashboardSocketData = {
  businessId?: string;
};

function socketData(client: Socket): DashboardSocketData {
  return client.data as DashboardSocketData;
}

@WebSocketGateway({
  namespace: '/dashboard',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class DashboardOrdersGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DashboardOrdersGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly businessesService: BusinessesService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.secret') ?? 'dev-insecure-secret',
      });

      if (!payload?.sub || !payload.businessId || !payload.email) {
        client.disconnect(true);
        return;
      }

      const business = await this.businessesService.findByUserId(payload.sub);
      if (!business || business.id !== payload.businessId) {
        client.disconnect(true);
        return;
      }

      socketData(client).businessId = business.id;
      await client.join(businessRoom(business.id));
      // this.logger.debug(
      //   `Dashboard WS connected user=${payload.email} business=${business.id}`,
      // );
    } catch (error) {
      this.logger.warn(
        `Dashboard WS auth failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const businessId = socketData(client).businessId;
    this.logger.debug(
      `Dashboard WS disconnected business=${businessId ?? 'unknown'}`,
    );
  }

  @OnEvent(DASHBOARD_ORDER_CREATED)
  onOrderCreated(event: DashboardOrderEvent): void {
    this.server
      .to(businessRoom(event.businessId))
      .emit('order.created', event.order);
  }

  @OnEvent(DASHBOARD_ORDER_UPDATED)
  onOrderUpdated(event: DashboardOrderEvent): void {
    this.server
      .to(businessRoom(event.businessId))
      .emit('order.updated', event.order);
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    const fromAuth = auth?.token;
    if (typeof fromAuth === 'string' && fromAuth.trim()) {
      return fromAuth.trim();
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }

    return null;
  }
}
