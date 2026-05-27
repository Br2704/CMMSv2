import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { LARGE_TEXT_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';
import { APP_NAME } from '../../config/branding';

@Entity('visitor_experience_content')
export class VisitorExperienceContentEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'page_title', type: 'varchar', default: `Welcome to ${APP_NAME}` })
  pageTitle!: string;

  @Column({ name: 'company_overview', type: LARGE_TEXT_COLUMN_TYPE, nullable: true })
  companyOverview!: string | null;

  @Column({ name: 'contact_name', type: 'varchar', nullable: true })
  contactName!: string | null;

  @Column({ name: 'contact_email', type: 'varchar', nullable: true })
  contactEmail!: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', nullable: true })
  contactPhone!: string | null;

  @Column({ name: 'contact_address', type: LARGE_TEXT_COLUMN_TYPE, nullable: true })
  contactAddress!: string | null;

  @Column({ name: 'hero_highlights', type: 'simple-json', nullable: true })
  heroHighlights!: Array<Record<string, unknown>> | null;

  @Column({ name: 'products', type: 'simple-json', nullable: true })
  products!: Array<Record<string, unknown>> | null;

  @Column({ name: 'experience_meta', type: 'simple-json', nullable: true })
  experienceMeta!: Record<string, unknown> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity | null;
}
