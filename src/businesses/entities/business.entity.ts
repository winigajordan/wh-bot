import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PlatformModule } from './platform-module.entity';
import { User } from './user.entity';

export type BusinessStatus = 'onboarding' | 'active' | 'inactive';

@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true, nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({ name: 'module_id', type: 'uuid' })
  moduleId!: string;

  @ManyToOne(() => PlatformModule)
  @JoinColumn({ name: 'module_id' })
  module!: PlatformModule;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', nullable: true })
  contactPhone!: string | null;

  @Column({ default: 'Africa/Dakar' })
  timezone!: string;

  @Column({ name: 'whatsapp_phone_number_id', unique: true })
  whatsappPhoneNumberId!: string;

  @Column({ name: 'whatsapp_waba_id' })
  whatsappWabaId!: string;

  @Column({ type: 'varchar', default: 'onboarding' })
  status!: BusinessStatus;

  @Column({ name: 'onboarding_state', type: 'jsonb', default: () => "'{}'" })
  onboardingState!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
