import { MigrationInterface, QueryRunner } from 'typeorm';

export class SecurityEnhancements1700000046 implements MigrationInterface {
  name = 'SecurityEnhancements1700000046';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_security_events_event_type"
      ON "security_events" ("event_type")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user_revoked"
      ON "refresh_tokens" ("user_id", "revoked_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_security_events_event_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_user_revoked"`);
  }
}