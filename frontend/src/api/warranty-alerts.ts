import { httpRequest } from "./http";
import { AssetApi } from "./assets";
import { UserApi } from "./users";

export interface WarrantyAlertApi {
  id: string;
  plantId: string | null;
  machineId: string;
  status: "OPEN" | "CLOSED";
  remarks: string | null;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  machine?: AssetApi;
  closer?: UserApi;
}

export async function getWarrantyAlerts(): Promise<WarrantyAlertApi[]> {
  const response = await httpRequest<{ success: true; data: WarrantyAlertApi[] }>(
    `/warranty-alerts`,
    { method: "GET" }
  );
  return response.data || [];
}

export async function closeWarrantyAlert(id: string, remarks: string): Promise<WarrantyAlertApi> {
  const response = await httpRequest<{ success: true; data: WarrantyAlertApi }>(
    `/warranty-alerts/${id}/close`,
    {
      method: "POST",
      body: JSON.stringify({ remarks }),
    }
  );
  return response.data;
}
