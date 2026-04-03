import { Column, Entity, OneToMany } from 'typeorm';
import { DATETIME_COLUMN_TYPE, LARGE_TEXT_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { OrgRoleEntity } from './org-role.entity';
import { OrganizationFeatureEntity } from './organization-feature.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('organizations')
export class OrganizationEntity extends TimestampedUuidEntity {
  @Column({ type: 'varchar', unique: true })
  name!: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  code!: string | null;

  @Column({ name: 'legal_name', type: 'varchar', nullable: true })
  legalName!: string | null;

  @Column({ type: 'varchar', nullable: true })
  industry!: string | null;

  @Column({ name: 'registration_number', type: 'varchar', nullable: true })
  registrationNumber!: string | null;

  @Column({ name: 'tax_id', type: 'varchar', nullable: true })
  taxId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  website!: string | null;

  @Column({ name: 'contact_email', type: 'varchar', nullable: true })
  contactEmail!: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', nullable: true })
  contactPhone!: string | null;

  @Column({ name: 'primary_contact_name', type: 'varchar', nullable: true })
  primaryContactName!: string | null;

  @Column({ name: 'primary_contact_email', type: 'varchar', nullable: true })
  primaryContactEmail!: string | null;

  @Column({ name: 'primary_contact_phone', type: 'varchar', nullable: true })
  primaryContactPhone!: string | null;

  @Column({ name: 'address_line_1', type: 'varchar', nullable: true })
  addressLine1!: string | null;

  @Column({ name: 'address_line_2', type: 'varchar', nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'varchar', nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', nullable: true })
  state!: string | null;

  @Column({ type: 'varchar', nullable: true })
  country!: string | null;

  @Column({ name: 'postal_code', type: 'varchar', nullable: true })
  postalCode!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'logo_url', type: LARGE_TEXT_COLUMN_TYPE, nullable: true })
  logoUrl!: string | null;

  @Column({ name: 'favicon_url', type: LARGE_TEXT_COLUMN_TYPE, nullable: true })
  faviconUrl!: string | null;

  @Column({ name: 'brand_color', type: 'varchar', nullable: true })
  brandColor!: string | null;

  @Column({ name: 'billing_cycle', type: 'varchar', nullable: true })
  billingCycle!: 'MONTHLY' | 'YEARLY' | null;

  @Column({ name: 'subscription_status', type: 'varchar', default: 'DRAFT' })
  subscriptionStatus!: 'DRAFT' | 'TRIAL' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'SUSPENDED';

  @Column({ name: 'has_free_trial', type: 'boolean', default: false })
  hasFreeTrial!: boolean;

  @Column({ name: 'trial_start_date', type: 'date', nullable: true })
  trialStartDate!: string | null;

  @Column({ name: 'trial_end_date', type: 'date', nullable: true })
  trialEndDate!: string | null;

  @Column({ name: 'subscription_start_date', type: 'date', nullable: true })
  subscriptionStartDate!: string | null;

  @Column({ name: 'subscription_end_date', type: 'date', nullable: true })
  subscriptionEndDate!: string | null;

  @Column({ name: 'reminder_enabled', type: 'boolean', default: true })
  reminderEnabled!: boolean;

  @Column({ name: 'reminder_lead_days', type: 'int', default: 60 })
  reminderLeadDays!: number;

  @Column({ name: 'last_reminder_sent_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  lastReminderSentAt!: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => PlantEntity, (plant) => plant.organization)
  plants!: PlantEntity[];

  @OneToMany(() => UserEntity, (user) => user.organization)
  users!: UserEntity[];

  @OneToMany(() => OrgRoleEntity, (role) => role.organization)
  orgRoles!: OrgRoleEntity[];

  @OneToMany(() => OrganizationFeatureEntity, (feature) => feature.organization)
  features!: OrganizationFeatureEntity[];
}
