import { AppDataSource } from '../database/data-source';
import { OrgRbacMetaEntity } from '../database/entities';
import { emitDashboardRefresh } from '../realtime/dashboard-socket';

async function ensureOrgMetaRow(organizationId: string) {
  const repo = AppDataSource.getRepository(OrgRbacMetaEntity);
  let row = await repo.findOneBy({ organizationId });
  if (!row) {
    row = repo.create({ organizationId, version: 1 });
    row = await repo.save(row);
  }
  return row;
}

export async function getOrgRbacVersion(organizationId: string): Promise<number> {
  const row = await ensureOrgMetaRow(organizationId);
  return row.version;
}

export async function bumpOrgRbacVersion(organizationId: string): Promise<number> {
  const repo = AppDataSource.getRepository(OrgRbacMetaEntity);
  const row = await ensureOrgMetaRow(organizationId);
  row.version += 1;
  const saved = await repo.save(row);
  
  try {
    emitDashboardRefresh('mutation');
  } catch {
    // Ignore failures if the WebSocket server is offline or restarting
  }

  return saved.version;
}

