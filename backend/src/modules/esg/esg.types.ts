export interface EsgRecord extends Record<string, unknown> {
  id: string;
  plant_id?: string | null;
}

export type CreateEsgInput = Record<string, unknown>;
export type UpdateEsgInput = Partial<CreateEsgInput>;
