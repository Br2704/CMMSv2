import { AppDataSource } from '../../database/data-source';
import { AssetEntity, MaintenanceTeamEntity, PmScheduleEntity, PmTemplateEntity, PmTemplateLinkEntity, UserEntity } from '../../database/entities';
import { stringifyJsonObject } from '../inventory/spare-consumption';

export interface TemplateChecklistTask {
  id: string;
  title: string;
}

export function parseChecklistTasks(value: unknown): TemplateChecklistTask[] {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (typeof item === 'string') {
          const trimmed = item.trim();
          if (!trimmed) return null;
          return { id: `task-${index + 1}`, title: trimmed };
        }
        if (item && typeof item === 'object') {
          const source = item as Record<string, unknown>;
          const title = String(source.title ?? source.task ?? '').trim();
          if (!title) return null;
          return { id: String(source.id ?? `task-${index + 1}`), title };
        }
        return null;
      })
      .filter((item): item is TemplateChecklistTask => Boolean(item));
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parseChecklistTasks(parsed);
    } catch {
      return value
        .split(/\r?\n/)
        .map((line, index) => ({ id: `task-${index + 1}`, title: line.trim() }))
        .filter((item) => item.title.length > 0);
    }
  }

  return [];
}

export function addFrequency(date: Date, frequencyType: string, frequencyValue: number): Date {
  const next = new Date(date);
  const amount = Math.max(1, Number.isFinite(frequencyValue) ? Math.trunc(frequencyValue) : 1);
  const normalized = String(frequencyType || 'DAY').toUpperCase();

  switch (normalized) {
    case 'SHIFT':
    case 'DAY':
    case 'DAILY':
      next.setDate(next.getDate() + amount);
      break;
    case 'WEEK':
    case 'WEEKLY':
      next.setDate(next.getDate() + amount * 7);
      break;
    case 'MONTH':
    case 'MONTHLY':
      next.setMonth(next.getMonth() + amount);
      break;
    case 'QUARTER':
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + amount * 3);
      break;
    case 'YEAR':
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + amount);
      break;
    default:
      next.setDate(next.getDate() + amount);
      break;
  }

  return next;
}

export function computeNextDueDate(startDate: Date, template: Pick<PmTemplateEntity, 'frequencyType' | 'frequencyValue'>): Date {
  return addFrequency(startDate, template.frequencyType, template.frequencyValue);
}

function resolveDisciplineBucket(value: string | null | undefined): 'MECHANICAL' | 'ELECTRICAL' | null {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!normalized) return null;
  if (normalized.includes('MECHAN') || normalized === 'M') return 'MECHANICAL';
  if (normalized.includes('ELECT') || normalized === 'E') return 'ELECTRICAL';
  return null;
}

function buildTaskChecklist(template: PmTemplateEntity, dueDate: Date, checklistOverride?: unknown) {
  const overrideTasks = parseChecklistTasks(checklistOverride);
  const tasks = overrideTasks.length > 0 ? overrideTasks : parseChecklistTasks(template.checklistTasks);
  return {
    taskSummary: template.templateName,
    maintenanceType: template.maintenanceType,
    discipline: template.discipline,
    estimatedDuration: template.estimatedDuration ? `${template.estimatedDuration} min` : '',
    dueDate: dueDate.toISOString(),
    checklistTasks: tasks.map((task) => ({
      ...task,
      taskStatus: 'PENDING',
      condition: 'NORMAL',
      remarks: '',
      photos: [] as Array<{ name: string; dataUrl: string }>,
    })),
    spareUsage: [],
  };
}

function mapFrequencyLabel(template: PmTemplateEntity) {
  return `${String(template.frequencyType || 'DAY').toUpperCase()}_${Math.max(1, template.frequencyValue || 1)}`;
}

export async function generateDuePmTasks(now = new Date()) {
  const linkRepo = AppDataSource.getRepository(PmTemplateLinkEntity);
  const scheduleRepo = AppDataSource.getRepository(PmScheduleEntity);
  const dueLinks = await linkRepo.find({
    where: { isActive: true },
    relations: {
      template: true,
      asset: true,
      assignedTeam: true,
      responsibleUser: true,
    },
  });

  for (const link of dueLinks) {
    if (!link.template || !link.asset) continue;
    if (link.nextDueDate > now) continue;

    let cursor = new Date(link.nextDueDate);
    let generated = false;
    let guard = 0;

    while (cursor <= now && guard < 48) {
      const existing = await scheduleRepo.findOne({
        where: { templateLinkId: link.id, nextDue: cursor },
      });

      if (!existing) {
        const entity = scheduleRepo.create({
          plantId: link.plantId,
          assetId: link.assetId,
          templateId: link.templateId,
          templateLinkId: link.id,
          maintenanceType: link.template.maintenanceType,
          discipline: link.template.discipline,
          frequency: mapFrequencyLabel(link.template),
          frequencyType: link.template.frequencyType,
          frequencyValue: link.template.frequencyValue,
          estimatedDuration: link.template.estimatedDuration,
          checklist: stringifyJsonObject(buildTaskChecklist(link.template, cursor, link.checklistTasksOverride)),
          assignedTo: link.responsibleUserId,
          assignedTeamId: link.assignedTeamId,
          nextDue: cursor,
          status: 'SCHEDULED',
          lastCompleted: null,
          completedAt: null,
        });
        await scheduleRepo.save(entity);
      }

      generated = true;
      cursor = addFrequency(cursor, link.template.frequencyType, link.template.frequencyValue);
      guard += 1;
    }

    if (generated) {
      link.lastGeneratedAt = now;
      link.nextDueDate = cursor;
      await linkRepo.save(link);
    }
  }
}

export async function validatePmLinkScope(input: {
  plantId: string | null;
  departmentId: string | null;
  assetId: string;
  responsibleUserId?: string | null;
  assignedTeamId?: string | null;
  expectedDiscipline?: string | null;
}) {
  const assetRepo = AppDataSource.getRepository(AssetEntity);
  const userRepo = AppDataSource.getRepository(UserEntity);
  const teamRepo = AppDataSource.getRepository(MaintenanceTeamEntity);

  const asset = await assetRepo.findOneBy({ id: input.assetId, isActive: true });
  if (!asset) {
    throw new Error('Selected asset not found');
  }
  if (input.plantId && asset.plantId !== input.plantId) {
    throw new Error('Selected asset does not belong to the selected plant');
  }
  if (input.departmentId && asset.departmentId !== input.departmentId) {
    throw new Error('Selected asset does not belong to the selected department');
  }

  if (input.responsibleUserId) {
    const user = await userRepo.findOneBy({ id: input.responsibleUserId, isActive: true });
    if (!user) throw new Error('Responsible user not found');
  }

  if (input.assignedTeamId) {
    const team = await teamRepo.findOneBy({ id: input.assignedTeamId, isActive: true });
    if (!team) throw new Error('Assigned team not found');
    if (input.plantId && team.plantId && team.plantId !== input.plantId) {
      throw new Error('Assigned team is outside the selected plant');
    }

    const templateDiscipline = resolveDisciplineBucket(input.expectedDiscipline);
    const teamDiscipline = resolveDisciplineBucket(team.discipline);
    if (templateDiscipline && teamDiscipline && templateDiscipline !== teamDiscipline) {
      throw new Error(`Assigned team discipline must match ${templateDiscipline.toLowerCase()} template discipline`);
    }
  }

  if (!input.assignedTeamId && resolveDisciplineBucket(input.expectedDiscipline)) {
    throw new Error('Assigned team is required for discipline-specific PM/PD templates');
  }

  return asset;
}
