import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Business } from '../../../businesses/entities/business.entity';
import { DeliveryZone } from '../../delivery-zones/entities/delivery-zone.entity';

export type DeliveryMode = 'delivery' | 'pickup';
export type OrderStatus =
  | 'received'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string;

  @ManyToOne(() => Business)
  @JoinColumn({ name: 'business_id' })
  business!: Business;

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

  @Column({ name: 'delivery_fee', type: 'numeric', default: () => '0' })
  deliveryFee!: string;

  @Column({ type: 'varchar', default: 'received' })
  status!: OrderStatus;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
