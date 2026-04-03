export interface UserRecord extends Record<string, unknown> {
  id: string;
  plant_id?: string | null;
}

export type CreateUserInput = Record<string, unknown>;
export type UpdateUserInput = Partial<CreateUserInput>;
