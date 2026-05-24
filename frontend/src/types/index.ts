// User Types
export type UserRole = 
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'NORMAL_USER'
  | 'MECHANICAL_INCHARGE'
  | 'ELECTRICAL_INCHARGE'
  | 'UTILITY_INCHARGE'
  | 'TOOLCHANGE_INCHARGE'
  | 'CALIBRATION_INCHARGE';

export interface User {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  designation: string;
  mobile: string;
  avatar?: string;
  isActive: boolean;
  createdAt: Date;
}

// Asset Types
export type AssetType = 'MACHINE' | 'UTILITY';
export type CriticalityLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Asset {
  id: string;
  code: string;
  name: string;
  type: AssetType;
  department: string;
  subDepartment?: string;
  criticality: CriticalityLevel;
  commissionDate: Date;
  warrantyExpiry?: Date;
  status: 'ACTIVE' | 'INACTIVE' | 'UNDER_MAINTENANCE';
  documents?: string[];
}

// Work Order Types
export type WorkOrderStatus = 
  | 'RAISED'
  | 'TRIAGED'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'OPENED'
  | 'IN_PROGRESS'
  | 'USER_VERIFICATION'
  | 'APPROVAL_PENDING'
  | 'REJECTED'
  | 'REASSIGNED'
  | 'CANCELLED'
  | 'CLOSED';

export type WorkOrderCategory = 
  | 'MECHANICAL'
  | 'ELECTRICAL'
  | 'UTILITY'
  | 'TOOL_CHANGE'
  | 'CALIBRATION';

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface WorkOrder {
  id: string;
  woNumber: string;
  asset: Asset;
  category: WorkOrderCategory;
  priority: Priority;
  status: WorkOrderStatus;
  problemDescription: string;
  raisedBy: User;
  raisedAt: Date;
  assignedTo?: User;
  openedAt?: Date;
  closedAt?: Date;
  rootCause?: string;
  actionTaken?: string;
  downtimeMinutes?: number;
  operatorFault?: boolean;
  sparesUsed?: string[];
  remarks?: string;
  images?: string[];
}

// PM/PD Types
export type PMFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface PreventiveMaintenance {
  id: string;
  asset: Asset;
  frequency: PMFrequency;
  lastCompleted?: Date;
  nextDue: Date;
  checklist: string[];
  assignedTo?: User;
  status: 'SCHEDULED' | 'OVERDUE' | 'COMPLETED';
}

// Stock Types
export type StockRequestStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'ISSUED' | 'CONSUMED';

export interface SpareItem {
  id: string;
  code: string;
  name: string;
  category: string;
  currentStock: number;
  minLevel: number;
  reorderLevel: number;
  unit: string;
  location: string;
}

export interface StockRequest {
  id: string;
  spare: SpareItem;
  quantity: number;
  requestedBy: User;
  requestedAt: Date;
  status: StockRequestStatus;
  workOrder?: WorkOrder;
  approvedBy?: User;
  approvedAt?: Date;
}

// Analytics Types
export interface MTTRData {
  date: string;
  value: number;
  asset?: string;
}

export interface MTBFData {
  asset: string;
  value: number;
}

export interface DashboardMetrics {
  totalAssets: number;
  activeWorkOrders: number;
  closedLast24h: number;
  overduepm: number;
  mttrAvg: number;
  mtbfAvg: number;
  pmCompliance: number;
}
