import { AppDataSource } from '../database/data-source';
import { RbacMetaEntity } from '../database/entities';
import { emitDashboardRefresh } from '../realtime/dashboard-socket';

const RBAC_META_ID = 1;

async function ensureMetaRow() {
  const repo = AppDataSource.getRepository(RbacMetaEntity);
  let row = await repo.findOneBy({ id: RBAC_META_ID });
  if (!row) {
    row = repo.create({ id: RBAC_META_ID, version: 1 });
    row = await repo.save(row);
  }
  return row;
}

export async function getRbacVersion(): Promise<number> {
  const row = await ensureMetaRow();
  return row.version;
}

export async function bumpRbacVersion(): Promise<number> {
  const repo = AppDataSource.getRepository(RbacMetaEntity);
  const row = await ensureMetaRow();
  row.version += 1;
  const saved = await repo.save(row);
  
  try {
    emitDashboardRefresh('mutation');
  } catch {
    // Ignore failures if the WebSocket server is offline or restarting
  }

  return saved.version;
}

