import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DeliveryZone } from '../../restaurants/entities/delivery-zone.entity';
import { Restaurant } from '../../restaurants/entities/restaurant.entity';

export type DeliveryMode = 'delivery' | 'pickup';
export type OrderStatus = 'received' | 'preparing' | 'ready' | 'completed';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'restaurant_id', type: 'uuid' })
  restaurantId!: string;

  @ManyToOne(() => Restaurant)
  @JoinColumn({ name: 'restaurant_id' })
  restaurant!: Restaurant;

  @Column({ name: 'client_phone' })
  clientPhone!: string;

  @Column({ name: 'order_number', unique: true })
  orderNumber!: string;

  @Column({ type: 'jsonb' })
  items!: unknown[];

  @Column({ name: 'delivery_mode' })
  deliveryMode!: DeliveryMode;

  @Column({ name: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress!: string | null;

  @Column({ name: 'delivery_zone_id', type: 'uuid', nullable: true })
  deliveryZoneId!: string | null;

  @ManyToOne(() => DeliveryZone, { nullable: true })
  @JoinColumn({ name: 'delivery_zone_id' })
  deliveryZone!: DeliveryZone | null;

  @Column({ type: 'numeric' })
  total!: string;

  @Column({ type: 'varchar', default: 'received' })
  status!: OrderStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
