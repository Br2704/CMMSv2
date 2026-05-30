import { AppDataSource } from '../../database/data-source';
import { WorkOrderEntity, AssetEntity, MaintenanceTeamEntity, SpareItemEntity, UserEntity } from '../../database/entities';
import { resolvePlantFilter } from '../../utils/plantScope';
import { AuthContext } from '../../types/auth';

export class AdvancedAnalyticsService {
  static async getDashboardKPIs(query: any, auth: AuthContext) {
    const scopedPlantIds = resolvePlantFilter(auth, query.plantId);
    
    // We'll use a single pass or efficient aggregations where possible
    const qb = AppDataSource.getRepository(WorkOrderEntity).createQueryBuilder('wo');
    
    if (scopedPlantIds && scopedPlantIds.length > 0) {
      qb.andWhere('wo.plantId IN (:...plantIds)', { plantIds: scopedPlantIds });
    } else if (scopedPlantIds && scopedPlantIds.length === 0) {
      return this.emptyKPIs();
    }

    // Date range filtering
    const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    qb.andWhere('wo.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate });

    const allWos = await qb.getMany();
    
    // Work Order KPIs
    const totalWO = allWos.length;
    const openWO = allWos.filter(w => !['CLOSED', 'CANCELLED'].includes(w.status)).length;
    const inProgressWO = allWos.filter(w => w.status === 'IN_PROGRESS').length;
    const pendingApprovalWO = allWos.filter(w => w.status === 'USER_VERIFICATION' || w.status === 'APPROVAL_PENDING').length;
    const rejectedWO = allWos.filter(w => w.status === 'REJECTED').length;
    const closedWO = allWos.filter(w => w.status === 'CLOSED').length;
    const followUpWO = allWos.filter(w => w.followUpRequired).length;
    
    // Breakdown KPIs
    const breakdownWos = allWos.filter(w => w.woType === 'BREAKDOWN');
    const totalBreakdowns = breakdownWos.length;
    const operatorFaultCases = allWos.filter(w => w.operatorFault).length;
    const actualFailures = allWos.filter(w => w.isFailureEvent).length;
    const safetyIncidents = allWos.filter(w => w.safetyRelated).length;

    // Time KPIs (Mean Time calculations)
    const closedWos = allWos.filter(w => w.status === 'CLOSED' && w.closedAt && (w.startedAt || w.openedAt));
    const totalMttrMinutes = closedWos.reduce((acc, w) => acc + (w.downtimeMinutes || 0), 0);
    const mttr = closedWos.length > 0 ? Math.round(totalMttrMinutes / closedWos.length) : 0;

    // MTBF Calculation
    const mtbf = this.calculateMTBF(allWos, startDate, endDate);

    // Team Performance (simplified)
    const teamStats = this.calculateTeamPerformance(allWos);

    // Cost KPIs
    const totalSpareCost = allWos.reduce((acc, w) => acc + Number(w.actualCost || 0), 0);
    const laborCost = allWos.reduce((acc, w) => acc + (Number(w.laborHours || 0) * 500), 0); // Assuming 500/hr baseline

    return {
      workOrderKPIs: {
        totalWO, openWO, inProgressWO, pendingApprovalWO, rejectedWO, closedWO, followUpWO
      },
      breakdownKPIs: {
        totalBreakdowns, operatorFaultCases, actualFailures, safetyIncidents
      },
      timeKPIs: {
        mttr, mtbf, 
        avgResponseTime: this.calculateAvgResponse(allWos),
        avgApprovalTime: this.calculateAvgApproval(allWos)
      },
      teamKPIs: teamStats,
      costKPIs: {
        spareConsumptionCost: totalSpareCost,
        laborCost: Math.round(laborCost),
        totalMaintenanceCost: Math.round(totalSpareCost + laborCost)
      }
    };
  }

  private static calculateMTBF(wos: WorkOrderEntity[], start: Date, end: Date) {
    const failureWos = wos.filter(w => w.isFailureEvent && w.createdAt);
    if (failureWos.length < 2) return 0;
    
    const periodHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return Math.round(periodHours / failureWos.length);
  }

  private static calculateAvgResponse(wos: WorkOrderEntity[]) {
    const responded = wos.filter(w => w.openedAt && w.createdAt);
    if (responded.length === 0) return 0;
    const total = responded.reduce((acc, w) => acc + (w.openedAt!.getTime() - w.createdAt.getTime()), 0);
    return Math.round(total / responded.length / 60000);
  }

  private static calculateAvgApproval(wos: WorkOrderEntity[]) {
    const approved = wos.filter(w => w.approvedAt && w.submittedForApprovalAt);
    if (approved.length === 0) return 0;
    const total = approved.reduce((acc, w) => acc + (w.approvedAt!.getTime() - w.submittedForApprovalAt!.getTime()), 0);
    return Math.round(total / approved.length / 60000);
  }

  private static calculateTeamPerformance(wos: WorkOrderEntity[]) {
    const teams: Record<string, any> = {};
    wos.forEach(w => {
      const cat = w.actualFailureCategory || w.category;
      if (!cat) return;
      if (!teams[cat]) teams[cat] = { total: 0, closed: 0, downtime: 0 };
      teams[cat].total++;
      if (w.status === 'CLOSED') {
        teams[cat].closed++;
        teams[cat].downtime += (w.downtimeMinutes || 0);
      }
    });
    return Object.entries(teams).map(([name, stats]) => ({
      name,
      efficiency: stats.total > 0 ? Math.round((stats.closed / stats.total) * 100) : 0,
      avgRepairTime: stats.closed > 0 ? Math.round(stats.downtime / stats.closed) : 0
    }));
  }

  private static emptyKPIs() {
    return {
      workOrderKPIs: { totalWO: 0, openWO: 0, inProgressWO: 0, pendingApprovalWO: 0, rejectedWO: 0, closedWO: 0, followUpWO: 0 },
      breakdownKPIs: { totalBreakdowns: 0, operatorFaultCases: 0, actualFailures: 0, safetyIncidents: 0 },
      timeKPIs: { mttr: 0, mtbf: 0, avgResponseTime: 0, avgApprovalTime: 0 },
      teamKPIs: [],
      costKPIs: { spareConsumptionCost: 0, laborCost: 0, totalMaintenanceCost: 0 }
    };
  }
}
