export interface AmcRecord extends Record<string, unknown> {
  id: string;
  plant_id?: string | null;
}

export type CreateAmcInput = Record<string, unknown>;
export type UpdateAmcInput = Partial<CreateAmcInput>;
