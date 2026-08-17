import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type RestaurantStatus = 'active' | 'inactive';

@Entity('restaurants')
export class Restaurant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', nullable: true })
  contactPhone!: string | null;

  @Column({ name: 'whatsapp_phone_number_id', unique: true })
  whatsappPhoneNumberId!: string;

  @Column({ name: 'whatsapp_waba_id' })
  whatsappWabaId!: string;

  @Column({ type: 'varchar', default: 'active' })
  status!: RestaurantStatus;

  @Column({ name: 'opening_hours', type: 'jsonb', nullable: true })
  openingHours!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
