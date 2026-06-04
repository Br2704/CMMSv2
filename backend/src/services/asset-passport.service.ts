import { DataSource } from 'typeorm';
import { AssetEntity } from '../database/entities/asset.entity';
import { WorkOrderEntity } from '../database/entities/work-order.entity';
import { RecordRevisionEntity } from '../database/entities/record-revision.entity';
import { ChangeRequestEntity } from '../database/entities/change-request.entity';
import { PendingExecutionEntity } from '../database/entities/pending-execution.entity';

export class AssetPassportService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Generates the Machine Digital Passport for the Auditor Dashboard
   */
  async generatePassport(assetId: string): Promise<any> {
    const assetRepo = this.dataSource.getRepository(AssetEntity);
    
    // 1. Asset Profile
    const asset = await assetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new Error('Asset not found');

    // 2. Transactional History (Aggregating counts or fetching latest records)
    const woRepo = this.dataSource.getRepository(WorkOrderEntity);
    const wos = await woRepo.find({ where: { assetId }, order: { createdAt: 'DESC' }, take: 50 });

    // 3. Governance History
    const changeReqRepo = this.dataSource.getRepository(ChangeRequestEntity);
    // Real implementation would filter by JSONB payload linking to this asset
    const changeRequests = await changeReqRepo.find({ order: { createdAt: 'DESC' }, take: 20 });

    const revRepo = this.dataSource.getRepository(RecordRevisionEntity);
    // Same for revisions

    // 4. Compliance Calculation (Dummy values for architecture representation)
    const pmCompliancePercentage = 98.5;
    const calibrationCompliancePercentage = 100;
    const SLAAdherence = 95.2;

    return {
      assetProfile: asset,
      compliance: {
        pmCompliancePercentage,
        calibrationCompliancePercentage,
        SLAAdherence,
        overallStatus: 'AUDIT_READY',
      },
      workOrders: wos,
      governance: {
        changeRequests,
        // ... revisions, executions
      }
    };
  }
}
