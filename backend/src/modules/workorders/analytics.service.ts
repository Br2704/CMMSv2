import { AppDataSource } from '../../database/data-source';
import { WorkOrderEntity, MaintenanceReportEntity, UserEntity, AssetEntity, PlantEntity, MaintenanceTeamEntity } from '../../database/entities';
import { GenericRecord } from '../_core/crud.types';

export class AnalyticsService {
  /**
   * Automatically classifies failure categories and root causes based on text analysis
   * This is part of Phase 2 - Failure Categorization Engine
   */
  static classifyFailure(wo: WorkOrderEntity): { category: string; rootCauseClass: string } {
    const text = `${wo.problemDescription} ${wo.rootCause} ${wo.actionTaken} ${wo.failureCode}`.toLowerCase();
    
    let category = wo.actualFailureCategory || 'OTHER';
    let rootCauseClass = 'OTHER';

    // Phase 2: Failure Category Logic
    if (text.includes('motor') || text.includes('cable') || text.includes('sensor') || text.includes('breaker') || text.includes('wiring')) {
      category = 'ELECTRICAL';
    } else if (text.includes('bearing') || text.includes('gear') || text.includes('belt') || text.includes('shaft') || text.includes('leak')) {
      category = 'MECHANICAL';
    } else if (text.includes('plc') || text.includes('hmi') || text.includes('instrument') || text.includes('calibration')) {
      category = 'INSTRUMENTATION';
    } else if (text.includes('utility') || text.includes('compressor') || text.includes('chiller') || text.includes('water')) {
      category = 'UTILITY';
    } else if (text.includes('operator') || text.includes('fault') || text.includes('mishandling')) {
      category = 'OPERATOR_FAULT';
    }

    // Phase 2: Root Cause Classification Logic
    if (text.includes('wear') || text.includes('tear') || text.includes('aged')) {
      rootCauseClass = 'WEAR_AND_TEAR';
    } else if (text.includes('lubrication') || text.includes('grease') || text.includes('oil')) {
      rootCauseClass = 'LUBRICATION_ISSUE';
    } else if (text.includes('loose') || text.includes('vibration') || text.includes('tighten')) {
      rootCauseClass = 'LOOSE_CONNECTION';
    } else if (text.includes('overheat') || text.includes('hot') || text.includes('temperature')) {
      rootCauseClass = 'OVERHEATING';
    } else if (text.includes('alignment') || text.includes('balance')) {
      rootCauseClass = 'ALIGNMENT_ISSUE';
    } else if (text.includes('sensor') || text.includes('limit switch') || text.includes('proximity')) {
      rootCauseClass = 'SENSOR_ISSUE';
    }

    return { category, rootCauseClass };
  }

  /**
   * Phase 1: Generates a high-fidelity Maintenance Report entry from a closed Work Order
   */
  static async generateMaintenanceReport(workOrderId: string, manager = AppDataSource.manager) {
    const wo = await manager.getRepository(WorkOrderEntity).findOne({
      where: { id: workOrderId },
      relations: ['asset', 'plant', 'raisedByUser', 'assignedToUser', 'approvedByUser', 'followUpTeam']
    });

    if (!wo) return;

    const reportRepo = manager.getRepository(MaintenanceReportEntity);
    const existingReport = await reportRepo.findOneBy({ workOrderId: wo.id });
    
    // Calculate metrics
    const startTime = wo.downtimeStartAt || wo.startedAt || wo.openedAt || wo.createdAt;
    const responseTime = wo.openedAt && wo.createdAt ? Math.round((wo.openedAt.getTime() - wo.createdAt.getTime()) / 60000) : 0;
    const totalDowntime = wo.downtimeMinutes || (wo.closedAt && startTime ? Math.round((wo.closedAt.getTime() - startTime.getTime()) / 60000) : 0);
    
    const { category, rootCauseClass } = this.classifyFailure(wo);

    const reportData = reportRepo.create({
      workOrderId: wo.id,
      woNumber: wo.woNumber,
      assetId: wo.assetId,
      assetCode: wo.asset.code,
      assetName: wo.asset.name,
      assetCategory: wo.category,
      plantId: wo.plantId || '',
      plantName: wo.plant?.plantName || 'Unknown',
      departmentId: wo.asset.departmentId,
      // Note: Full names would need more joins if not in relations, keeping simple for now
      raisedBy: wo.raisedBy,
      raisedByName: wo.raisedByUser?.fullName || null,
      assignedTo: wo.assignedTo,
      assignedToName: wo.assignedToUser?.fullName || null,
      approvedBy: wo.approvedBy,
      approvedByName: wo.approvedByUser?.fullName || null,
      closureDate: wo.closedAt || new Date(),
      
      issueTitle: wo.problemDescription.slice(0, 100),
      problemDescription: wo.problemDescription,
      actualFailureCategory: category,
      failureCode: wo.failureCode,
      rootCause: wo.rootCause,
      subRootCause: rootCauseClass,
      operatorFault: wo.operatorFault,
      breakdownType: wo.breakdownType,
      
      initialAssessment: wo.initialAssessment,
      actualCorrectiveAction: wo.actionTaken,
      preventiveRecommendation: wo.preventiveRecommendation,
      followUpRequired: wo.followUpRequired,
      followUpTeamId: wo.followUpTeamId,
      whyWhyAnalysis: wo.whyWhyAnalysis,
      technicianRemarks: wo.remarks,
      
      startTime: startTime,
      responseTime: responseTime,
      openTime: wo.openedAt ? Math.round((new Date().getTime() - wo.openedAt.getTime()) / 60000) : 0, // Approx
      completionTime: wo.resolvedAt,
      approvalTime: wo.approvedAt,
      totalDowntime: totalDowntime,
      actualRepairTime: Number(wo.laborHours || 0) * 60,
      
      manpowerUsed: wo.manpowerUsed,
      spareConsumption: wo.spareConsumption,
      totalSpareCost: wo.actualCost,
      attachments: wo.attachments,
    });

    if (existingReport) {
      Object.assign(existingReport, reportData);
      await reportRepo.save(existingReport);
    } else {
      await reportRepo.save(reportData);
    }
  }
}
