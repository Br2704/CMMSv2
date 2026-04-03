import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface MachineInstrument {
  id: string;
  assetId: string;
  instrumentName: string;
  instrumentType: string;
  serialNumber: string | null;
  rangeMin: string | null;
  rangeMax: string | null;
  unit: string | null;
  installationDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  asset: {
    id: string;
    code: string;
    name: string;
    plantId: string | null;
    departmentId: string | null;
    moduleId: string | null;
  } | null;
}

export interface MachineInstrumentPayload {
  assetId: string;
  plantId?: string | null;
  instrumentName: string;
  instrumentType: string;
  serialNumber?: string | null;
  rangeMin?: string | number | null;
  rangeMax?: string | number | null;
  unit?: string | null;
  installationDate?: string | null;
  status?: string;
}

export interface CalibrationTemplate {
  id: string;
  plantId: string | null;
  templateName: string;
  instrumentType: string;
  calibrationMethod: string;
  tolerance: string | null;
  frequencyType: "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  frequencyValue: number;
  estimatedDuration: number;
  responsibleTeamId: string | null;
  checklistTasks: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  responsibleTeam: {
    id: string;
    teamName: string;
    discipline: string;
  } | null;
}

export interface CalibrationTemplatePayload {
  plantId?: string | null;
  templateName: string;
  instrumentType: string;
  calibrationMethod: string;
  tolerance?: string | null;
  frequencyType: "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  frequencyValue: number;
  estimatedDuration: number;
  responsibleTeamId?: string | null;
  checklistTasks: string[];
  isActive?: boolean;
}

export interface CalibrationSchedule {
  id: string;
  scheduleCode: string;
  instrumentId: string;
  templateId: string;
  plantId: string | null;
  startDate: string;
  nextDueDate: string;
  assignedTeamId: string | null;
  calibrationType: string;
  lastGeneratedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  instrument: {
    id: string;
    instrumentName: string;
    instrumentType: string;
    serialNumber: string | null;
    status: string;
    asset: {
      id: string;
      code: string;
      name: string;
      plantId: string | null;
      departmentId: string | null;
      moduleId: string | null;
    } | null;
  } | null;
  template: {
    id: string;
    templateName: string;
    instrumentType: string;
    calibrationMethod: string;
    tolerance: string | null;
    frequencyType: string;
    frequencyValue: number;
    estimatedDuration: number;
  } | null;
  assignedTeam: {
    id: string;
    teamName: string;
    discipline: string;
  } | null;
}

export interface CalibrationSchedulePayload {
  instrumentId: string;
  templateId: string;
  plantId?: string | null;
  startDate: string;
  assignedTeamId?: string | null;
  calibrationType?: string;
  isActive?: boolean;
}

export interface CalibrationChecklistResult {
  id: string;
  title: string;
  taskStatus: string;
  referenceValue: string;
  measuredValue: string;
  deviation: string;
  passFail: string;
  remarks: string;
}

export interface CalibrationTask {
  id: string;
  calibrationId: string;
  scheduleId: string;
  instrumentId: string;
  templateId: string | null;
  assetId: string;
  plantId: string | null;
  assignedTeamId: string | null;
  calibrationType: string;
  dueDate: string;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  checklist: CalibrationChecklistResult[];
  certificateUpload: { name: string; dataUrl: string } | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  instrument: {
    id: string;
    instrumentName: string;
    instrumentType: string;
    serialNumber: string | null;
    status: string;
  } | null;
  asset: {
    id: string;
    code: string;
    name: string;
    plantId: string | null;
    departmentId: string | null;
    moduleId: string | null;
  } | null;
  template: {
    id: string;
    templateName: string;
    instrumentType: string;
    calibrationMethod: string;
    tolerance: string | null;
  } | null;
  assignedTeam: {
    id: string;
    teamName: string;
    discipline: string;
  } | null;
}

export interface CalibrationTaskUpdatePayload {
  status?: string;
  checklist?: CalibrationChecklistResult[];
  remarks?: string | null;
  certificateUpload?: { name: string; dataUrl: string } | null;
}

export function listMachineInstruments(
  params: ListParams & {
    assetId?: string;
    departmentId?: string;
    moduleId?: string;
    status?: string;
    instrumentType?: string;
  } = {},
) {
  return httpRequest<ApiListResponse<MachineInstrument>>(`/calibration/instruments${toQueryString(params)}`, { method: "GET" });
}

export function createMachineInstrument(payload: MachineInstrumentPayload) {
  return httpRequest<ApiResponse<MachineInstrument>>("/calibration/instruments", { method: "POST", body: JSON.stringify(payload) });
}

export function updateMachineInstrument(id: string, payload: Partial<MachineInstrumentPayload>) {
  return httpRequest<ApiResponse<MachineInstrument>>(`/calibration/instruments/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteMachineInstrument(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/calibration/instruments/${id}`, { method: "DELETE" });
}

export function listCalibrationTemplates(params: ListParams = {}) {
  return httpRequest<ApiListResponse<CalibrationTemplate>>(`/calibration/templates${toQueryString(params)}`, { method: "GET" });
}

export function createCalibrationTemplate(payload: CalibrationTemplatePayload) {
  return httpRequest<ApiResponse<CalibrationTemplate>>("/calibration/templates", { method: "POST", body: JSON.stringify(payload) });
}

export function updateCalibrationTemplate(id: string, payload: Partial<CalibrationTemplatePayload>) {
  return httpRequest<ApiResponse<CalibrationTemplate>>(`/calibration/templates/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteCalibrationTemplate(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/calibration/templates/${id}`, { method: "DELETE" });
}

export function listCalibrationSchedules(
  params: ListParams & { instrumentId?: string; templateId?: string; assetId?: string } = {},
) {
  return httpRequest<ApiListResponse<CalibrationSchedule>>(`/calibration/schedules${toQueryString(params)}`, { method: "GET" });
}

export function createCalibrationSchedule(payload: CalibrationSchedulePayload) {
  return httpRequest<ApiResponse<CalibrationSchedule>>("/calibration/schedules", { method: "POST", body: JSON.stringify(payload) });
}

export function updateCalibrationSchedule(id: string, payload: Partial<CalibrationSchedulePayload>) {
  return httpRequest<ApiResponse<CalibrationSchedule>>(`/calibration/schedules/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteCalibrationSchedule(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/calibration/schedules/${id}`, { method: "DELETE" });
}

export function listCalibrationTasks(
  params: ListParams & { instrumentId?: string; assetId?: string; status?: string } = {},
) {
  return httpRequest<ApiListResponse<CalibrationTask>>(`/calibration/tasks${toQueryString(params)}`, { method: "GET" });
}

export function updateCalibrationTask(id: string, payload: CalibrationTaskUpdatePayload) {
  return httpRequest<ApiResponse<CalibrationTask>>(`/calibration/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export type CalibrationRecord = Record<string, unknown>;

export function listCalibrations(params: ListParams = {}) {
  return httpRequest<ApiListResponse<CalibrationRecord>>(`/calibration${toQueryString(params)}`, { method: "GET" });
}

export function getCalibration(id: string) {
  return httpRequest<ApiResponse<CalibrationRecord>>(`/calibration/${id}`, { method: "GET" });
}

export function createCalibration(payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<CalibrationRecord>>("/calibration", { method: "POST", body: JSON.stringify(payload) });
}

export function updateCalibration(id: string, payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<CalibrationRecord>>(`/calibration/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteCalibration(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/calibration/${id}`, { method: "DELETE" });
}
