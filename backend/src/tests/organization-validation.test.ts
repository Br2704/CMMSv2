import { createOrganizationSchema } from '../modules/organizations/organizations.validators';

describe('Organization validation', () => {
  it('accepts safe data-url branding images', () => {
    const parsed = createOrganizationSchema.parse({
      name: 'Administration',
      code: 'PLANT_ADMIN',
      logoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2eQAAAAASUVORK5CYII=',
      faviconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2eQAAAAASUVORK5CYII=',
      brandColor: '#0f172a',
      isActive: true,
    });

    expect(parsed.logoUrl).toContain('data:image/png;base64,');
    expect(parsed.faviconUrl).toContain('data:image/png;base64,');
  });

  it('accepts svg logos and ico favicons from the new organization form', () => {
    const parsed = createOrganizationSchema.parse({
      name: 'Administration',
      code: 'PLANT_ADMIN',
      logoUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
      faviconUrl: 'data:image/x-icon;base64,AAABAAEA',
      brandColor: '#0f172a',
      isActive: true,
    });

    expect(parsed.logoUrl).toContain('data:image/svg+xml;base64,');
    expect(parsed.faviconUrl).toContain('data:image/x-icon;base64,');
  });

  it('accepts root-relative branding image urls served by the app', () => {
    const parsed = createOrganizationSchema.parse({
      name: 'Administration',
      code: 'PLANT_ADMIN',
      logoUrl: '/api/branding/logo?orgId=1f736dcc-7270-4b19-bd59-12d40fdf62ba&v=1',
      faviconUrl: '/profile-images/root-admin-tamoptix.png',
      brandColor: '#0f172a',
      isActive: true,
    });

    expect(parsed.logoUrl).toBe('/api/branding/logo?orgId=1f736dcc-7270-4b19-bd59-12d40fdf62ba&v=1');
    expect(parsed.faviconUrl).toBe('/profile-images/root-admin-tamoptix.png');
  });

  it('rejects invalid branding image values', () => {
    const result = createOrganizationSchema.safeParse({
      name: 'Administration',
      code: 'PLANT_ADMIN',
      logoUrl: 'javascript:alert(1)',
      isActive: true,
    });

    expect(result.success).toBe(false);
  });
});
