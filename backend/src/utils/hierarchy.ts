import { AppDataSource } from '../database/data-source';
import { AssetEntity, DepartmentEntity, MachineModuleEntity, OrganizationEntity, PlantEntity } from '../database/entities';

export async function validateMasterHierarchy(input: {
  organizationId?: string | null;
  plantId?: string | null;
  departmentId?: string | null;
  moduleId?: string | null;
  assetId?: string | null;
}) {
  const organizationRepo = AppDataSource.getRepository(OrganizationEntity);
  const plantRepo = AppDataSource.getRepository(PlantEntity);
  const departmentRepo = AppDataSource.getRepository(DepartmentEntity);
  const moduleRepo = AppDataSource.getRepository(MachineModuleEntity);
  const assetRepo = AppDataSource.getRepository(AssetEntity);

  const organization = input.organizationId ? await organizationRepo.findOneBy({ id: input.organizationId, isActive: true }) : null;
  if (input.organizationId && !organization) {
    throw new Error('Organization not found or inactive');
  }

  const plant = input.plantId ? await plantRepo.findOneBy({ id: input.plantId, isActive: true }) : null;
  if (input.plantId && !plant) {
    throw new Error('Plant not found or inactive');
  }
  if (organization && plant && plant.organizationId !== organization.id) {
    throw new Error('Plant does not belong to the selected organization');
  }

  const department = input.departmentId ? await departmentRepo.findOneBy({ id: input.departmentId, isActive: true }) : null;
  if (input.departmentId && !department) {
    throw new Error('Department not found or inactive');
  }
  if (plant && department && department.plantId !== plant.id) {
    throw new Error('Department does not belong to the selected plant');
  }

  const module = input.moduleId ? await moduleRepo.findOneBy({ id: input.moduleId, isActive: true }) : null;
  if (input.moduleId && !module) {
    throw new Error('Module not found or inactive');
  }
  if (plant && module && module.plantId !== plant.id) {
    throw new Error('Module does not belong to the selected plant');
  }
  if (department && module && module.departmentId !== department.id) {
    throw new Error('Module does not belong to the selected department');
  }

  const asset = input.assetId ? await assetRepo.findOneBy({ id: input.assetId, isActive: true }) : null;
  if (input.assetId && !asset) {
    throw new Error('Machine not found or inactive');
  }
  if (plant && asset && asset.plantId !== plant.id) {
    throw new Error('Machine does not belong to the selected plant');
  }
  if (department && asset && asset.departmentId !== department.id) {
    throw new Error('Machine does not belong to the selected department');
  }
  if (module && asset && asset.moduleId !== module.id) {
    throw new Error('Machine does not belong to the selected module');
  }

  return { organization, plant, department, module, asset };
}

type BreakdownRow = {
  label: string;
  count: number;
};

export async function getHierarchyConsistencyBreakdown() {
  const assetRepo = AppDataSource.getRepository(AssetEntity);
  const departmentRepo = AppDataSource.getRepository(DepartmentEntity);
  const moduleRepo = AppDataSource.getRepository(MachineModuleEntity);
  const plantRepo = AppDataSource.getRepository(PlantEntity);

  const [
    plantsMissingOrganization,
    departmentsMissingPlant,
    modulesMissingDepartment,
    assetsMissingModule,
    modulesPlantMismatch,
    assetsDepartmentMismatch,
    assetsModuleMismatch,
  ] = await Promise.all([
    plantRepo
      .createQueryBuilder('plant')
      .leftJoin('organizations', 'org', 'org.id = plant.organization_id')
      .where('plant.is_active = :active', { active: true })
      .andWhere('(plant.organization_id IS NULL OR org.id IS NULL)')
      .getCount(),
    departmentRepo
      .createQueryBuilder('department')
      .leftJoin('plants', 'plant', 'plant.id = department.plant_id')
      .where('department.is_active = :active', { active: true })
      .andWhere('(department.plant_id IS NULL OR plant.id IS NULL)')
      .getCount(),
    moduleRepo
      .createQueryBuilder('module')
      .leftJoin('departments', 'department', 'department.id = module.department_id')
      .where('module.is_active = :active', { active: true })
      .andWhere('(module.department_id IS NULL OR department.id IS NULL)')
      .getCount(),
    assetRepo
      .createQueryBuilder('asset')
      .leftJoin('machine_modules', 'module', 'module.id = asset.module_id')
      .where('asset.is_active = :active', { active: true })
      .andWhere('(asset.module_id IS NULL OR module.id IS NULL)')
      .getCount(),
    moduleRepo
      .createQueryBuilder('module')
      .innerJoin('departments', 'department', 'department.id = module.department_id')
      .where('module.is_active = :active', { active: true })
      .andWhere('department.plant_id IS DISTINCT FROM module.plant_id')
      .getCount(),
    assetRepo
      .createQueryBuilder('asset')
      .innerJoin('departments', 'department', 'department.id = asset.department_id')
      .where('asset.is_active = :active', { active: true })
      .andWhere('department.plant_id IS DISTINCT FROM asset.plant_id')
      .getCount(),
    assetRepo
      .createQueryBuilder('asset')
      .innerJoin('machine_modules', 'module', 'module.id = asset.module_id')
      .where('asset.is_active = :active', { active: true })
      .andWhere('(module.department_id IS DISTINCT FROM asset.department_id OR module.plant_id IS DISTINCT FROM asset.plant_id)')
      .getCount(),
  ]);

  const rows: BreakdownRow[] = [
    { label: 'plants_missing_organization', count: plantsMissingOrganization },
    { label: 'departments_missing_plant', count: departmentsMissingPlant },
    { label: 'modules_missing_department', count: modulesMissingDepartment },
    { label: 'assets_missing_module', count: assetsMissingModule },
    { label: 'modules_plant_mismatch', count: modulesPlantMismatch },
    { label: 'assets_department_plant_mismatch', count: assetsDepartmentMismatch },
    { label: 'assets_module_scope_mismatch', count: assetsModuleMismatch },
  ];

  return {
    total: rows.reduce((sum, row) => sum + row.count, 0),
    rows,
  };
}
