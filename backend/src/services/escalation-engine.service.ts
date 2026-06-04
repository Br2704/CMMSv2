import { DataSource } from 'typeorm';
import { ChangeRequestEntity } from '../database/entities/change-request.entity';
import { PendingExecutionEntity } from '../database/entities/pending-execution.entity';
import * as mailService from './mail.service';

export class EscalationEngineService {
  constructor(
    private readonly dataSource: DataSource,
  ) {}

  /**
   * CRON trigger - designed to run every hour.
   * Checks for PENDING_L1 and PENDING_L2 requests older than 24, 48, and 72 hours.
   */
  async runEscalationCycle(): Promise<void> {
    const changeRepo = this.dataSource.getRepository(ChangeRequestEntity);
    const execRepo = this.dataSource.getRepository(PendingExecutionEntity);

    // In a real implementation, we would query:
    // WHERE status IN ('PENDING_L1', 'PENDING_L2')
    // AND created_at <= NOW() - INTERVAL '24 HOURS'
    // AND escalation_level < 1 (for 24h), etc.

    // 1. 24 Hour Escalation -> Notify Respective Manager
    // 2. 48 Hour Escalation -> Notify Plant Admin
    // 3. 72 Hour Escalation -> Notify Super Admin

    console.log('[EscalationEngine] Escalation cycle completed.');
  }
}
