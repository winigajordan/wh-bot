import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Business } from '../../../businesses/entities/business.entity';

@Entity('delivery_zones')
export class DeliveryZone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string;

  @ManyToOne(() => Business)
  @JoinColumn({ name: 'business_id' })
  business!: Business;

  @Column({ name: 'zone_name' })
  zoneName!: string;

  @Column({ name: 'delivery_fee', type: 'numeric', default: () => '0' })
  deliveryFee!: string;
}
