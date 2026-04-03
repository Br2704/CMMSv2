import { In } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { MaintenanceTeamEntity, ProfileEntity, UserEntity } from '../../database/entities';
import type { AuthContext } from '../../types/auth';
import { badRequest, notFound } from '../../utils/httpError';
import type { GenericRecord } from '../_core/crud.types';
import { CrudService } from '../_core/crud.service';
import { maintenanceTeamsRepository } from './maintenance-teams.repository';

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

class MaintenanceTeamsService extends CrudService {
  private readonly teamsRepo = AppDataSource.getRepository(MaintenanceTeamEntity);
  private readonly usersRepo = AppDataSource.getRepository(UserEntity);
  private readonly profilesRepo = AppDataSource.getRepository(ProfileEntity);

  constructor() {
    super(
      {
        moduleName: 'maintenanceTeams',
        moduleId: 'MASTERS',
        basePath: '/api/maintenance-teams',
        tableName: 'maintenance_teams',
        plantColumn: 'plant_id',
      },
      maintenanceTeamsRepository,
    );
  }

  private async validateUsersForPlant(plantId: string, leaderId: string | null, memberIds: string[]): Promise<void> {
    const requestedUserIds = uniqueIds([leaderId, ...memberIds]);
    if (requestedUserIds.length === 0) {
      return;
    }

    const [users, profiles] = await Promise.all([
      this.usersRepo.find({
        where: { id: In(requestedUserIds), isActive: true },
        select: ['id'],
      }),
      this.profilesRepo.find({
        where: { userId: In(requestedUserIds), plantId, isActive: true },
        select: ['userId'],
      }),
    ]);

    const profileIds = new Set(profiles.map((profile) => profile.userId));
    const validIds = new Set(users.map((user) => user.id).filter((id) => profileIds.has(id)));
    const invalidIds = requestedUserIds.filter((userId) => !validIds.has(userId));
    if (invalidIds.length > 0) {
      badRequest('One or more selected users are inactive or outside the selected plant', { invalidUserIds: invalidIds });
    }
  }

  async create(input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    const plantId = (input.plant_id ?? input.plantId) as string | undefined;
    const teamLeaderId = (input.team_leader_id ?? input.teamLeaderId ?? null) as string | null;
    const teamMemberIds = Array.isArray(input.team_member_ids ?? input.teamMemberIds)
      ? uniqueIds((input.team_member_ids ?? input.teamMemberIds) as string[])
      : [];

    if (!plantId) {
      badRequest('plant_id is required');
    }
    if (!teamLeaderId) {
      badRequest('team_leader_id is required');
    }

    await this.validateUsersForPlant(plantId, teamLeaderId, teamMemberIds);
    return super.create(
      {
        ...input,
        team_member_ids: teamMemberIds,
      },
      auth,
    );
  }

  async update(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    const existing = await this.teamsRepo.findOne({
      where: { id },
      select: ['id', 'plantId', 'teamLeaderId', 'teamMemberIds'],
    });
    if (!existing) {
      notFound('maintenance team record not found');
    }

    const plantId = String(input.plant_id ?? input.plantId ?? existing.plantId);
    const teamLeaderId = (input.team_leader_id ?? input.teamLeaderId ?? existing.teamLeaderId ?? null) as string | null;
    const teamMemberIds = Array.isArray(input.team_member_ids ?? input.teamMemberIds)
      ? uniqueIds((input.team_member_ids ?? input.teamMemberIds) as string[])
      : uniqueIds(existing.teamMemberIds ?? []);

    if (!teamLeaderId) {
      badRequest('team_leader_id is required');
    }

    await this.validateUsersForPlant(plantId, teamLeaderId, teamMemberIds);
    return super.update(
      id,
      {
        ...input,
        team_member_ids: teamMemberIds,
      },
      auth,
    );
  }

  async remove(id: string, auth: AuthContext): Promise<void> {
    await this.getById(id, auth);
    await this.teamsRepo.delete({ id });
  }
}

export const maintenanceTeamsService = new MaintenanceTeamsService();
