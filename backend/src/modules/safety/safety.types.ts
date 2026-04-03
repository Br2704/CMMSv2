export interface SafetyRecord extends Record<string, unknown> {
  id: string;
  plant_id?: string | null;
}

export type CreateSafetyInput = Record<string, unknown>;
export type UpdateSafetyInput = Partial<CreateSafetyInput>;
