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

  /** HMAC-SHA256 hex du numéro — lookup sans stocker le clair */
  @Column({ name: 'client_phone_hash' })
  clientPhoneHash!: string;

  /** AES-256-GCM du numéro E.164 */
  @Column({ name: 'client_phone_encrypted', type: 'text' })
  clientPhoneEncrypted!: string;

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
