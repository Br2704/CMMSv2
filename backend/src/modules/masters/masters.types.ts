export interface MasterRecord extends Record<string, unknown> {
  id: string;
  plant_id?: string | null;
}

export type CreateMasterInput = Record<string, unknown>;
export type UpdateMasterInput = Partial<CreateMasterInput>;
