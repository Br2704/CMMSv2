import { Router } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { AssetEntity, DepartmentEntity, MachineModuleEntity, OrganizationEntity, PlantEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess } from '../../middlewares/permissions';
import { logger } from '../../config/logger';
import { ok } from '../../utils/apiResponse';

const masterDataQuerySchema = z.object({
  plantId: z.string().uuid().optional(),
  includeInactive: z.preprocess((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase());
    return false;
  }, z.boolean().default(false)),
});

function buildHierarchy(input: {
  organizations: OrganizationEntity[];
  plants: PlantEntity[];
  departments: DepartmentEntity[];
  modules: MachineModuleEntity[];
  assets: AssetEntity[];
}) {
  const departmentsByPlant = new Map<string, DepartmentEntity[]>();
  const modulesByDepartment = new Map<string, MachineModuleEntity[]>();
  const assetsByModule = new Map<string, AssetEntity[]>();

  input.departments.forEach((department) => {
    const bucket = departmentsByPlant.get(department.plantId ?? '') ?? [];
    bucket.push(department);
    departmentsByPlant.set(department.plantId ?? '', bucket);
  });
  input.modules.forEach((module) => {
    const bucket = modulesByDepartment.get(module.departmentId ?? '') ?? [];
    bucket.push(module);
    modulesByDepartment.set(module.departmentId ?? '', bucket);
  });
  input.assets.forEach((asset) => {
    const bucket = assetsByModule.get(asset.moduleId ?? '') ?? [];
    bucket.push(asset);
    assetsByModule.set(asset.moduleId ?? '', bucket);
  });

  return input.organizations.map((organization) => ({
    organization,
    plants: input.plants
      .filter((plant) => plant.organizationId === organization.id)
      .map((plant) => ({
        plant,
        departments: (departmentsByPlant.get(plant.id) ?? []).map((department) => ({
          department,
          modules: (modulesByDepartment.get(department.id) ?? []).map((module) => ({
            module,
            assets: assetsByModule.get(module.id) ?? [],
          })),
        })),
      })),
  }));
}

export const masterDataRouter = Router();
masterDataRouter.use(requireAuth);

masterDataRouter.get('/graph', async (req, res, next) => {
  try {
    const query = masterDataQuerySchema.parse(req.query);
    if (query.plantId) {
      ensurePlantAccess(req, query.plantId);
    }

    const plantRepo = AppDataSource.getRepository(PlantEntity);
    const departmentRepo = AppDataSource.getRepository(DepartmentEntity);
    const moduleRepo = AppDataSource.getRepository(MachineModuleEntity);
    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const organizationRepo = AppDataSource.getRepository(OrganizationEntity);

    const plantWhere =
      req.auth?.scopeType === 'ROOT_ADMIN'
        ? query.plantId
          ? { id: query.plantId }
          : {}
        : query.plantId
          ? { id: query.plantId }
          : req.auth?.plantIds.length
            ? { id: In(req.auth.plantIds) }
            : { id: In([]) };

    const plants = await plantRepo.find({
      where: query.includeInactive ? plantWhere : { ...plantWhere, isActive: true },
      order: { plantName: 'ASC' },
    });
    const plantIds = plants.map((plant) => plant.id);
    const organizationIds = Array.from(new Set(plants.map((plant) => plant.organizationId).filter(Boolean)));

    const [organizations, departments, modules, assets] = await Promise.all([
      organizationIds.length
        ? organizationRepo.find({
            where: query.includeInactive ? { id: In(organizationIds) } : { id: In(organizationIds), isActive: true },
            order: { name: 'ASC' },
          })
        : Promise.resolve([]),
      plantIds.length
        ? departmentRepo.find({
            where: query.includeInactive ? { plantId: In(plantIds) } : { plantId: In(plantIds), isActive: true },
            order: { name: 'ASC' },
          })
        : Promise.resolve([]),
      plantIds.length
        ? moduleRepo.find({
            where: query.includeInactive ? { plantId: In(plantIds) } : { plantId: In(plantIds), isActive: true },
            order: { name: 'ASC' },
          })
        : Promise.resolve([]),
      plantIds.length
        ? assetRepo.find({
            where: query.includeInactive ? { plantId: In(plantIds) } : { plantId: In(plantIds), isActive: true },
            order: { name: 'ASC' },
          })
        : Promise.resolve([]),
    ]);

    const hierarchy = buildHierarchy({ organizations, plants, departments, modules, assets });

    res.json(
      ok(
        {
          organizations,
          plants,
          departments,
          modules,
          assets,
          hierarchy,
        },
        'Master data graph fetched',
      ),
    );
  } catch (error: any) {
    logger.error({
      msg: 'MasterDataGraph error',
      error: error.message,
      stack: error.stack,
      query: req.query,
      auth: req.auth ? {
        userId: req.auth.userId,
        scopeType: req.auth.scopeType,
        plantIds: req.auth.plantIds,
      } : 'missing'
    });
    next(error);
  }
});
