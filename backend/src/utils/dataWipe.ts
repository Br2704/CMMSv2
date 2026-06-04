import { AppDataSource } from '../database/data-source';
import { logger } from '../config/logger';

/**
 * Iteratively deletes all operational data for a specific scope (ALL, ORGANIZATION, or PLANT),
 * bypassing foreign key constraint issues by trying repeatedly until all applicable leaf records are deleted.
 * 
 * It targets all entities that have either an 'organization_id' or 'plant_id' column, ensuring global
 * configuration (like system users, roles, etc.) is preserved.
 */
export async function wipeScopedData(scope: 'ALL' | 'ORGANIZATION' | 'PLANT', opts?: { organizationId?: string; plantId?: string }) {
  if (scope === 'ORGANIZATION' && !opts?.organizationId) throw new Error("organizationId is required");
  if (scope === 'PLANT' && !opts?.plantId) throw new Error("plantId is required");

  // Find all entity metadata that have organization_id or plant_id
  const targetMetadatas = AppDataSource.entityMetadatas.filter(meta => 
    meta.columns.some(c => c.databaseName === 'plant_id' || c.databaseName === 'organization_id')
  );

  let plantIds: string[] = [];
  if (scope === 'ORGANIZATION') {
    const plants = await AppDataSource.query('SELECT id FROM plants WHERE organization_id = $1', [opts!.organizationId]);
    plantIds = plants.map((p: any) => p.id);
  }

  let remaining = new Set(targetMetadatas);
  let maxRetries = targetMetadatas.length * 2;
  let totalRowsDeleted = 0;

  while (remaining.size > 0 && maxRetries > 0) {
    let progressMade = false;

    for (const meta of Array.from(remaining)) {
      try {
        const hasPlantId = meta.columns.some(c => c.databaseName === 'plant_id');
        const hasOrgId = meta.columns.some(c => c.databaseName === 'organization_id');
        
        let qb = AppDataSource.createQueryBuilder().delete().from(meta.tableName);
        
        if (scope === 'PLANT') {
          if (!hasPlantId) {
            remaining.delete(meta);
            continue;
          }
          const propertyName = meta.columns.find(c => c.databaseName === 'plant_id')!.propertyName;
          qb.where(`${propertyName} = :id`, { id: opts!.plantId });
        } else if (scope === 'ORGANIZATION') {
          if (hasOrgId && hasPlantId) {
            const orgProp = meta.columns.find(c => c.databaseName === 'organization_id')!.propertyName;
            const plantProp = meta.columns.find(c => c.databaseName === 'plant_id')!.propertyName;
            qb.where(`${orgProp} = :orgId`, { orgId: opts!.organizationId });
            if (plantIds.length > 0) {
              qb.orWhere(`${plantProp} IN (:...plantIds)`, { plantIds });
            }
          } else if (hasOrgId) {
            const orgProp = meta.columns.find(c => c.databaseName === 'organization_id')!.propertyName;
            qb.where(`${orgProp} = :orgId`, { orgId: opts!.organizationId });
          } else if (hasPlantId) {
            if (plantIds.length === 0) {
              remaining.delete(meta);
              continue;
            }
            const plantProp = meta.columns.find(c => c.databaseName === 'plant_id')!.propertyName;
            qb.where(`${plantProp} IN (:...plantIds)`, { plantIds });
          }
        } else if (scope === 'ALL') {
          // No WHERE clause, delete everything from this scoped table
        }

        const result = await qb.execute();
        const affected = result.affected || 0;
        totalRowsDeleted += affected;
        
        // If we reach here without a foreign key error, we succeeded for this table in this pass!
        remaining.delete(meta);
        progressMade = true;
      } catch (err: any) {
        // FK errors are expected during iterative passes (e.g. Postgres code 23503)
        if (err.code === '23503') {
          // debug log only
        } else {
          logger.warn({ table: meta.tableName, err: err.message }, 'Unexpected error while wiping data table');
        }
      }
    }

    if (!progressMade) {
       logger.warn({ remainingTables: Array.from(remaining).map(r => r.tableName) }, "Could not delete remaining tables due to complex dependencies or circular constraints.");
       break;
    }
    maxRetries--;
  }
  
  return totalRowsDeleted;
}
