import { AppDataSource } from '../../database/data-source';
import {
  AssetEntity,
  CalibrationTemplateEntity,
  InstrumentCalibrationScheduleEntity,
  InstrumentCalibrationTaskEntity,
  MachineInstrumentEntity,
  MaintenanceTeamEntity,
  UserEntity,
} from '../../database/entities';
import { addFrequency } from '../pmSchedules/pm-scheduling.utils';
import { sendCalibrationDueEmails } from '../../services/notification-helper';

export interface CalibrationChecklistTask {
  id: string;
  title: string;
}

export interface CalibrationChecklistResult extends CalibrationChecklistTask {
  taskStatus: string;
  referenceValue: string;
  measuredValue: string;
  deviation: string;
  passFail: string;
  remarks: string;
}

export function parseCalibrationChecklistTasks(value: unknown): CalibrationChecklistTask[] {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (typeof item === 'string') {
          const title = item.trim();
          if (!title) return null;
          return { id: `task-${index + 1}`, title };
        }
        if (item && typeof item === 'object') {
          const source = item as Record<string, unknown>;
          const title = String(source.title ?? source.task ?? '').trim();
          if (!title) return null;
          return { id: String(source.id ?? `task-${index + 1}`), title };
        }
        return null;
      })
      .filter((item): item is CalibrationChecklistTask => Boolean(item));
  }

  if (typeof value === 'string') {
    try {
      return parseCalibrationChecklistTasks(JSON.parse(value));
    } catch {
      return value
        .split(/\r?\n/)
        .map((line, index) => ({ id: `task-${index + 1}`, title: line.trim() }))
        .filter((item) => item.title.length > 0);
    }
  }

  return [];
}

export function computeCalibrationNextDueDate(
  startDate: Date,
  template: Pick<CalibrationTemplateEntity, 'frequencyType' | 'frequencyValue'>,
): Date {
  return addFrequency(startDate, template.frequencyType, template.frequencyValue);
}

export function buildCalibrationChecklist(
  template: Pick<CalibrationTemplateEntity, 'checklistTasks'>,
): CalibrationChecklistResult[] {
  return parseCalibrationChecklistTasks(template.checklistTasks).map((task) => ({
    ...task,
    taskStatus: 'PENDING',
    referenceValue: '',
    measuredValue: '',
    deviation: '',
    passFail: 'PENDING',
    remarks: '',
  }));
}

function asNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeCalibrationChecklistResults(value: unknown): CalibrationChecklistResult[] {
  const tasks = parseCalibrationChecklistTasks(value);
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        const base = tasks.at(index) ?? { id: `task-${index + 1}`, title: `Task ${index + 1}` };
        if (!item || typeof item !== 'object') {
          return { ...base, taskStatus: 'PENDING', referenceValue: '', measuredValue: '', deviation: '', passFail: 'PENDING', remarks: '' };
        }
        const source = item as Record<string, unknown>;
        const referenceValue = String(source.referenceValue ?? '');
        const measuredValue = String(source.measuredValue ?? '');
        const reference = asNumber(referenceValue);
        const measured = asNumber(measuredValue);
        const deviation = reference !== null && measured !== null ? String(measured - reference) : String(source.deviation ?? '');
        return {
          id: String(source.id ?? base.id),
          title: String(source.title ?? base.title),
          taskStatus: String(source.taskStatus ?? 'PENDING').toUpperCase(),
          referenceValue,
          measuredValue,
          deviation,
          passFail: String(source.passFail ?? 'PENDING').toUpperCase(),
          remarks: String(source.remarks ?? ''),
        };
      })
      .filter((item) => item.title.trim().length > 0);
  }
  return buildCalibrationChecklist({ checklistTasks: value as CalibrationTemplateEntity['checklistTasks'] });
}

export async function validateInstrumentScope(input: {
  assetId: string;
  plantId?: string | null;
  instrumentId?: string | null;
  templateId?: string | null;
  assignedTeamId?: string | null;
}) {
  const assetRepo = AppDataSource.getRepository(AssetEntity);
  const instrumentRepo = AppDataSource.getRepository(MachineInstrumentEntity);
  const templateRepo = AppDataSource.getRepository(CalibrationTemplateEntity);
  const teamRepo = AppDataSource.getRepository(MaintenanceTeamEntity);

  const asset = await assetRepo.findOneBy({ id: input.assetId, isActive: true });
  if (!asset) throw new Error('Selected machine not found');
  if (input.plantId && asset.plantId !== input.plantId) {
    throw new Error('Selected machine does not belong to the selected plant');
  }

  if (input.instrumentId) {
    const instrument = await instrumentRepo.findOneBy({ id: input.instrumentId });
    if (!instrument) throw new Error('Selected instrument not found');
    if (instrument.assetId !== input.assetId) throw new Error('Selected instrument does not belong to the selected machine');
  }

  if (input.templateId) {
    const template = await templateRepo.findOneBy({ id: input.templateId, isActive: true });
    if (!template) throw new Error('Selected calibration template not found');
    if (input.plantId && template.plantId && template.plantId !== input.plantId) {
      throw new Error('Selected calibration template is outside the selected plant');
    }
  }

  if (input.assignedTeamId) {
    const team = await teamRepo.findOneBy({ id: input.assignedTeamId, isActive: true });
    if (!team) throw new Error('Assigned team not found');
    if (asset.plantId && team.plantId !== asset.plantId) {
      throw new Error('Assigned team is outside the machine plant');
    }
  }

  return asset;
}

export async function generateDueCalibrationTasks(now = new Date()) {
  const taskRepo = AppDataSource.getRepository(InstrumentCalibrationTaskEntity);
  const scheduleRepo = AppDataSource.getRepository(InstrumentCalibrationScheduleEntity);

  await taskRepo
    .createQueryBuilder()
    .update(InstrumentCalibrationTaskEntity)
    .set({ status: 'OVERDUE' })
    .where('status IN (:...statuses)', { statuses: ['SCHEDULED', 'IN_PROGRESS'] })
    .andWhere('due_date < :now', { now: now.toISOString() })
    .execute();

  const schedules = await scheduleRepo.find({
    where: { isActive: true },
    relations: {
      template: true,
      instrument: { asset: true },
      assignedTeam: true,
    },
  });

  for (const schedule of schedules) {
    if (!schedule.template || !schedule.instrument?.asset) continue;
    if (schedule.nextDueDate > now) continue;

    let cursor = new Date(schedule.nextDueDate);
    let generated = false;
    let guard = 0;

    while (cursor <= now && guard < 48) {
      const existing = await taskRepo.findOne({
        where: {
          scheduleId: schedule.id,
          dueDate: cursor,
        },
      });

      if (!existing) {
        const entity = taskRepo.create({
          scheduleId: schedule.id,
          instrumentId: schedule.instrumentId,
          templateId: schedule.templateId,
          assetId: schedule.instrument.assetId,
          plantId: schedule.plantId ?? schedule.instrument.asset.plantId,
          assignedTeamId: schedule.assignedTeamId ?? schedule.template.responsibleTeamId,
          calibrationType: schedule.calibrationType,
          dueDate: cursor,
          startedAt: null,
          completedAt: null,
          status: cursor < now ? 'OVERDUE' : 'SCHEDULED',
          checklist: buildCalibrationChecklist(schedule.template),
          certificateUpload: null,
          remarks: null,
        });
        await taskRepo.save(entity);

        // Send calibration due notification asynchronously
        const teamId = schedule.assignedTeamId ?? schedule.template.responsibleTeamId;
        if (teamId) {
          try {
            const team = await AppDataSource.getRepository(MaintenanceTeamEntity).findOne({
              where: { id: teamId, isActive: true },
              select: ['teamLeaderId', 'teamMemberIds'],
            });
            if (team) {
              const calUserIds = [team.teamLeaderId, ...(team.teamMemberIds ?? [])].filter(Boolean) as string[];
              if (calUserIds.length > 0) {
                const calUsers = await AppDataSource.getRepository(UserEntity).find({
                  where: calUserIds.map((id) => ({ id, isActive: true })),
                  select: ['email'],
                });
                const calEmails = calUsers.map((u) => u.email).filter((e): e is string => Boolean(e));
                if (calEmails.length > 0) {
                  sendCalibrationDueEmails(calEmails, {
                    templateName: schedule.calibrationType || schedule.template.templateName,
                    assetName: schedule.instrument?.asset?.name || schedule.instrument?.instrumentName || 'Unknown Instrument',
                    dueDate: cursor.toISOString(),
                    maintenanceType: schedule.calibrationType ?? undefined,
                  }).catch(() => {});
                }
              }
            }
          } catch {
            // Notification failures are non-blocking
          }
        }
      }

      generated = true;
      cursor = computeCalibrationNextDueDate(cursor, schedule.template);
      guard += 1;
    }

    if (generated) {
      schedule.lastGeneratedAt = now;
      schedule.nextDueDate = cursor;
      await scheduleRepo.save(schedule);
    }
  }
}
