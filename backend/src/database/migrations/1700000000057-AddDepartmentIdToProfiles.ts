import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddDepartmentIdToProfiles1700000000057 implements MigrationInterface {
  name = 'AddDepartmentIdToProfiles1700000000057';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('profiles');
    if (!table) return;

    // Add department_id column (uuid, nullable) if it doesn't exist
    if (!table.columns.find((col) => col.name === 'department_id')) {
      await queryRunner.addColumn(
        'profiles',
        new TableColumn({
          name: 'department_id',
          type: 'uuid',
          isNullable: true,
        }),
      );

      // Add foreign key from profiles.department_id -> departments.id
      const hasFk = table.foreignKeys.some(
        (fk) =>
          fk.columnNames.length === 1 &&
          fk.columnNames[0] === 'department_id' &&
          fk.referencedTableName === 'departments',
      );
      if (!hasFk) {
        await queryRunner.createForeignKey(
          'profiles',
          new TableForeignKey({
            columnNames: ['department_id'],
            referencedTableName: 'departments',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('profiles');
    if (!table) return;

    const departmentIdFk = table.foreignKeys.find(
      (fk) =>
        fk.columnNames.length === 1 && fk.columnNames[0] === 'department_id',
    );
    if (departmentIdFk) {
      await queryRunner.dropForeignKey('profiles', departmentIdFk);
    }

    if (table.columns.find((col) => col.name === 'department_id')) {
      await queryRunner.dropColumn('profiles', 'department_id');
    }
  }
}
