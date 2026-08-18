import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Business } from '../../businesses/entities/business.entity';

export type ConversationStatus = 'active' | 'closed';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string;

  @ManyToOne(() => Business)
  @JoinColumn({ name: 'business_id' })
  business!: Business;

  @Column({ name: 'client_phone' })
  clientPhone!: string;

  @Column({ type: 'varchar', default: 'active' })
  status!: ConversationStatus;

  @Column({
    name: 'last_message_at',
    type: 'timestamp',
    default: () => 'now()',
  })
  lastMessageAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
