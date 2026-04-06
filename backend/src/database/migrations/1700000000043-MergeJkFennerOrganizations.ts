import { MigrationInterface, QueryRunner } from 'typeorm';

const TARGET_ORG_NAME = 'JK Fenner';
const TARGET_ORG_CODE = 'JKF';
const LEGACY_ORG_NAME = 'JK Fenner (India) Limited';
const LEGACY_ORG_CODE = 'JKFENNER';

type OrgIdRow = { id: string };

export class MergeJkFennerOrganizations1700000000043 implements MigrationInterface {
  name = 'MergeJkFennerOrganizations1700000000043';

  private async resolveCanonicalOrganizationId(queryRunner: QueryRunner): Promise<string | null> {
    const rows = (await queryRunner.query(
      `
        SELECT id
        FROM organizations
        WHERE code IN ($1, $2)
           OR LOWER(name) IN (LOWER($3), LOWER($4))
        ORDER BY
          CASE
            WHEN code = $1 OR LOWER(name) = LOWER($3) THEN 0
            ELSE 1
          END,
          created_at ASC
        LIMIT 1
      `,
      [TARGET_ORG_CODE, LEGACY_ORG_CODE, TARGET_ORG_NAME, LEGACY_ORG_NAME],
    )) as OrgIdRow[];

    return rows[0]?.id ?? null;
  }

  private async resolveSourceOrganizationIds(queryRunner: QueryRunner, targetId: string): Promise<string[]> {
    const rows = (await queryRunner.query(
      `
        SELECT id
        FROM organizations
        WHERE id <> $1
          AND (
            code IN ($2, $3)
            OR LOWER(name) IN (LOWER($4), LOWER($5))
          )
        ORDER BY created_at ASC
      `,
      [targetId, TARGET_ORG_CODE, LEGACY_ORG_CODE, TARGET_ORG_NAME, LEGACY_ORG_NAME],
    )) as OrgIdRow[];

    return rows.map((row) => row.id);
  }

  private async mergeOrganizationIntoTarget(queryRunner: QueryRunner, targetId: string, sourceId: string): Promise<void> {
    await queryRunner.query(
      `
        UPDATE organizations AS target
        SET
          legal_name = COALESCE(target.legal_name, source.legal_name),
          industry = COALESCE(target.industry, source.industry),
          website = COALESCE(target.website, source.website),
          contact_email = COALESCE(target.contact_email, source.contact_email),
          contact_phone = COALESCE(target.contact_phone, source.contact_phone),
          city = COALESCE(target.city, source.city),
          state = COALESCE(target.state, source.state),
          country = COALESCE(target.country, source.country),
          is_active = target.is_active OR source.is_active,
          updated_at = CURRENT_TIMESTAMP
        FROM organizations AS source
        WHERE target.id = $1
          AND source.id = $2
      `,
      [targetId, sourceId],
    );

    if (await queryRunner.hasTable('users')) {
      await queryRunner.query('UPDATE users SET organization_id = $1 WHERE organization_id = $2', [targetId, sourceId]);
    }

    if (await queryRunner.hasTable('plants')) {
      await queryRunner.query('UPDATE plants SET organization_id = $1 WHERE organization_id = $2', [targetId, sourceId]);
    }

    if (await queryRunner.hasTable('security_events')) {
      await queryRunner.query('UPDATE security_events SET organization_id = $1 WHERE organization_id = $2', [targetId, sourceId]);
    }

    if (await queryRunner.hasTable('org_roles')) {
      await queryRunner.query(
        `
          UPDATE org_roles AS source_role
          SET organization_id = $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE source_role.organization_id = $2
            AND NOT EXISTS (
              SELECT 1
              FROM org_roles AS target_role
              WHERE target_role.organization_id = $1
                AND target_role.key = source_role.key
            )
        `,
        [targetId, sourceId],
      );

      if (await queryRunner.hasTable('users')) {
        await queryRunner.query(
          `
            UPDATE users AS user_row
            SET org_role_id = target_role.id
            FROM org_roles AS source_role
            JOIN org_roles AS target_role
              ON target_role.organization_id = $1
             AND target_role.key = source_role.key
            WHERE source_role.organization_id = $2
              AND user_row.org_role_id = source_role.id
          `,
          [targetId, sourceId],
        );
      }

      if (await queryRunner.hasTable('org_role_permissions')) {
        await queryRunner.query(
          `
            UPDATE org_role_permissions AS target_permission
            SET actions = source_permission.actions,
                updated_at = CURRENT_TIMESTAMP
            FROM org_role_permissions AS source_permission
            JOIN org_roles AS source_role
              ON source_role.id = source_permission.role_id
            JOIN org_roles AS target_role
              ON target_role.organization_id = $1
             AND target_role.key = source_role.key
            WHERE source_role.organization_id = $2
              AND target_permission.role_id = target_role.id
              AND target_permission.module_key = source_permission.module_key
          `,
          [targetId, sourceId],
        );

        await queryRunner.query(
          `
            DELETE FROM org_role_permissions AS source_permission
            USING org_roles AS source_role,
                  org_roles AS target_role
            WHERE source_permission.role_id = source_role.id
              AND source_role.organization_id = $2
              AND target_role.organization_id = $1
              AND target_role.key = source_role.key
              AND EXISTS (
                SELECT 1
                FROM org_role_permissions AS target_permission
                WHERE target_permission.role_id = target_role.id
                  AND target_permission.module_key = source_permission.module_key
              )
          `,
          [targetId, sourceId],
        );

        await queryRunner.query(
          `
            UPDATE org_role_permissions AS source_permission
            SET role_id = target_role.id,
                organization_id = $1,
                updated_at = CURRENT_TIMESTAMP
            FROM org_roles AS source_role
            JOIN org_roles AS target_role
              ON target_role.organization_id = $1
             AND target_role.key = source_role.key
            WHERE source_permission.role_id = source_role.id
              AND source_role.organization_id = $2
          `,
          [targetId, sourceId],
        );

        await queryRunner.query('UPDATE org_role_permissions SET organization_id = $1 WHERE organization_id = $2', [targetId, sourceId]);
      }

      await queryRunner.query('DELETE FROM org_roles WHERE organization_id = $1', [sourceId]);
    } else if (await queryRunner.hasTable('org_role_permissions')) {
      await queryRunner.query('UPDATE org_role_permissions SET organization_id = $1 WHERE organization_id = $2', [targetId, sourceId]);
    }

    if (await queryRunner.hasTable('organization_features')) {
      await queryRunner.query(
        `
          UPDATE organization_features AS target_feature
          SET enabled = target_feature.enabled OR source_feature.enabled,
              updated_at = CURRENT_TIMESTAMP
          FROM organization_features AS source_feature
          WHERE source_feature.organization_id = $2
            AND target_feature.organization_id = $1
            AND target_feature.feature_key = source_feature.feature_key
        `,
        [targetId, sourceId],
      );

      await queryRunner.query(
        `
          UPDATE organization_features AS source_feature
          SET organization_id = $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE source_feature.organization_id = $2
            AND NOT EXISTS (
              SELECT 1
              FROM organization_features AS target_feature
              WHERE target_feature.organization_id = $1
                AND target_feature.feature_key = source_feature.feature_key
            )
        `,
        [targetId, sourceId],
      );

      await queryRunner.query('DELETE FROM organization_features WHERE organization_id = $1', [sourceId]);
    }

    if (await queryRunner.hasTable('esg_organization_target_entries')) {
      await queryRunner.query(
        `
          UPDATE esg_organization_target_entries AS target_entry
          SET
            metric_label = COALESCE(NULLIF(source_entry.metric_label, ''), target_entry.metric_label),
            category = COALESCE(NULLIF(source_entry.category, ''), target_entry.category),
            unit = COALESCE(source_entry.unit, target_entry.unit),
            target_value = source_entry.target_value,
            notes = COALESCE(source_entry.notes, target_entry.notes),
            updated_at = CURRENT_TIMESTAMP
          FROM esg_organization_target_entries AS source_entry
          WHERE source_entry.organization_id = $2
            AND target_entry.organization_id = $1
            AND target_entry.year = source_entry.year
            AND target_entry.metric_code = source_entry.metric_code
        `,
        [targetId, sourceId],
      );

      await queryRunner.query(
        `
          UPDATE esg_organization_target_entries AS source_entry
          SET organization_id = $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE source_entry.organization_id = $2
            AND NOT EXISTS (
              SELECT 1
              FROM esg_organization_target_entries AS target_entry
              WHERE target_entry.organization_id = $1
                AND target_entry.year = source_entry.year
                AND target_entry.metric_code = source_entry.metric_code
            )
        `,
        [targetId, sourceId],
      );

      await queryRunner.query('DELETE FROM esg_organization_target_entries WHERE organization_id = $1', [sourceId]);
    }

    if (await queryRunner.hasTable('org_rbac_meta')) {
      await queryRunner.query(
        `
          INSERT INTO org_rbac_meta (organization_id, version, updated_at)
          SELECT $1, 1, CURRENT_TIMESTAMP
          WHERE NOT EXISTS (
            SELECT 1
            FROM org_rbac_meta
            WHERE organization_id = $1
          )
        `,
        [targetId],
      );

      await queryRunner.query(
        `
          UPDATE org_rbac_meta AS target_meta
          SET
            version = GREATEST(target_meta.version, source_meta.version),
            updated_at = GREATEST(target_meta.updated_at, source_meta.updated_at)
          FROM org_rbac_meta AS source_meta
          WHERE target_meta.organization_id = $1
            AND source_meta.organization_id = $2
        `,
        [targetId, sourceId],
      );

      await queryRunner.query('DELETE FROM org_rbac_meta WHERE organization_id = $1', [sourceId]);
    }

    await queryRunner.query('DELETE FROM organizations WHERE id = $1', [sourceId]);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('organizations'))) {
      return;
    }

    const targetId = await this.resolveCanonicalOrganizationId(queryRunner);
    if (!targetId) {
      return;
    }

    const sourceOrganizationIds = await this.resolveSourceOrganizationIds(queryRunner, targetId);
    for (const sourceId of sourceOrganizationIds) {
      await this.mergeOrganizationIntoTarget(queryRunner, targetId, sourceId);
    }

    await queryRunner.query(
      `
        UPDATE organizations
        SET
          name = $2,
          code = $3,
          legal_name = COALESCE(legal_name, $4),
          is_active = TRUE,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [targetId, TARGET_ORG_NAME, TARGET_ORG_CODE, 'JK Fenner (INDIA) Limited'],
    );
  }

  public async down(): Promise<void> {
    // Intentionally irreversible data merge.
  }
}
