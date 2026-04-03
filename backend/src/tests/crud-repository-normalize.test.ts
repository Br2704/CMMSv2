import { CrudRepository } from '../modules/_core/crud.repository';

describe('CrudRepository payload normalization', () => {
  it('maps entity-backed payload keys to entity property names', () => {
    const repository = new CrudRepository({
      moduleName: 'organizations',
      moduleId: 'ORGANIZATIONS',
      basePath: '/api/organizations',
      tableName: 'organizations',
    });
    (repository as unknown as { getEntityMetadata: () => { columns: Array<{ propertyName: string; databaseName: string }> } | null }).getEntityMetadata = () => ({
      columns: [
        { propertyName: 'addressLine1', databaseName: 'address_line_1' },
        { propertyName: 'addressLine2', databaseName: 'address_line_2' },
        { propertyName: 'primaryContactPhone', databaseName: 'primary_contact_phone' },
      ],
    });

    const normalized = (repository as unknown as { normalizePayload: (input: Record<string, unknown>) => Record<string, unknown> })
      .normalizePayload({
        addressLine1: null,
        address_line_2: 'Line 2',
        primaryContactPhone: '1234567890',
        superadminUserIds: [],
      });

    expect(normalized).toMatchObject({
      addressLine1: null,
      addressLine2: 'Line 2',
      primaryContactPhone: '1234567890',
    });
    expect(normalized).not.toHaveProperty('address_line_1');
    expect(normalized).not.toHaveProperty('address_line_2');
    expect(normalized).not.toHaveProperty('superadminUserIds');
  });

  it('falls back to underscored column names when no entity metadata is available', () => {
    const repository = new CrudRepository({
      moduleName: 'organizations',
      moduleId: 'ORGANIZATIONS',
      basePath: '/api/organizations',
      tableName: 'organizations',
    });

    const normalized = (repository as unknown as { normalizePayload: (input: Record<string, unknown>) => Record<string, unknown> })
      .normalizePayload({
        addressLine1: null,
        primaryContactPhone: '1234567890',
      });

    expect(normalized).toMatchObject({
      address_line_1: null,
      primary_contact_phone: '1234567890',
    });
  });
});
