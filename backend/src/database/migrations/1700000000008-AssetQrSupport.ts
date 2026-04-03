import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AssetQrSupport1700000000008 implements MigrationInterface {
  name = 'AssetQrSupport1700000000008';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dateTime = this.dateTimeType(queryRunner);

    if (!(await queryRunner.hasColumn('assets', 'qr_code_id'))) {
      await queryRunner.query('ALTER TABLE assets ADD COLUMN qr_code_id varchar(64) NULL');
    }

    const assetsTable = await queryRunner.getTable('assets');
    if (assetsTable && !assetsTable.indices.some((index) => index.name === 'uq_assets_qr_code_id')) {
      await queryRunner.createIndex(
        'assets',
        new TableIndex({
          name: 'uq_assets_qr_code_id',
          columnNames: ['qr_code_id'],
          isUnique: true,
        }),
      );
    }

    if (!(await queryRunner.hasTable('asset_qr'))) {
      await queryRunner.createTable(
        new Table({
          name: 'asset_qr',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'asset_id', type: 'uuid' },
            { name: 'qr_token', type: 'varchar', length: '128' },
            { name: 'rotated_at', type: dateTime, isNullable: true },
            { name: 'created_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    const assetQrTable = await queryRunner.getTable('asset_qr');
    if (!assetQrTable) {
      return;
    }

    if (!assetQrTable.foreignKeys.some((fk) => fk.name === 'fk_asset_qr_asset_id')) {
      await queryRunner.createForeignKey(
        'asset_qr',
        new TableForeignKey({
          name: 'fk_asset_qr_asset_id',
          columnNames: ['asset_id'],
          referencedTableName: 'assets',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    if (!assetQrTable.indices.some((index) => index.name === 'uq_asset_qr_asset_id')) {
      await queryRunner.createIndex(
        'asset_qr',
        new TableIndex({
          name: 'uq_asset_qr_asset_id',
          columnNames: ['asset_id'],
          isUnique: true,
        }),
      );
    }

    if (!assetQrTable.indices.some((index) => index.name === 'uq_asset_qr_qr_token')) {
      await queryRunner.createIndex(
        'asset_qr',
        new TableIndex({
          name: 'uq_asset_qr_qr_token',
          columnNames: ['qr_token'],
          isUnique: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('asset_qr')) {
      const assetQrTable = await queryRunner.getTable('asset_qr');
      if (assetQrTable?.indices?.length) {
        for (const index of assetQrTable.indices) {
          await queryRunner.dropIndex('asset_qr', index);
        }
      }
      if (assetQrTable?.foreignKeys?.length) {
        for (const fk of assetQrTable.foreignKeys) {
          await queryRunner.dropForeignKey('asset_qr', fk);
        }
      }
      await queryRunner.dropTable('asset_qr');
    }

    const assetsTable = await queryRunner.getTable('assets');
    if (assetsTable?.indices.some((index) => index.name === 'uq_assets_qr_code_id')) {
      await queryRunner.dropIndex('assets', 'uq_assets_qr_code_id');
    }

    if (await queryRunner.hasColumn('assets', 'qr_code_id')) {
      await queryRunner.query('ALTER TABLE assets DROP COLUMN qr_code_id');
    }
  }
}
