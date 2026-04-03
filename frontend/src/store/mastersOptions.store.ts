import { getMasterDataGraph, type MasterDataGraph } from "@/api/master-data";

const CACHE_TTL_MS = 2 * 60 * 1000;

export interface OptionItem {
  value: string;
  label: string;
}

interface CachedGraph {
  expiresAt: number;
  data: MasterDataGraph;
}

interface MastersOptionsState {
  plantsOptions: OptionItem[];
  departmentsOptions: OptionItem[];
  modulesOptions: OptionItem[];
  assetsOptions: OptionItem[];
  hierarchyGraph: MasterDataGraph | null;
  loading: {
    plants: boolean;
    departments: boolean;
    modules: boolean;
    assets: boolean;
    graph: boolean;
  };
}

type OptionsKey = "plants" | "departments" | "modules" | "assets";

class MastersOptionsStore {
  private state: MastersOptionsState = {
    plantsOptions: [],
    departmentsOptions: [],
    modulesOptions: [],
    assetsOptions: [],
    hierarchyGraph: null,
    loading: {
      plants: false,
      departments: false,
      modules: false,
      assets: false,
      graph: false,
    },
  };

  private listeners = new Set<() => void>();
  private graphCache = new Map<string, CachedGraph>();
  private graphInFlight = new Map<string, Promise<MasterDataGraph>>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private setLoading(key: keyof MastersOptionsState["loading"], loading: boolean) {
    this.state = {
      ...this.state,
      loading: {
        ...this.state.loading,
        [key]: loading,
      },
    };
    this.emit();
  }

  private setState(partial: Partial<MastersOptionsState>) {
    this.state = {
      ...this.state,
      ...partial,
    };
    this.emit();
  }

  private isValid(entry?: CachedGraph) {
    return !!entry && entry.expiresAt > Date.now();
  }

  private graphKey(plantId?: string | null, includeInactive = false) {
    return `${plantId || "all"}|${includeInactive ? "all-status" : "active"}`;
  }

  private deriveOptions(graph: MasterDataGraph, scope?: { plantId?: string | null; departmentId?: string | null; moduleId?: string | null }) {
    const departments = graph.departments.filter((department) => !scope?.plantId || department.plantId === scope.plantId);
    const modules = graph.modules.filter((module) => {
      if (scope?.plantId && module.plantId !== scope.plantId) return false;
      if (scope?.departmentId && module.departmentId !== scope.departmentId) return false;
      return true;
    });
    const assets = graph.assets.filter((asset) => {
      if (scope?.plantId && asset.plantId !== scope.plantId) return false;
      if (scope?.departmentId && asset.departmentId !== scope.departmentId) return false;
      if (scope?.moduleId && asset.moduleId !== scope.moduleId) return false;
      return true;
    });

    return {
      plantsOptions: graph.plants.map((plant) => ({
        value: plant.id,
        label: `${plant.plantCode} - ${plant.plantName}`,
      })),
      departmentsOptions: departments.map((department) => ({
        value: department.id,
        label: `${department.code} - ${department.name}`,
      })),
      modulesOptions: modules.map((module) => ({
        value: module.id,
        label: `${module.code ? `${module.code} - ` : ""}${module.name}`,
      })),
      assetsOptions: assets.map((asset) => ({
        value: asset.id,
        label: `${asset.code} - ${asset.name}`,
      })),
    };
  }

  fetchGraph = async (plantId?: string | null, includeInactive = false, force = false) => {
    const key = this.graphKey(plantId, includeInactive);
    const cached = this.graphCache.get(key);

    if (!force && this.isValid(cached)) {
      this.setState({ hierarchyGraph: cached!.data });
      return cached!.data;
    }

    const pending = this.graphInFlight.get(key);
    if (pending) {
      const graph = await pending;
      this.setState({ hierarchyGraph: graph });
      return graph;
    }

    this.setLoading("graph", true);
    const request = getMasterDataGraph({ plantId: plantId ?? undefined, includeInactive })
      .then((response) => {
        const graph = response.data;
        this.graphCache.set(key, { data: graph, expiresAt: Date.now() + CACHE_TTL_MS });
        this.setState({ hierarchyGraph: graph });
        return graph;
      })
      .catch(() => {
        this.setState({
          hierarchyGraph: null,
          plantsOptions: [],
          departmentsOptions: [],
          modulesOptions: [],
          assetsOptions: [],
        });
        return {
          organizations: [],
          plants: [],
          departments: [],
          modules: [],
          assets: [],
          hierarchy: [],
        } satisfies MasterDataGraph;
      });

    this.graphInFlight.set(key, request);
    try {
      return await request;
    } finally {
      this.graphInFlight.delete(key);
      this.setLoading("graph", false);
    }
  };

  fetchPlants = async (force = false) => {
    this.setLoading("plants", true);
    try {
      const graph = await this.fetchGraph(undefined, false, force);
      const nextState = this.deriveOptions(graph);
      this.setState(nextState);
      return nextState.plantsOptions;
    } finally {
      this.setLoading("plants", false);
    }
  };

  fetchDepartments = async (plantId?: string | null, force = false) => {
    this.setLoading("departments", true);
    try {
      const graph = await this.fetchGraph(plantId, false, force);
      const nextState = this.deriveOptions(graph, { plantId });
      this.setState(nextState);
      return nextState.departmentsOptions;
    } finally {
      this.setLoading("departments", false);
    }
  };

  fetchModules = async (plantId?: string | null, departmentId?: string | null, force = false) => {
    this.setLoading("modules", true);
    try {
      const graph = await this.fetchGraph(plantId, false, force);
      const nextState = this.deriveOptions(graph, { plantId, departmentId });
      this.setState(nextState);
      return nextState.modulesOptions;
    } finally {
      this.setLoading("modules", false);
    }
  };

  fetchAssets = async (plantId?: string | null, departmentId?: string | null, moduleId?: string | null, force = false) => {
    this.setLoading("assets", true);
    try {
      const graph = await this.fetchGraph(plantId, false, force);
      const nextState = this.deriveOptions(graph, { plantId, departmentId, moduleId });
      this.setState(nextState);
      return nextState.assetsOptions;
    } finally {
      this.setLoading("assets", false);
    }
  };

  invalidate = (keys?: OptionsKey | OptionsKey[]) => {
    const scoped = !keys ? ["plants", "departments", "modules", "assets"] : Array.isArray(keys) ? keys : [keys];
    if (scoped.length) {
      this.graphCache.clear();
      this.graphInFlight.clear();
    }
    this.state = {
      ...this.state,
      plantsOptions: scoped.includes("plants") ? [] : this.state.plantsOptions,
      departmentsOptions: scoped.includes("departments") ? [] : this.state.departmentsOptions,
      modulesOptions: scoped.includes("modules") ? [] : this.state.modulesOptions,
      assetsOptions: scoped.includes("assets") ? [] : this.state.assetsOptions,
      hierarchyGraph: null,
    };
    this.emit();
  };

  invalidatePlants = () => this.invalidate("plants");
  invalidateDepartments = () => this.invalidate("departments");
  invalidateModules = () => this.invalidate("modules");
  invalidateAssets = () => this.invalidate("assets");
}

export const mastersOptionsStore = new MastersOptionsStore();
