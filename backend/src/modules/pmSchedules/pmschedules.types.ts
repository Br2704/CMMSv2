export interface PMScheduleRecord extends Record<string, unknown> {
  id: string;
  plant_id?: string | null;
}

export type CreatePMScheduleInput = Record<string, unknown>;
export type UpdatePMScheduleInput = Partial<CreatePMScheduleInput>;
