import { DataSource } from 'typeorm';
import { UserMachineMappingEntity } from '../database/entities/user-machine-mapping.entity';
import { UserShiftMappingEntity } from '../database/entities/user-shift-mapping.entity';
import { UserModuleMappingEntity } from '../database/entities/user-module-mapping.entity';

export class GovernanceValidationService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Validates if a user has explicitly been mapped to a specific machine.
   */
  async validateMachineOwnership(userId: string, machineId: string): Promise<boolean> {
    const mappingRepo = this.dataSource.getRepository(UserMachineMappingEntity);
    const mapping = await mappingRepo.findOne({ where: { user: { id: userId }, asset: { id: machineId } } });
    return !!mapping;
  }

  /**
   * Validates if a user is operating within their active mapped shift.
   */
  async validateShiftOperation(userId: string, shiftId: string): Promise<boolean> {
    const mappingRepo = this.dataSource.getRepository(UserShiftMappingEntity);
    const mapping = await mappingRepo.findOne({ where: { user: { id: userId }, shift: { id: shiftId } } });
    return !!mapping;
  }

  /**
   * Validates if a user has module clearance (e.g. electrical vs mechanical).
   */
  async validateModuleClearance(userId: string, moduleId: string): Promise<boolean> {
    const mappingRepo = this.dataSource.getRepository(UserModuleMappingEntity);
    const mapping = await mappingRepo.findOne({ where: { user: { id: userId }, module: { id: moduleId } } });
    return !!mapping;
  }

  // Frequency Validation, Duplicate Detection, etc. would be implemented here
}
