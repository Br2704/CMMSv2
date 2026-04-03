import { useSyncExternalStore } from "react";
import { mastersOptionsStore } from "@/store/mastersOptions.store";

export function useMastersOptions() {
  const state = useSyncExternalStore(mastersOptionsStore.subscribe, mastersOptionsStore.getSnapshot, mastersOptionsStore.getSnapshot);

  return {
    ...state,
    fetchGraph: mastersOptionsStore.fetchGraph,
    fetchPlants: mastersOptionsStore.fetchPlants,
    fetchDepartments: mastersOptionsStore.fetchDepartments,
    fetchModules: mastersOptionsStore.fetchModules,
    fetchAssets: mastersOptionsStore.fetchAssets,
    invalidateOptions: mastersOptionsStore.invalidate,
    invalidatePlants: mastersOptionsStore.invalidatePlants,
    invalidateDepartments: mastersOptionsStore.invalidateDepartments,
    invalidateModules: mastersOptionsStore.invalidateModules,
    invalidateAssets: mastersOptionsStore.invalidateAssets,
  };
}
