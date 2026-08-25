import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Business } from '../../../businesses/entities/business.entity';
import type { ExtractedMenuPayload } from '../menu-extraction.types';

export type MenuExtractionStatus =
  | 'pending_review'
  | 'published'
  | 'discarded';

@Entity('menu_extractions')
export class MenuExtraction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string;

  @ManyToOne(() => Business)
  @JoinColumn({ name: 'business_id' })
  business!: Business;

  @Column({ default: 'pending_review' })
  status!: MenuExtractionStatus;

  @Column({ name: 'source_filename', type: 'varchar', nullable: true })
  sourceFilename!: string | null;

  @Column({ name: 'source_media_type' })
  sourceMediaType!: string;

  @Column({ name: 'extracted_json', type: 'jsonb' })
  extractedJson!: ExtractedMenuPayload;

  @Column({ name: 'raw_model_text', type: 'text', nullable: true })
  rawModelText!: string | null;

  @Column({ name: 'published_at', type: 'timestamp', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
