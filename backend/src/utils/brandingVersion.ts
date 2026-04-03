import { AppDataSource } from '../database/data-source';
import { BrandingMetaEntity } from '../database/entities';

const BRANDING_META_ID = 1;

async function ensureBrandingMetaRow() {
  const repo = AppDataSource.getRepository(BrandingMetaEntity);
  let row = await repo.findOneBy({ id: BRANDING_META_ID });
  if (!row) {
    row = repo.create({ id: BRANDING_META_ID, version: 1 });
    row = await repo.save(row);
  }
  return row;
}

export async function getBrandingVersion(): Promise<{ version: number; updatedAt: string }> {
  const row = await ensureBrandingMetaRow();
  return { version: row.version, updatedAt: row.updatedAt.toISOString() };
}

export async function bumpBrandingVersion(): Promise<{ version: number; updatedAt: string }> {
  const repo = AppDataSource.getRepository(BrandingMetaEntity);
  const row = await ensureBrandingMetaRow();
  row.version += 1;
  const saved = await repo.save(row);
  return { version: saved.version, updatedAt: saved.updatedAt.toISOString() };
}

