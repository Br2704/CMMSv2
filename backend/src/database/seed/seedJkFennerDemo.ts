import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../utils/password';
import { normalizeRoleName } from '../../utils/rbac';
import { ensureDefaultWorkOrderMasters } from '../../modules/workOrderMasters/work-order-master.helpers';
import { AppDataSource } from '../data-source';
import {
    AssetEntity,
    CalibrationRecordEntity,
    CalibrationTemplateEntity,
    CostCenterEntity,
    DepartmentEntity,
    GateEntryEntity,
    GateEntryTypeEntity,
    GateEntity,
    GateTemplateFieldEntity,
    GateTemplateUserEntity,
    LogEntryEntity,
    LogEntryValueEntity,
    LogTemplateAssignmentEntity,
    LogTemplateEntity,
    LogTemplateFieldEntity,
    MachineModuleEntity,
    MaintenanceTeamEntity,
    OrganizationEntity,
    PlantEntity,
    PmScheduleEntity,
    PmTemplateEntity,
    PmTemplateLinkEntity,
    ProfileEntity,
    RoleEntity,
    ShiftEntity,
    SpareItemEntity,
    UserEntity,
    UserRoleEntity,
    VendorEntity,
    VisitorExperienceContentEntity,
    VisitorNavigationLogEntity,
    VisitorSafetyLogEntity,
    VisitorSessionEntity,
    WorkOrderEntity,
    WorkOrderTeamMappingEntity,
} from '../entities';
import type { DeepPartial, FindOptionsWhere, Repository } from 'typeorm';

type PlantKey = 'MADURAI' | 'NILAKOTTAI';
type RoleMap = Map<string, RoleEntity>;

const DEMO_PASSWORD = 'Demo@12345';

const ORGANIZATION_SEED = {
    name: 'JK Fenner',
    code: 'JKF',
    legalName: 'JK Fenner (INDIA) Limited',
    industry: 'Rubber Belt Manufacturing',
    website: 'https://www.jkfenner.com',
    contactEmail: 'info@jkfenner.demo',
    contactPhone: '+91-452-400-1000',
    city: 'Madurai',
    state: 'Tamil Nadu',
    country: 'India',
    isActive: true,
};

const LEGACY_ORGANIZATION_MATCH = {
    name: 'JK Fenner (India) Limited',
    code: 'JKFENNER',
};

const PLANT_SEEDS: Array<{ key: PlantKey; tag: string; cityTag: string; code: string; name: string; location: string }> = [
    {
        key: 'MADURAI',
        tag: 'MDU',
        cityTag: 'madurai',
        code: 'JKF-MDU',
        name: 'JK Fenner - Madurai',
        location: 'Madurai, Tamil Nadu',
    },
    {
        key: 'NILAKOTTAI',
        tag: 'NLK',
        cityTag: 'nilakottai',
        code: 'JKF-NLK',
        name: 'JK Fenner - Nilakottai',
        location: 'Nilakottai, Tamil Nadu',
    },
];

const DEPARTMENT_SEEDS = [
    { code: 'POLYV', name: 'Poly V' },
    { code: 'REC', name: 'REC' },
    { code: 'UTILITY', name: 'Utility' },
    { code: 'MIXING', name: 'Mixing' },
    { code: 'CURING', name: 'Curing' },
    { code: 'QUALITY', name: 'Quality Assurance' },
    { code: 'MAINT', name: 'Maintenance' },
    { code: 'STORES', name: 'Stores' },
    { code: 'SAFETY', name: 'Safety' },
] as const;

const MODULE_SEEDS = [
    { key: 'polyvExtrusion', code: 'PV-EXT', name: 'Poly V Extrusion Line', departmentCode: 'POLYV' },
    { key: 'polyvCord', code: 'PV-CORD', name: 'Poly V Cord Winding Line', departmentCode: 'POLYV' },
    { key: 'recCutting', code: 'REC-CUT', name: 'REC Cutting and Joining Line', departmentCode: 'REC' },
    { key: 'recPress', code: 'REC-PRS', name: 'REC Press Line', departmentCode: 'REC' },
    { key: 'boilerHouse', code: 'UTL-BLR', name: 'Boiler House', departmentCode: 'UTILITY' },
    { key: 'compressorBay', code: 'UTL-AIR', name: 'Air Compressor Bay', departmentCode: 'UTILITY' },
    { key: 'mixingBanbury', code: 'MIX-BAN', name: 'Banbury Mixing Line', departmentCode: 'MIXING' },
    { key: 'curingPressA', code: 'CUR-PRSA', name: 'Curing Press Bank A', departmentCode: 'CURING' },
    { key: 'qualityLab', code: 'QLT-LAB', name: 'Quality Lab Testing Bench', departmentCode: 'QUALITY' },
    { key: 'maintenanceShop', code: 'MNT-SHOP', name: 'Maintenance Workshop', departmentCode: 'MAINT' },
] as const;

const USER_SEEDS = [
    { key: 'plantAdmin', role: 'PLANT_ADMIN', code: 'PADM', email: 'plantadmin', fullName: 'Plant Admin', department: 'Administration' },
    { key: 'maintenanceManager', role: 'MAINTENANCE_MANAGER', code: 'MMGR', email: 'maint.manager', fullName: 'Maintenance Manager', department: 'Maintenance' },
    { key: 'engineer', role: 'ENGINEER', code: 'ENGR', email: 'engineer', fullName: 'Maintenance Engineer', department: 'Maintenance' },
    { key: 'technician', role: 'TECHNICIAN', code: 'TECH', email: 'technician', fullName: 'Technician', department: 'Maintenance' },
    { key: 'storeUser', role: 'STORE_USER', code: 'STRU', email: 'store', fullName: 'Store User', department: 'Stores' },
    { key: 'securityUser', role: 'SECURITY_USER', code: 'SECU', email: 'security', fullName: 'Security User', department: 'Security' },
    { key: 'viewer', role: 'VIEWER', code: 'VIEW', email: 'viewer', fullName: 'Viewer', department: 'Operations' },
    { key: 'operator', role: 'USER', code: 'OPER', email: 'operator', fullName: 'Plant Operator', department: 'Production' },
    { key: 'visitor', role: 'TEMPORARY_VISITOR', code: 'VIST', email: 'visitor', fullName: 'Visitor User', department: 'Visitor' },
] as const;

const TEAM_SEEDS = [
    {
        key: 'mechanicalTeam',
        teamName: 'Mechanical Response Team',
        discipline: 'MECHANICAL',
        leaderUserKey: 'maintenanceManager',
        memberUserKeys: ['engineer', 'technician'],
    },
    {
        key: 'utilityTeam',
        teamName: 'Electrical and Utility Team',
        discipline: 'ELECTRICAL',
        leaderUserKey: 'engineer',
        memberUserKeys: ['technician'],
    },
    {
        key: 'productionTeam',
        teamName: 'Production Support Team',
        discipline: 'PRODUCTION',
        leaderUserKey: 'plantAdmin',
        memberUserKeys: ['operator', 'maintenanceManager'],
    },
    {
        key: 'qualityTeam',
        teamName: 'Quality and Calibration Team',
        discipline: 'CALIBRATION',
        leaderUserKey: 'engineer',
        memberUserKeys: ['technician'],
    },
] as const;

const ASSET_SEEDS = [
    {
        key: 'polyvExtruder01',
        code: 'PV-EXT-01',
        name: 'Poly V Extruder 01',
        departmentCode: 'POLYV',
        moduleKey: 'polyvExtrusion',
        assetType: 'EXTRUDER',
        criticality: 'HIGH',
        location: 'Poly V Bay 1',
    },
    {
        key: 'polyvCord01',
        code: 'PV-CRD-01',
        name: 'Poly V Cord Winder 01',
        departmentCode: 'POLYV',
        moduleKey: 'polyvCord',
        assetType: 'WINDER',
        criticality: 'MEDIUM',
        location: 'Poly V Bay 2',
    },
    {
        key: 'recPress01',
        code: 'REC-PRS-01',
        name: 'REC Press 01',
        departmentCode: 'REC',
        moduleKey: 'recPress',
        assetType: 'PRESS',
        criticality: 'HIGH',
        location: 'REC Press Area',
    },
    {
        key: 'boiler01',
        code: 'UTL-BLR-01',
        name: 'Boiler Unit 01',
        departmentCode: 'UTILITY',
        moduleKey: 'boilerHouse',
        assetType: 'BOILER',
        criticality: 'HIGH',
        location: 'Utility Boiler House',
    },
    {
        key: 'compressor01',
        code: 'UTL-AIR-01',
        name: 'Air Compressor 01',
        departmentCode: 'UTILITY',
        moduleKey: 'compressorBay',
        assetType: 'COMPRESSOR',
        criticality: 'MEDIUM',
        location: 'Utility Air Bay',
    },
    {
        key: 'mixingBanbury01',
        code: 'MIX-BAN-01',
        name: 'Banbury Mixer 01',
        departmentCode: 'MIXING',
        moduleKey: 'mixingBanbury',
        assetType: 'MIXER',
        criticality: 'HIGH',
        location: 'Mixing Hall',
    },
    {
        key: 'curingPressA01',
        code: 'CUR-PRS-A01',
        name: 'Curing Press A01',
        departmentCode: 'CURING',
        moduleKey: 'curingPressA',
        assetType: 'CURING_PRESS',
        criticality: 'HIGH',
        location: 'Curing Section A',
    },
    {
        key: 'qualityBench01',
        code: 'QLT-LAB-01',
        name: 'Quality Lab Bench 01',
        departmentCode: 'QUALITY',
        moduleKey: 'qualityLab',
        assetType: 'TEST_BENCH',
        criticality: 'MEDIUM',
        location: 'QC Lab',
    },
] as const;

const SPARE_SEEDS = [
    { code: 'BRG-6205', name: 'Bearing 6205', category: 'Bearing', currentStock: 120, minLevel: 30, reorderLevel: 50, unit: 'Nos', isCritical: true },
    { code: 'BELT-3VX', name: 'V-Belt 3VX', category: 'Belts', currentStock: 90, minLevel: 20, reorderLevel: 35, unit: 'Nos', isCritical: true },
    { code: 'SEAL-ORING', name: 'O-Ring Seal Kit', category: 'Seals', currentStock: 150, minLevel: 40, reorderLevel: 70, unit: 'Kit', isCritical: false },
    { code: 'LUB-ISO68', name: 'Lubricant ISO 68', category: 'Lubricant', currentStock: 60, minLevel: 15, reorderLevel: 25, unit: 'L', isCritical: false },
] as const;

interface PlantContext {
    plant: PlantEntity;
    tag: string;
    cityTag: string;
    departments: Map<string, DepartmentEntity>;
    modules: Map<string, MachineModuleEntity>;
    costCenters: Map<string, CostCenterEntity>;
    users: Map<string, UserEntity>;
    teams: Map<string, MaintenanceTeamEntity>;
    assets: Map<string, AssetEntity>;
    shifts: Map<string, ShiftEntity>;
    gates: Map<string, GateEntity>;
}

function roleNameKey(name: string) {
    return name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function resolveRoleEntity(roleMap: RoleMap, roleName: string): RoleEntity | null {
    const exact = roleMap.get(roleNameKey(roleName));
    if (exact) return exact;
    const normalized = roleMap.get(roleNameKey(normalizeRoleName(roleName)));
    return normalized ?? null;
}

function toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
    const next = new Date(base);
    next.setDate(next.getDate() + days);
    return next;
}

function asJson<T extends Record<string, unknown>>(value: T): T {
    return value;
}

async function upsertEntity<T extends object>(
    repo: Repository<T>,
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    payload: DeepPartial<T>,
): Promise<T> {
    const existing = await repo.findOne({ where });
    if (existing) {
        Object.assign(existing as object, payload as object);
        return repo.save(existing);
    }

    const createPayload = { ...(payload as Record<string, unknown>) } as Record<string, unknown>;
    if (!createPayload.id) {
        createPayload.id = randomUUID();
    }

    return repo.save(repo.create(createPayload as DeepPartial<T>));
}

async function upsertUserWithRole(input: {
    roleMap: RoleMap;
    organizationId: string;
    plantId: string;
    role: string;
    email: string;
    fullName: string;
    userCode: string;
    department: string;
}) {
    const userRepo = AppDataSource.getRepository(UserEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const userRoleRepo = AppDataSource.getRepository(UserRoleEntity);

    const normalizedEmail = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(DEMO_PASSWORD);

    const user = await upsertEntity(
        userRepo,
        { email: normalizedEmail },
        {
            email: normalizedEmail,
            passwordHash,
            fullName: input.fullName,
            phone: null,
            isActive: true,
            organizationId: input.organizationId,
            orgRoleId: null,
            failedLoginCount: 0,
            lockedUntil: null,
        },
    );

    await upsertEntity(
        profileRepo,
        [{ userId: user.id } as FindOptionsWhere<ProfileEntity>, { userCode: input.userCode } as FindOptionsWhere<ProfileEntity>],
        {
            userId: user.id,
            userCode: input.userCode,
            fullName: input.fullName,
            email: normalizedEmail,
            phone: null,
            profileImageUrl: null,
            plantId: input.plantId,
            department: input.department,
            isActive: true,
        },
    );

    const roleEntity = resolveRoleEntity(input.roleMap, input.role);
    const canonicalRole = roleEntity?.name ?? normalizeRoleName(input.role);
    await upsertEntity(
        userRoleRepo,
        {
            userId: user.id,
            role: canonicalRole,
            plantId: input.plantId,
        } as FindOptionsWhere<UserRoleEntity>,
        {
            userId: user.id,
            roleId: roleEntity?.id ?? null,
            role: canonicalRole,
            plantId: input.plantId,
        },
    );

    return user;
}

async function upsertWorkOrderTeamMapping(input: {
    plantId: string;
    departmentId: string | null;
    category: string;
    teamId: string;
}) {
    const repo = AppDataSource.getRepository(WorkOrderTeamMappingEntity);

    const query = repo
        .createQueryBuilder('mapping')
        .where('mapping.plant_id = :plantId', { plantId: input.plantId })
        .andWhere('mapping.category = :category', { category: input.category });

    if (input.departmentId) {
        query.andWhere('mapping.department_id = :departmentId', { departmentId: input.departmentId });
    } else {
        query.andWhere('mapping.department_id IS NULL');
    }

    let entity = await query.getOne();
    if (!entity) {
        entity = repo.create({
            id: randomUUID(),
            plantId: input.plantId,
            departmentId: input.departmentId,
            category: input.category,
            teamId: input.teamId,
        });
    } else {
        entity.teamId = input.teamId;
        entity.departmentId = input.departmentId;
    }

    return repo.save(entity);
}

async function upsertVisitorSession(input: {
    gateEntryId: string;
    visitorUserId: string | null;
    plantId: string;
    sessionToken: string;
    mobileNumber: string | null;
    startTime: Date;
    endTime: Date;
    createdBy: string | null;
}) {
    const repo = AppDataSource.getRepository(VisitorSessionEntity);
    const existing = await repo.findOne({ where: { gateEntryId: input.gateEntryId } });
    const payload: DeepPartial<VisitorSessionEntity> = {
        gateEntryId: input.gateEntryId,
        visitorUserId: input.visitorUserId,
        plantId: input.plantId,
        sessionToken: input.sessionToken,
        mobileNumber: input.mobileNumber,
        startTime: input.startTime,
        endTime: input.endTime,
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        isActive: true,
        approvedAt: input.startTime,
        approvedBy: input.createdBy,
        createdBy: input.createdBy,
        notes: 'Demo visitor session for smart gate workflow',
    };

    if (existing) {
        Object.assign(existing as object, payload as object);
        return repo.save(existing);
    }

    return repo.save(
        repo.create({
            id: randomUUID(),
            ...payload,
        }),
    );
}

export async function seedJkFennerDemoData(roleMap: RoleMap) {
    const organizationRepo = AppDataSource.getRepository(OrganizationEntity);
    const plantRepo = AppDataSource.getRepository(PlantEntity);
    const departmentRepo = AppDataSource.getRepository(DepartmentEntity);
    const moduleRepo = AppDataSource.getRepository(MachineModuleEntity);
    const costCenterRepo = AppDataSource.getRepository(CostCenterEntity);
    const vendorRepo = AppDataSource.getRepository(VendorEntity);
    const teamRepo = AppDataSource.getRepository(MaintenanceTeamEntity);
    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const spareRepo = AppDataSource.getRepository(SpareItemEntity);
    const shiftRepo = AppDataSource.getRepository(ShiftEntity);
    const gateRepo = AppDataSource.getRepository(GateEntity);
    const gateEntryTypeRepo = AppDataSource.getRepository(GateEntryTypeEntity);
    const gateTemplateFieldRepo = AppDataSource.getRepository(GateTemplateFieldEntity);
    const gateTemplateUserRepo = AppDataSource.getRepository(GateTemplateUserEntity);
    const gateEntryRepo = AppDataSource.getRepository(GateEntryEntity);
    const visitorContentRepo = AppDataSource.getRepository(VisitorExperienceContentEntity);
    const visitorSafetyRepo = AppDataSource.getRepository(VisitorSafetyLogEntity);
    const visitorNavigationRepo = AppDataSource.getRepository(VisitorNavigationLogEntity);
    const logTemplateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const logTemplateFieldRepo = AppDataSource.getRepository(LogTemplateFieldEntity);
    const logTemplateAssignmentRepo = AppDataSource.getRepository(LogTemplateAssignmentEntity);
    const logEntryRepo = AppDataSource.getRepository(LogEntryEntity);
    const logEntryValueRepo = AppDataSource.getRepository(LogEntryValueEntity);
    const pmTemplateRepo = AppDataSource.getRepository(PmTemplateEntity);
    const pmTemplateLinkRepo = AppDataSource.getRepository(PmTemplateLinkEntity);
    const pmScheduleRepo = AppDataSource.getRepository(PmScheduleEntity);
    const calibrationTemplateRepo = AppDataSource.getRepository(CalibrationTemplateEntity);
    const calibrationRecordRepo = AppDataSource.getRepository(CalibrationRecordEntity);
    const workOrderRepo = AppDataSource.getRepository(WorkOrderEntity);

    const preferredOrganization = await organizationRepo.findOne({
        where: [{ code: ORGANIZATION_SEED.code }, { name: ORGANIZATION_SEED.name }],
    });
    const legacyOrganization = preferredOrganization
        ? null
        : await organizationRepo.findOne({
            where: [{ code: LEGACY_ORGANIZATION_MATCH.code }, { name: LEGACY_ORGANIZATION_MATCH.name }],
        });

    const organization = preferredOrganization ?? legacyOrganization ?? organizationRepo.create({ id: randomUUID() });
    Object.assign(organization as object, ORGANIZATION_SEED as object);
    await organizationRepo.save(organization);

    const plantContexts = new Map<PlantKey, PlantContext>();
    for (const plantSeed of PLANT_SEEDS) {
        const plant = await upsertEntity(
            plantRepo,
            { plantCode: plantSeed.code },
            {
                plantCode: plantSeed.code,
                plantName: plantSeed.name,
                location: plantSeed.location,
                organizationId: organization.id,
                isActive: true,
            },
        );

        plantContexts.set(plantSeed.key, {
            plant,
            tag: plantSeed.tag,
            cityTag: plantSeed.cityTag,
            departments: new Map(),
            modules: new Map(),
            costCenters: new Map(),
            users: new Map(),
            teams: new Map(),
            assets: new Map(),
            shifts: new Map(),
            gates: new Map(),
        });
    }

    for (const context of plantContexts.values()) {
        for (const departmentSeed of DEPARTMENT_SEEDS) {
            const department = await upsertEntity(
                departmentRepo,
                {
                    plantId: context.plant.id,
                    code: departmentSeed.code,
                } as FindOptionsWhere<DepartmentEntity>,
                {
                    name: departmentSeed.name,
                    code: departmentSeed.code,
                    plantId: context.plant.id,
                    parentId: null,
                    isActive: true,
                },
            );
            context.departments.set(departmentSeed.code, department);

            const costCenter = await upsertEntity(
                costCenterRepo,
                {
                    plantId: context.plant.id,
                    code: `${context.tag}-CC-${departmentSeed.code}`,
                } as FindOptionsWhere<CostCenterEntity>,
                {
                    plantId: context.plant.id,
                    departmentId: department.id,
                    code: `${context.tag}-CC-${departmentSeed.code}`,
                    name: `${departmentSeed.name} Cost Center`,
                    isActive: true,
                },
            );
            context.costCenters.set(departmentSeed.code, costCenter);
        }

        for (const moduleSeed of MODULE_SEEDS) {
            const department = context.departments.get(moduleSeed.departmentCode);
            if (!department) continue;
            const moduleCode = `${context.tag}-${moduleSeed.code}`;
            const module = await upsertEntity(
                moduleRepo,
                { code: moduleCode },
                {
                    code: moduleCode,
                    name: moduleSeed.name,
                    description: `${moduleSeed.name} - Demo module for ${context.plant.plantName}`,
                    plantId: context.plant.id,
                    departmentId: department.id,
                    isActive: true,
                },
            );
            context.modules.set(moduleSeed.key, module);
        }
    }

    const vendors = new Map<string, VendorEntity>();
    for (const vendorSeed of [
        { code: 'JKF-VND-BRG', name: 'Fenner Bearings and Spares', category: 'SPARES' },
        { code: 'JKF-VND-ELE', name: 'Fenner Electrical Controls', category: 'ELECTRICAL' },
        { code: 'JKF-VND-HYD', name: 'Hydra Industrial Services', category: 'HYDRAULIC' },
        { code: 'JKF-VND-CAL', name: 'Precision Calibration Labs', category: 'CALIBRATION' },
    ]) {
        const vendor = await upsertEntity(
            vendorRepo,
            { code: vendorSeed.code },
            {
                code: vendorSeed.code,
                name: vendorSeed.name,
                contactPerson: 'Demo Contact',
                email: `${vendorSeed.code.toLowerCase()}@jkfenner.demo`,
                phone: '+91-452-400-1111',
                address: 'Tamil Nadu, India',
                gstNumber: `33${vendorSeed.code.slice(-4)}GST001`,
                category: vendorSeed.category,
                isActive: true,
            },
        );
        vendors.set(vendorSeed.code, vendor);
    }

    for (const context of plantContexts.values()) {
        for (const userSeed of USER_SEEDS) {
            const user = await upsertUserWithRole({
                roleMap,
                organizationId: organization.id,
                plantId: context.plant.id,
                role: userSeed.role,
                email: `${userSeed.email}.${context.cityTag}@jkfenner.demo`,
                fullName: `${context.plant.plantName} ${userSeed.fullName}`,
                userCode: `${context.tag}-${userSeed.code}`,
                department: userSeed.department,
            });
            context.users.set(userSeed.key, user);
        }

        const plantAdmin = context.users.get('plantAdmin');
        if (plantAdmin && context.plant.plantAdminId !== plantAdmin.id) {
            context.plant.plantAdminId = plantAdmin.id;
            await plantRepo.save(context.plant);
        }
    }

    for (const context of plantContexts.values()) {
        for (const teamSeed of TEAM_SEEDS) {
            const leader = context.users.get(teamSeed.leaderUserKey);
            const members = teamSeed.memberUserKeys
                .map((userKey) => context.users.get(userKey))
                .filter((user): user is UserEntity => Boolean(user))
                .map((user) => user.id);

            const team = await upsertEntity(
                teamRepo,
                {
                    plantId: context.plant.id,
                    teamName: teamSeed.teamName,
                } as FindOptionsWhere<MaintenanceTeamEntity>,
                {
                    plantId: context.plant.id,
                    teamName: teamSeed.teamName,
                    discipline: teamSeed.discipline,
                    teamLeaderId: leader?.id ?? null,
                    teamMemberIds: Array.from(new Set(members)),
                    isActive: true,
                },
            );
            context.teams.set(teamSeed.key, team);
        }
    }

    await ensureDefaultWorkOrderMasters(Array.from(plantContexts.values()).map((context) => context.plant.id));

    for (const context of plantContexts.values()) {
        const fallbackMappings: Array<{ category: string; teamKey: string }> = [
            { category: 'MECHANICAL', teamKey: 'mechanicalTeam' },
            { category: 'ELECTRICAL', teamKey: 'utilityTeam' },
            { category: 'UTILITY', teamKey: 'utilityTeam' },
            { category: 'TOOL_CHANGE', teamKey: 'productionTeam' },
            { category: 'CALIBRATION', teamKey: 'qualityTeam' },
            { category: 'SAFETY', teamKey: 'qualityTeam' },
        ];

        for (const mapping of fallbackMappings) {
            const team = context.teams.get(mapping.teamKey);
            if (!team) continue;
            await upsertWorkOrderTeamMapping({
                plantId: context.plant.id,
                departmentId: null,
                category: mapping.category,
                teamId: team.id,
            });
        }

        for (const departmentCode of ['POLYV', 'REC', 'UTILITY']) {
            const department = context.departments.get(departmentCode);
            if (!department) continue;
            const team = departmentCode === 'UTILITY' ? context.teams.get('utilityTeam') : context.teams.get('productionTeam');
            if (!team) continue;
            await upsertWorkOrderTeamMapping({
                plantId: context.plant.id,
                departmentId: department.id,
                category: departmentCode === 'UTILITY' ? 'UTILITY' : 'TOOL_CHANGE',
                teamId: team.id,
            });
        }
    }

    for (const context of plantContexts.values()) {
        for (const assetSeed of ASSET_SEEDS) {
            const department = context.departments.get(assetSeed.departmentCode);
            const module = context.modules.get(assetSeed.moduleKey);
            const costCenter = context.costCenters.get(assetSeed.departmentCode);
            if (!department || !module || !costCenter) continue;

            const code = `${context.tag}-${assetSeed.code}`;
            const asset = await upsertEntity(
                assetRepo,
                { code },
                {
                    code,
                    name: assetSeed.name,
                    type: 'MACHINE',
                    assetType: assetSeed.assetType,
                    departmentId: department.id,
                    costCenterId: costCenter.id,
                    plantId: context.plant.id,
                    criticality: assetSeed.criticality,
                    commissionDate: '2023-01-01',
                    warrantyExpiry: '2028-12-31',
                    status: 'ACTIVE',
                    make: 'JK Fenner',
                    manufacturer: 'JK Fenner',
                    model: `${assetSeed.assetType}-DEMO`,
                    ratedCapacity: '100.000',
                    capacityUnit: 'kg/h',
                    serialNumber: `${code}-SN`,
                    machineImageUrl: null,
                    location: assetSeed.location,
                    vendorId: vendors.get('JKF-VND-HYD')?.id ?? null,
                    moduleId: module.id,
                    qrCodeId: `${code}-QR`,
                    isActive: true,
                    assetHealthScore: '96.50',
                    riskLevel: 'LOW',
                    failureProbability: '0.1250',
                },
            );
            context.assets.set(assetSeed.key, asset);
        }

        const firstAssetId = context.assets.values().next().value?.id ?? null;
        for (const spareSeed of SPARE_SEEDS) {
            await upsertEntity(
                spareRepo,
                { code: `${context.tag}-${spareSeed.code}` },
                {
                    code: `${context.tag}-${spareSeed.code}`,
                    name: spareSeed.name,
                    category: spareSeed.category,
                    currentStock: spareSeed.currentStock,
                    minLevel: spareSeed.minLevel,
                    reorderLevel: spareSeed.reorderLevel,
                    unit: spareSeed.unit,
                    location: `${context.plant.plantCode} Stores`,
                    assetId: firstAssetId,
                    isCritical: spareSeed.isCritical,
                    plantId: context.plant.id,
                    isActive: true,
                },
            );
        }

        for (const shiftSeed of [
            { shiftName: 'A Shift', startTime: '06:00', endTime: '14:00' },
            { shiftName: 'B Shift', startTime: '14:00', endTime: '22:00' },
            { shiftName: 'C Shift', startTime: '22:00', endTime: '06:00' },
        ]) {
            const shift = await upsertEntity(
                shiftRepo,
                {
                    plantId: context.plant.id,
                    shiftName: shiftSeed.shiftName,
                } as FindOptionsWhere<ShiftEntity>,
                {
                    shiftName: shiftSeed.shiftName,
                    startTime: shiftSeed.startTime,
                    endTime: shiftSeed.endTime,
                    plantId: context.plant.id,
                    isActive: true,
                },
            );
            context.shifts.set(shiftSeed.shiftName, shift);
        }
    }

    for (const context of plantContexts.values()) {
        const securityUser = context.users.get('securityUser');
        const mainGate = await upsertEntity(
            gateRepo,
            { gateCode: `${context.tag}-MAIN-GATE` },
            {
                gateCode: `${context.tag}-MAIN-GATE`,
                gateName: `${context.plant.plantName} Main Gate`,
                plantId: context.plant.id,
                gateType: 'MAIN_GATE',
                location: `${context.plant.location} Entrance`,
                securityUserIds: securityUser ? [securityUser.id] : [],
                isActive: true,
            },
        );

        const materialGate = await upsertEntity(
            gateRepo,
            { gateCode: `${context.tag}-MATERIAL-GATE` },
            {
                gateCode: `${context.tag}-MATERIAL-GATE`,
                gateName: `${context.plant.plantName} Material Gate`,
                plantId: context.plant.id,
                gateType: 'MATERIAL_GATE',
                location: `${context.plant.location} Logistics Entry`,
                securityUserIds: securityUser ? [securityUser.id] : [],
                isActive: true,
            },
        );

        context.gates.set('main', mainGate);
        context.gates.set('material', materialGate);

        const visitorTemplate = await upsertEntity(
            gateEntryTypeRepo,
            {
                gateId: mainGate.id,
                templateName: 'Visitor Check-In',
            } as FindOptionsWhere<GateEntryTypeEntity>,
            {
                gateId: mainGate.id,
                plantId: context.plant.id,
                templateName: 'Visitor Check-In',
                visitorType: 'VISITOR',
                allowedRoles: ['VISITOR', 'VENDOR'],
                frequency: 'DAILY',
                securityLevel: 'MEDIUM',
                departmentId: context.departments.get('MAINT')?.id ?? null,
                moduleId: null,
                machineId: null,
                isActive: true,
                createdBy: securityUser?.id ?? null,
            },
        );

        const materialTemplate = await upsertEntity(
            gateEntryTypeRepo,
            {
                gateId: materialGate.id,
                templateName: 'Material Inward Pass',
            } as FindOptionsWhere<GateEntryTypeEntity>,
            {
                gateId: materialGate.id,
                plantId: context.plant.id,
                templateName: 'Material Inward Pass',
                visitorType: 'MATERIAL',
                allowedRoles: ['STORE_USER', 'SECURITY_USER'],
                frequency: 'PER_ENTRY',
                securityLevel: 'HIGH',
                departmentId: context.departments.get('STORES')?.id ?? null,
                moduleId: null,
                machineId: null,
                isActive: true,
                createdBy: securityUser?.id ?? null,
            },
        );

        for (const fieldSeed of [
            { templateId: visitorTemplate.id, fieldName: 'purpose', fieldLabel: 'Purpose', fieldType: 'TEXT', isRequired: true, displayOrder: 1 },
            { templateId: visitorTemplate.id, fieldName: 'id_proof_number', fieldLabel: 'ID Proof Number', fieldType: 'TEXT', isRequired: true, displayOrder: 2 },
            { templateId: visitorTemplate.id, fieldName: 'person_to_meet', fieldLabel: 'Person To Meet', fieldType: 'TEXT', isRequired: true, displayOrder: 3 },
            { templateId: materialTemplate.id, fieldName: 'material_description', fieldLabel: 'Material Description', fieldType: 'TEXT', isRequired: true, displayOrder: 1 },
            { templateId: materialTemplate.id, fieldName: 'quantity', fieldLabel: 'Quantity', fieldType: 'NUMBER', isRequired: true, displayOrder: 2 },
        ]) {
            await upsertEntity(
                gateTemplateFieldRepo,
                {
                    templateId: fieldSeed.templateId,
                    fieldName: fieldSeed.fieldName,
                } as FindOptionsWhere<GateTemplateFieldEntity>,
                {
                    templateId: fieldSeed.templateId,
                    fieldName: fieldSeed.fieldName,
                    fieldLabel: fieldSeed.fieldLabel,
                    fieldType: fieldSeed.fieldType,
                    options: null,
                    isRequired: fieldSeed.isRequired,
                    unit: null,
                    allowedMin: null,
                    allowedMax: null,
                    placeholder: null,
                    fieldGroup: 'General',
                    captureKey: fieldSeed.fieldName,
                    helpText: null,
                    defaultValue: null,
                    isEnvironmental: false,
                    displayOrder: fieldSeed.displayOrder,
                },
            );
        }

        await upsertEntity(
            gateTemplateUserRepo,
            {
                templateId: visitorTemplate.id,
                allowedUserType: 'VISITOR',
            } as FindOptionsWhere<GateTemplateUserEntity>,
            {
                templateId: visitorTemplate.id,
                allowedUserType: 'VISITOR',
                departmentId: context.departments.get('MAINT')?.id ?? null,
                approvalRequired: false,
            },
        );

        await upsertEntity(
            gateTemplateUserRepo,
            {
                templateId: materialTemplate.id,
                allowedUserType: 'VENDOR',
            } as FindOptionsWhere<GateTemplateUserEntity>,
            {
                templateId: materialTemplate.id,
                allowedUserType: 'VENDOR',
                departmentId: context.departments.get('STORES')?.id ?? null,
                approvalRequired: true,
            },
        );

        const visitorUser = context.users.get('visitor') ?? null;
        const managerUser = context.users.get('maintenanceManager') ?? null;
        const sampleEntry = await upsertEntity(
            gateEntryRepo,
            { qrCodeValue: `${context.tag}-VISITOR-001` },
            {
                gateId: mainGate.id,
                plantId: context.plant.id,
                templateId: visitorTemplate.id,
                departmentId: context.departments.get('MAINT')?.id ?? null,
                moduleId: context.modules.get('maintenanceShop')?.id ?? null,
                machineId: context.assets.get('polyvExtruder01')?.id ?? null,
                visitorName: 'Demo Visitor',
                visitorCompany: 'RubberTech Supplies',
                visitorPhone: '+91-9000000010',
                visitorType: 'VISITOR',
                purpose: 'Machine inspection and sample validation',
                personToMeet: managerUser?.fullName ?? null,
                personToMeetUserId: managerUser?.id ?? null,
                vehicleNumber: 'TN-58-DEMO-01',
                idProofType: 'AADHAR',
                idProofNumber: `${context.tag}1234567890`,
                itemsCarried: 'Measurement tools',
                vendorName: null,
                materialDescription: null,
                quantity: null,
                gatePassNumber: `${context.tag}-GP-001`,
                invoiceNumber: null,
                entryData: [
                    asJson({ key: 'purpose', value: 'Inspection' }),
                    asJson({ key: 'id_proof_number', value: `${context.tag}1234567890` }),
                ],
                qrCodeValue: `${context.tag}-VISITOR-001`,
                duplicateDetected: false,
                blacklistAlert: false,
                watchlistAlert: false,
                entryTime: addDays(new Date(), -1),
                exitTime: null,
                badgeNumber: `${context.tag}-B-001`,
                remarks: 'Demo smart gate entry',
                recordedBy: securityUser?.id ?? null,
                approvalStatus: 'APPROVED',
                approvalRequestedAt: addDays(new Date(), -1),
                approvalRespondedAt: addDays(new Date(), -1),
                approvalBy: managerUser?.id ?? null,
                approvalComments: 'Approved for scheduled inspection',
                navigationEnabled: true,
                navigationEnabledAt: addDays(new Date(), -1),
                desiredVisitAt: addDays(new Date(), -1),
                allowedVisitStartAt: addDays(new Date(), -1),
                allowedVisitEndAt: addDays(new Date(), 1),
                visitorUserId: visitorUser?.id ?? null,
                currentLocationNodeId: 'main-gate',
                currentLocationLabel: 'Main Gate',
                exitApprovedBy: null,
                exitRemarks: null,
                status: 'IN',
            },
        );

        await upsertEntity(
            visitorContentRepo,
            { plantId: context.plant.id } as FindOptionsWhere<VisitorExperienceContentEntity>,
            {
                plantId: context.plant.id,
                pageTitle: `Welcome to ${context.plant.plantName}`,
                companyOverview:
                    'JK Fenner is a leading manufacturer of transmission belts, including Poly V and REC products, with strong process discipline and safety culture.',
                contactName: context.users.get('plantAdmin')?.fullName ?? null,
                contactEmail: context.users.get('plantAdmin')?.email ?? null,
                contactPhone: '+91-452-400-1000',
                contactAddress: context.plant.location,
                heroHighlights: [
                    asJson({ title: 'Poly V Excellence', description: 'Advanced belt lines with quality assurance checkpoints.' }),
                    asJson({ title: 'REC Manufacturing', description: 'Consistent and reliable REC process lines.' }),
                    asJson({ title: 'Safety First', description: 'Mandatory safety induction and visitor tracking at every gate.' }),
                ],
                products: [
                    asJson({ name: 'Poly V Belts', category: 'Transmission Belts' }),
                    asJson({ name: 'REC Belts', category: 'Industrial Belts' }),
                    asJson({ name: 'Utility Belting Solutions', category: 'Plant Utility' }),
                ],
                experienceMeta: asJson({
                    demo: true,
                    plantCode: context.plant.plantCode,
                    visitorGuideVersion: '1.0',
                }),
                isActive: true,
                createdBy: context.users.get('plantAdmin')?.id ?? null,
            },
        );

        await upsertVisitorSession({
            gateEntryId: sampleEntry.id,
            visitorUserId: visitorUser?.id ?? null,
            plantId: context.plant.id,
            sessionToken: `${context.cityTag}-visitor-demo-session`,
            mobileNumber: sampleEntry.visitorPhone,
            startTime: addDays(new Date(), -1),
            endTime: addDays(new Date(), 1),
            createdBy: securityUser?.id ?? null,
        });

        await upsertEntity(
            visitorSafetyRepo,
            {
                visitorId: visitorUser?.id ?? '',
                gateEntryId: sampleEntry.id,
            } as FindOptionsWhere<VisitorSafetyLogEntity>,
            {
                visitorId: visitorUser?.id ?? context.users.get('securityUser')?.id ?? '',
                gateEntryId: sampleEntry.id,
                plantId: context.plant.id,
                consentGiven: true,
                consentedAt: addDays(new Date(), -1),
                ipAddress: '10.10.10.10',
                deviceInfo: 'Demo Seed Device',
            },
        );

        await upsertEntity(
            visitorNavigationRepo,
            {
                gateEntryId: sampleEntry.id,
                nodeId: 'main-gate',
            } as FindOptionsWhere<VisitorNavigationLogEntity>,
            {
                gateEntryId: sampleEntry.id,
                plantId: context.plant.id,
                nodeId: 'main-gate',
                nodeLabel: 'Main Gate',
                latitude: '9.9252010',
                longitude: '78.1197740',
                checkInMode: 'QR',
                occurredAt: addDays(new Date(), -1),
                recordedBy: securityUser?.id ?? null,
            },
        );
    }

    for (const context of plantContexts.values()) {
        const template = await upsertEntity(
            logTemplateRepo,
            {
                plantId: context.plant.id,
                templateName: 'Utility Shift Checklist',
            } as FindOptionsWhere<LogTemplateEntity>,
            {
                templateName: 'Utility Shift Checklist',
                category: 'UTILITY',
                description: 'Per-shift checklist for compressors and boiler utility parameters.',
                frequency: 'PER_SHIFT',
                reminderMinutesBefore: 15,
                overdueAlertMinutes: 30,
                notifyAtShiftStart: true,
                plantId: context.plant.id,
                departmentId: context.departments.get('UTILITY')?.id ?? null,
                moduleId: context.modules.get('compressorBay')?.id ?? null,
                machineId: context.assets.get('compressor01')?.id ?? null,
                createdBy: context.users.get('maintenanceManager')?.id ?? null,
                isActive: true,
            },
        );

        const fieldPressure = await upsertEntity(
            logTemplateFieldRepo,
            { templateId: template.id, fieldName: 'line_pressure' } as FindOptionsWhere<LogTemplateFieldEntity>,
            {
                templateId: template.id,
                sectionName: 'Compressor',
                fieldName: 'line_pressure',
                fieldLabel: 'Line Pressure',
                fieldType: 'NUMBER',
                options: null,
                isRequired: true,
                minValue: '4.00',
                maxValue: '8.00',
                unit: 'bar',
                displayOrder: 1,
                validationRules: asJson({ min: 4, max: 8 }),
                conditionalOn: null,
            },
        );

        const fieldTemperature = await upsertEntity(
            logTemplateFieldRepo,
            { templateId: template.id, fieldName: 'bearing_temperature' } as FindOptionsWhere<LogTemplateFieldEntity>,
            {
                templateId: template.id,
                sectionName: 'Compressor',
                fieldName: 'bearing_temperature',
                fieldLabel: 'Bearing Temperature',
                fieldType: 'NUMBER',
                options: null,
                isRequired: true,
                minValue: '20.00',
                maxValue: '90.00',
                unit: 'C',
                displayOrder: 2,
                validationRules: asJson({ min: 20, max: 90 }),
                conditionalOn: null,
            },
        );

        const fieldRemarks = await upsertEntity(
            logTemplateFieldRepo,
            { templateId: template.id, fieldName: 'operator_remarks' } as FindOptionsWhere<LogTemplateFieldEntity>,
            {
                templateId: template.id,
                sectionName: 'General',
                fieldName: 'operator_remarks',
                fieldLabel: 'Operator Remarks',
                fieldType: 'TEXT',
                options: null,
                isRequired: false,
                minValue: null,
                maxValue: null,
                unit: null,
                displayOrder: 3,
                validationRules: null,
                conditionalOn: null,
            },
        );

        const technician = context.users.get('technician');
        if (technician) {
            await upsertEntity(
                logTemplateAssignmentRepo,
                {
                    templateId: template.id,
                    userId: technician.id,
                } as FindOptionsWhere<LogTemplateAssignmentEntity>,
                {
                    templateId: template.id,
                    userId: technician.id,
                },
            );
        }

        const shift = context.shifts.get('A Shift') ?? null;
        const today = toDateOnly(new Date());
        const logEntry = await upsertEntity(
            logEntryRepo,
            {
                templateId: template.id,
                plantId: context.plant.id,
                logDate: today,
            } as FindOptionsWhere<LogEntryEntity>,
            {
                templateId: template.id,
                shiftId: shift?.id ?? null,
                plantId: context.plant.id,
                departmentId: context.departments.get('UTILITY')?.id ?? null,
                moduleId: context.modules.get('compressorBay')?.id ?? null,
                machineId: context.assets.get('compressor01')?.id ?? null,
                loggedBy: context.users.get('technician')?.id ?? null,
                logDate: today,
                status: 'SUBMITTED',
                submittedAt: new Date(),
                approvedBy: context.users.get('maintenanceManager')?.id ?? null,
                approvedAt: new Date(),
                remarks: 'All utility parameters within limits',
            },
        );

        await upsertEntity(
            logEntryValueRepo,
            { entryId: logEntry.id, fieldId: fieldPressure.id } as FindOptionsWhere<LogEntryValueEntity>,
            {
                entryId: logEntry.id,
                fieldId: fieldPressure.id,
                value: '6.2',
            },
        );

        await upsertEntity(
            logEntryValueRepo,
            { entryId: logEntry.id, fieldId: fieldTemperature.id } as FindOptionsWhere<LogEntryValueEntity>,
            {
                entryId: logEntry.id,
                fieldId: fieldTemperature.id,
                value: '62',
            },
        );

        await upsertEntity(
            logEntryValueRepo,
            { entryId: logEntry.id, fieldId: fieldRemarks.id } as FindOptionsWhere<LogEntryValueEntity>,
            {
                entryId: logEntry.id,
                fieldId: fieldRemarks.id,
                value: 'Routine checks completed without abnormalities.',
            },
        );
    }

    for (const context of plantContexts.values()) {
        const mechanicalTeam = context.teams.get('mechanicalTeam') ?? null;
        const pmTemplate = await upsertEntity(
            pmTemplateRepo,
            {
                plantId: context.plant.id,
                templateName: 'Monthly Poly V Line PM',
            } as FindOptionsWhere<PmTemplateEntity>,
            {
                plantId: context.plant.id,
                templateName: 'Monthly Poly V Line PM',
                maintenanceType: 'PM',
                discipline: 'MECHANICAL',
                frequencyType: 'MONTHLY',
                frequencyValue: 1,
                estimatedDuration: 180,
                checklistTasks: JSON.stringify([
                    'Check belt tension and alignment',
                    'Inspect bearings and lubrication',
                    'Check motor ampere and vibration',
                ]),
                isActive: true,
            },
        );

        const pmAsset = context.assets.get('polyvExtruder01') ?? null;
        if (pmAsset) {
            const nextDue = addDays(new Date(), 15);
            const templateLink = await upsertEntity(
                pmTemplateLinkRepo,
                {
                    templateId: pmTemplate.id,
                    assetId: pmAsset.id,
                } as FindOptionsWhere<PmTemplateLinkEntity>,
                {
                    templateId: pmTemplate.id,
                    plantId: context.plant.id,
                    departmentId: context.departments.get('POLYV')?.id ?? null,
                    assetId: pmAsset.id,
                    startDate: addDays(new Date(), -30),
                    assignedTeamId: mechanicalTeam?.id ?? null,
                    responsibleUserId: context.users.get('engineer')?.id ?? null,
                    checklistTasksOverride: JSON.stringify(['Inspect extrusion die', 'Validate cooling fan operation']),
                    nextDueDate: nextDue,
                    lastGeneratedAt: addDays(new Date(), -1),
                    isActive: true,
                },
            );

            await upsertEntity(
                pmScheduleRepo,
                {
                    assetId: pmAsset.id,
                    templateId: pmTemplate.id,
                } as FindOptionsWhere<PmScheduleEntity>,
                {
                    assetId: pmAsset.id,
                    templateId: pmTemplate.id,
                    templateLinkId: templateLink.id,
                    maintenanceType: 'PM',
                    discipline: 'MECHANICAL',
                    frequency: 'MONTHLY',
                    frequencyType: 'MONTHLY',
                    frequencyValue: 1,
                    estimatedDuration: 180,
                    checklist: [
                        asJson({ task: 'Inspect extrusion die', done: false }),
                        asJson({ task: 'Check lubrication points', done: false }),
                    ],
                    assignedTo: context.users.get('technician')?.id ?? null,
                    assignedTeamId: mechanicalTeam?.id ?? null,
                    lastCompleted: addDays(new Date(), -30),
                    nextDue,
                    completedAt: null,
                    status: 'SCHEDULED',
                    plantId: context.plant.id,
                },
            );
        }

        const calibrationTeam = context.teams.get('qualityTeam') ?? null;
        const calibrationTemplate = await upsertEntity(
            calibrationTemplateRepo,
            {
                plantId: context.plant.id,
                templateName: 'Pressure Gauge Monthly Calibration',
            } as FindOptionsWhere<CalibrationTemplateEntity>,
            {
                plantId: context.plant.id,
                templateName: 'Pressure Gauge Monthly Calibration',
                instrumentType: 'PRESSURE_GAUGE',
                calibrationMethod: 'MASTER_GAUGE_COMPARISON',
                tolerance: '+/- 0.5%',
                frequencyType: 'MONTHLY',
                frequencyValue: 1,
                estimatedDuration: 45,
                responsibleTeamId: calibrationTeam?.id ?? null,
                checklistTasks: JSON.stringify(['Zero error check', 'Span check', 'Certificate verification']),
                isActive: true,
            },
        );

        const calibrationAsset = context.assets.get('qualityBench01') ?? null;
        if (calibrationAsset) {
            const nextDue = addDays(new Date(), 30);
            await upsertEntity(
                calibrationRecordRepo,
                {
                    assetId: calibrationAsset.id,
                    certificateNumber: `${context.tag}-CAL-0001`,
                } as FindOptionsWhere<CalibrationRecordEntity>,
                {
                    assetId: calibrationAsset.id,
                    calibrationDate: toDateOnly(addDays(new Date(), -2)),
                    nextDueDate: toDateOnly(nextDue),
                    status: 'COMPLETED',
                    performedBy: context.users.get('engineer')?.id ?? null,
                    vendorId: vendors.get('JKF-VND-CAL')?.id ?? null,
                    certificateNumber: `${context.tag}-CAL-0001`,
                    remarks: `Calibrated using template ${calibrationTemplate.templateName}`,
                    plantId: context.plant.id,
                },
            );
        }
    }

    for (const context of plantContexts.values()) {
        const raisedBy = context.users.get('operator') ?? null;
        const technician = context.users.get('technician') ?? null;
        const manager = context.users.get('maintenanceManager') ?? null;
        const productionTeam = context.teams.get('productionTeam') ?? null;

        const baseDate = addDays(new Date(), -3);
        const inProgressStart = addDays(new Date(), -1);

        const workOrderSeeds: Array<DeepPartial<WorkOrderEntity> & { woNumber: string }> = [
            {
                woNumber: `WO-${context.tag}-1001`,
                assetId: context.assets.get('polyvExtruder01')?.id ?? '',
                category: 'MECHANICAL',
                priority: 'HIGH',
                status: 'RAISED',
                problemDescription: 'Poly V extruder drive side vibration observed above normal trend.',
                raisedBy: raisedBy?.id ?? null,
                assignedTo: technician?.id ?? null,
                plantId: context.plant.id,
                woType: 'BREAKDOWN',
                failureCode: 'VIBRATION',
                reportedLocation: 'Poly V Bay 1',
                isFailureEvent: true,
                downtimeMinutes: 0,
                laborHours: '0.00',
                actualCost: '0.00',
                followUpRequired: false,
                followUpTeamId: null,
            },
            {
                woNumber: `WO-${context.tag}-1002`,
                assetId: context.assets.get('compressor01')?.id ?? '',
                category: 'UTILITY',
                priority: 'MEDIUM',
                status: 'IN_PROGRESS',
                problemDescription: 'Compressed air pressure drop reported in utility line.',
                raisedBy: raisedBy?.id ?? null,
                assignedTo: technician?.id ?? null,
                openedAt: inProgressStart,
                startedAt: inProgressStart,
                plantId: context.plant.id,
                woType: 'CORRECTIVE',
                failureCode: 'LEAK',
                reportedLocation: 'Utility Air Bay',
                rootCause: null,
                actionTaken: null,
                isFailureEvent: true,
                downtimeMinutes: 35,
                laborHours: '1.25',
                actualCost: '0.00',
                followUpRequired: false,
                followUpTeamId: null,
            },
            {
                woNumber: `WO-${context.tag}-1003`,
                assetId: context.assets.get('recPress01')?.id ?? '',
                category: 'ELECTRICAL',
                priority: 'CRITICAL',
                status: 'APPROVAL_PENDING',
                problemDescription: 'REC press control panel tripped during cycle.',
                raisedBy: raisedBy?.id ?? null,
                assignedTo: technician?.id ?? null,
                openedAt: addDays(baseDate, 1),
                startedAt: addDays(baseDate, 1),
                resolvedAt: addDays(baseDate, 2),
                submittedForApprovalAt: addDays(baseDate, 2),
                submittedForApprovalBy: technician?.id ?? null,
                plantId: context.plant.id,
                woType: 'BREAKDOWN',
                failureCode: 'ELEC_SHORT',
                reportedLocation: 'REC Press Area',
                rootCause: 'Loose panel terminal and overheating due to contact resistance.',
                actionTaken: 'Re-terminated panel cables, replaced damaged lug, and validated load test.',
                isFailureEvent: true,
                downtimeMinutes: 95,
                laborHours: '3.50',
                actualCost: '12500.00',
                partsReplaced: 'Power terminal lug, insulated connector',
                remarks: 'Awaiting raiser approval.',
                followUpRequired: false,
                followUpTeamId: null,
            },
            {
                woNumber: `WO-${context.tag}-1004`,
                assetId: context.assets.get('mixingBanbury01')?.id ?? '',
                category: 'MECHANICAL',
                priority: 'HIGH',
                status: 'CLOSED',
                problemDescription: 'Banbury mixer coupling noise and elevated temperature.',
                raisedBy: raisedBy?.id ?? null,
                assignedTo: technician?.id ?? null,
                openedAt: addDays(baseDate, -1),
                startedAt: addDays(baseDate, -1),
                resolvedAt: baseDate,
                closedAt: addDays(baseDate, 1),
                submittedForApprovalAt: baseDate,
                submittedForApprovalBy: technician?.id ?? null,
                approvedBy: manager?.id ?? null,
                approvedAt: addDays(baseDate, 1),
                approvalComments: 'Approved after verification and trial run.',
                plantId: context.plant.id,
                woType: 'BREAKDOWN',
                failureCode: 'MECH_WEAR',
                reportedLocation: 'Mixing Hall',
                rootCause: 'Coupling bush wear due to prolonged misalignment.',
                actionTaken: 'Replaced coupling bush and corrected alignment.',
                isFailureEvent: true,
                downtimeMinutes: 140,
                laborHours: '4.00',
                actualCost: '18450.00',
                partsReplaced: 'Coupling bush set',
                remarks: 'Machine restored and observed stable for one shift.',
                followUpRequired: false,
                followUpTeamId: null,
            },
            {
                woNumber: `WO-${context.tag}-1005`,
                assetId: context.assets.get('qualityBench01')?.id ?? '',
                category: 'CALIBRATION',
                priority: 'MEDIUM',
                status: 'OPENED',
                problemDescription: 'Quality bench verification completed; requires follow-up documentation closure.',
                raisedBy: raisedBy?.id ?? null,
                assignedTo: productionTeam?.teamLeaderId ?? technician?.id ?? null,
                openedAt: addDays(new Date(), -1),
                plantId: context.plant.id,
                woType: 'INSPECTION',
                failureCode: 'HUMAN_ERROR',
                reportedLocation: 'QC Lab',
                rootCause: 'Operator log mismatch found during final verification.',
                actionTaken: 'Initial correction performed. Follow-up team to complete validation checklist and closure.',
                isFailureEvent: false,
                operatorFault: true,
                downtimeMinutes: 0,
                laborHours: '1.00',
                actualCost: '0.00',
                followUpRequired: true,
                followUpTeamId: productionTeam?.id ?? null,
                followUpNotes: 'Validate log reconciliation and complete shift handover checks before closure.',
                remarks: 'Follow-up routed from close workflow.',
            },
        ];

        for (const workOrderSeed of workOrderSeeds) {
            if (!workOrderSeed.assetId) continue;
            await upsertEntity(
                workOrderRepo,
                { woNumber: workOrderSeed.woNumber },
                workOrderSeed,
            );
        }
    }

    return {
        organization: organization.name,
        plants: Array.from(plantContexts.values()).map((context) => ({
            plantCode: context.plant.plantCode,
            plantName: context.plant.plantName,
            departments: context.departments.size,
            modules: context.modules.size,
            assets: context.assets.size,
            users: context.users.size,
            teams: context.teams.size,
            shifts: context.shifts.size,
            gates: context.gates.size,
        })),
        defaultPassword: DEMO_PASSWORD,
    };
}
