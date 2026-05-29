import { httpRequest } from "@/api/http";
import type { CalibrationTask, MachineInstrument } from "@/api/calibration";
import type { Department } from "@/api/departments";
import type { MachineModule } from "@/api/modules";
import type { PMSchedule } from "@/api/pm";
import type { Plant } from "@/api/plants";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface Asset {
  id: string;
  code: string;
  name: string;
  type: string;
  assetType:
    | "BOILER"
    | "COMPRESSOR"
    | "CHILLER"
    | "HVAC"
    | "PUMP"
    | "MOTOR"
    | "GENERATOR"
    | "FAN"
    | "CONVEYOR"
    | "ROBOT"
    | "CNC"
    | "TRANSFORMER"
    | "GEARBOX"
    | "COOLING_TOWER";
  departmentId: string | null;
  moduleId: string | null;
  costCenterId: string | null;
  plantId: string | null;
  criticality: string;
  commissionDate: string | null;
  warrantyExpiry: string | null;
  status: string;
  make: string | null;
  manufacturer: string | null;
  model: string | null;
  ratedCapacity: string | null;
  capacityUnit: string | null;
  serialNumber: string | null;
  refrigerantGasType: string | null;
  machineImageUrl: string | null;
  location: string | null;
  vendorId: string | null;
  qrCodeId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssetPayload {
  code: string;
  name: string;
  type?: string;
  assetType?:
    | "BOILER"
    | "COMPRESSOR"
    | "CHILLER"
    | "HVAC"
    | "PUMP"
    | "MOTOR"
    | "GENERATOR"
    | "FAN"
    | "CONVEYOR"
    | "ROBOT"
    | "CNC"
    | "TRANSFORMER"
    | "GEARBOX"
    | "COOLING_TOWER";
  departmentId?: string | null;
  moduleId?: string | null;
  costCenterId?: string | null;
  plantId?: string | null;
  criticality?: string;
  commissionDate?: string | null;
  warrantyExpiry?: string | null;
  status?: string;
  make?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  ratedCapacity?: number | null;
  capacityUnit?: string | null;
  serialNumber?: string | null;
  refrigerantGasType?: string | null;
  machineImageUrl?: string | null;
  location?: string | null;
  vendorId?: string | null;
  isActive?: boolean;
}

export interface AssetBulkTemplateOptions {
  types: string[];
  assetTypes: string[];
  criticalities: string[];
  statuses: string[];
  defaults: {
    type: string;
    assetType: string;
    criticality: string;
    status: string;
  };
}

export interface AssetWorkOrder {
  id: string;
  woNumber: string;
  category: string;
  priority: string;
  status: string;
  woType: string;
  problemDescription: string;
  actionTaken: string | null;
  rootCause: string | null;
  downtimeMinutes: number | string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface AssetSpareUsage {
  workOrderId: string;
  woNumber: string;
  status: string;
  usedAt: string;
  item: Record<string, unknown>;
}

export interface AssetReliabilitySummary {
  failures: number;
  downtimeMinutes: number | string;
  uptimeMinutes: number | string;
  mttrMinutes: number | string;
  mtbfMinutes: number | string;
  windowStart: string;
  windowEnd: string;
}

export interface AssetPerformanceSample {
  id: string;
  capturedAt: string;
  runtimeHours: string | null;
  energyKwh: string | null;
  productionOutput: string | null;
  efficiencyValue: string | null;
  efficiencyUnit: string | null;
  notes: string | null;
}

export interface AssetEnergyMeterConfig {
  id: string;
  assetId: string;
  plantId: string;
  checklistName: string;
  meterName: string;
  connectionType: "MODBUS_TCP" | "MODBUS_RTU_RS485";
  ipAddress: string | null;
  port: number;
  modbusSlaveId: number | null;
  modbusRegister: string | null;
  baudRate: number | null;
  parity: "NONE" | "EVEN" | "ODD" | null;
  stopBits: number | null;
  pollIntervalSeconds: number;
  driverType: "DOTNET_RS485_BRIDGE" | "NATIVE_MODBUS_TCP";
  bridgeEndpoint: string | null;
  notes: string | null;
  dataPoints: AssetEnergyMeterDataPoint[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssetEnergyMeterDataPoint {
  label: string;
  register: string;
  unit: string | null;
  multiplier: number | null;
}

export interface AssetEnergyMeterConfigPayload {
  checklistName?: string;
  meterName: string;
  connectionType?: "MODBUS_TCP" | "MODBUS_RTU_RS485";
  ipAddress?: string | null;
  port?: number;
  modbusSlaveId?: number | null;
  modbusRegister?: string | null;
  baudRate?: number | null;
  parity?: "NONE" | "EVEN" | "ODD" | null;
  stopBits?: number | null;
  pollIntervalSeconds?: number;
  driverType?: "DOTNET_RS485_BRIDGE" | "NATIVE_MODBUS_TCP";
  bridgeEndpoint?: string | null;
  notes?: string | null;
  dataPoints?: AssetEnergyMeterDataPoint[];
  isActive?: boolean;
}

export interface AssetOverview {
  asset: Asset & {
    department?: Department | null;
    module?: MachineModule | null;
    plant?: Plant | null;
    vendor?: { id: string; vendorName?: string | null; name?: string | null } | null;
  };
  hierarchy: {
    plant: Plant | null;
    department: Department | null;
    module: MachineModule | null;
  };
  workOrders: AssetWorkOrder[];
  pmSchedules: PMSchedule[];
  instruments: MachineInstrument[];
  calibrationTasks: CalibrationTask[];
  amcContracts: Array<Record<string, unknown>>;
  amcServiceReports: Array<Record<string, unknown>>;
  spareUsage: AssetSpareUsage[];
  analytics: {
    reliability: AssetReliabilitySummary | null;
    performance: AssetPerformanceSample[];
    esgSample: Array<Record<string, unknown>>;
    energyMeterConfigs: AssetEnergyMeterConfig[];
  };
}

export function listAssets(params: ListParams = {}) {
  return httpRequest<ApiListResponse<Asset>>(`/assets${toQueryString(params)}`, { method: "GET" });
}

export function getAssetBulkTemplateOptions() {
  return httpRequest<ApiResponse<AssetBulkTemplateOptions>>("/assets/template-options", { method: "GET" });
}

export function getAsset(id: string) {
  return httpRequest<ApiResponse<Asset>>(`/assets/${id}`, { method: "GET" });
}

export function getAssetOverview(id: string) {
  return httpRequest<ApiResponse<AssetOverview>>(`/assets/${id}/overview`, { method: "GET" });
}

export function createAsset(payload: AssetPayload) {
  return httpRequest<ApiResponse<Asset>>("/assets", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAsset(id: string, payload: Partial<AssetPayload>) {
  return httpRequest<ApiResponse<Asset>>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteAsset(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/assets/${id}`, { method: "DELETE" });
}

export function listAssetWorkOrders(id: string, params: ListParams = {}) {
  return httpRequest<ApiListResponse<Record<string, unknown>>>(`/assets/${id}/work-orders${toQueryString(params)}`, { method: "GET" });
}

export function listAssetEnergyMeterConfigs(id: string) {
  return httpRequest<ApiResponse<AssetEnergyMeterConfig[]>>(`/assets/${id}/energy-meter-configs`, { method: "GET" });
}

export function createAssetEnergyMeterConfig(id: string, payload: AssetEnergyMeterConfigPayload) {
  return httpRequest<ApiResponse<AssetEnergyMeterConfig>>(`/assets/${id}/energy-meter-configs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAssetEnergyMeterConfig(id: string, configId: string, payload: Partial<AssetEnergyMeterConfigPayload>) {
  return httpRequest<ApiResponse<AssetEnergyMeterConfig>>(`/assets/${id}/energy-meter-configs/${configId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAssetEnergyMeterConfig(id: string, configId: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/assets/${id}/energy-meter-configs/${configId}`, { method: "DELETE" });
}

export async function downloadAssetLogbook(id: string, assetCode: string): Promise<void> {
  const { httpDownload } = await import("@/api/http");
  const blob = await httpDownload(`/assets/${id}/logbook`);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `logbook_${assetCode}_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
