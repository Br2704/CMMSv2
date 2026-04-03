import { getFeaturesMe, type FeatureMap } from "@/api/features";
import { ApiError, getStoredAccessToken } from "@/api/http";
import { create } from "zustand";

interface FeaturesState {
  organizationId: string | null;
  features: FeatureMap;
  loading: boolean;
  loadFeatures: () => Promise<void>;
  isFeatureEnabled: (featureKey: string) => boolean;
  reset: () => void;
}

export const useFeaturesStore = create<FeaturesState>((set, get) => ({
  organizationId: null,
  features: {},
  loading: false,

  loadFeatures: async () => {
    if (!getStoredAccessToken()) {
      set({ organizationId: null, features: {}, loading: false });
      return;
    }

    set({ loading: true });
    try {
      const response = await getFeaturesMe();
      const enabledList = Array.isArray(response.data.enabled) ? response.data.enabled : [];
      const mappedFromEnabled = Object.fromEntries(
        enabledList.map((item) => [item.trim().toUpperCase(), true]),
      ) as FeatureMap;
      const featureMap = response.data.features ?? mappedFromEnabled;

      set({
        organizationId: response.data.organizationId ?? null,
        features: featureMap,
        loading: false,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401 || error.status === 403) {
          set({ organizationId: null, features: {}, loading: false });
          return;
        }
      }
      set({ loading: false });
    }
  },

  isFeatureEnabled: (featureKey: string) => {
    const key = featureKey.trim().toUpperCase();
    const features = get().features;
    if (!(key in features)) return true;
    return features[key] === true;
  },

  reset: () => {
    set({ organizationId: null, features: {}, loading: false });
  },
}));
