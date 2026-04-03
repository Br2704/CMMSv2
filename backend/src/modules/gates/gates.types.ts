export interface GateRecord extends Record<string, unknown> {
  id: string;
  plant_id?: string | null;
}

export type CreateGateInput = Record<string, unknown>;
export type UpdateGateInput = Partial<CreateGateInput>;
