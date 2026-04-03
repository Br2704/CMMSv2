export interface NotificationRecord extends Record<string, unknown> {
  id: string;
  plant_id?: string | null;
}

export type CreateNotificationInput = Record<string, unknown>;
export type UpdateNotificationInput = Partial<CreateNotificationInput>;
