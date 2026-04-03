export interface ReportRecord extends Record<string, unknown> {
  id: string;
  plant_id?: string | null;
}

export type CreateReportInput = Record<string, unknown>;
export type UpdateReportInput = Partial<CreateReportInput>;
