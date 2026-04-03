import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore, isAdmin, isSuperAdmin } from "@/store/auth.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Search, Edit, Trash2, Cog, Eye, QrCode, RefreshCcw, Download, Printer, ImagePlus, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import BackButton from "@/components/masters/BackButton";
import HierarchyBreadcrumb from "@/components/masters/HierarchyBreadcrumb";
import { FormDialog } from "@/components/shared/FormDialog";
import { ViewDialog } from "@/components/shared/ViewDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { createAsset, deleteAsset, listAssets, type Asset, updateAsset } from "@/api/assets";
import { getAssetAmcSummary, type AssetAmcSummary } from "@/api/amc";
import { getAssetQr, rotateAssetQr, type AssetQrData } from "@/api/qr";
import { listCostCenters, type CostCenter } from "@/api/costCenters";
import { listDepartments, type Department } from "@/api/departments";
import { listModules, type MachineModule } from "@/api/modules";
import { useMastersOptions } from "@/hooks/useMastersOptions";
import { EmptyState } from "@/components/app-shell/EmptyState";
import { FilterToolbar } from "@/components/app-shell/FilterToolbar";
import { PageHeader } from "@/components/app-shell/PageHeader";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import { PageShell } from "@/components/layout/PageShell";
import { FormGrid } from "@/components/layout/FormGrid";

interface MachineFormState {
  code: string;
  name: string;
  type: string;
  assetType: string;
  departmentId: string;
  moduleId: string;
  costCenterId: string;
  plantId: string;
  criticality: string;
  status: string;
  make: string;
  model: string;
  serialNumber: string;
  refrigerantGasType: string;
  machineImageUrl: string;
  commissionDate: string;
  warrantyExpiry: string;
}

const emptyForm: MachineFormState = {
  code: "",
  name: "",
  type: "MACHINE",
  assetType: "",
  departmentId: "",
  moduleId: "",
  costCenterId: "",
  plantId: "",
  criticality: "MEDIUM",
  status: "ACTIVE",
  make: "",
  model: "",
  serialNumber: "",
  refrigerantGasType: "",
  machineImageUrl: "",
  commissionDate: "",
  warrantyExpiry: "",
};

export default function MachinesMaster() {
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const canManage = isAdmin(user);
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, fetchPlants, invalidateOptions } = useMastersOptions();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modules, setModules] = useState<MachineModule[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<Asset | null>(null);
  const [formData, setFormData] = useState<MachineFormState>({ ...emptyForm, plantId: defaultPlantId });
  const [isEditing, setIsEditing] = useState(false);
  const [qrData, setQrData] = useState<AssetQrData | null>(null);
  const [qrImageDataUrl, setQrImageDataUrl] = useState<string>("");
  const [qrLoading, setQrLoading] = useState(false);
  const [assetAmcSummary, setAssetAmcSummary] = useState<AssetAmcSummary | null>(null);
  const [assetAmcLoading, setAssetAmcLoading] = useState(false);

  const fetchAssetsList = async () => {
    setLoading(true);
    try {
      const response = await listAssets({
        page: 1,
        limit: 100,
        search: searchQuery || undefined,
        plantId: canSelectPlant ? undefined : defaultPlantId || undefined,
      });
      setAssets(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load assets");
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartmentsList = async (plantId?: string) => {
    try {
      const response = await listDepartments({
        page: 1,
        limit: 100,
        plantId: plantId || (canSelectPlant ? undefined : defaultPlantId || undefined),
      });
      setDepartments(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load departments");
    }
  };

  const fetchModulesList = async (plantId?: string, departmentId?: string) => {
    try {
      const response = await listModules({
        page: 1,
        limit: 100,
        plantId: plantId || (canSelectPlant ? undefined : defaultPlantId || undefined),
        departmentId: departmentId || undefined,
      });
      setModules(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load modules");
    }
  };

  const fetchCostCentersList = async (plantId?: string, departmentId?: string) => {
    try {
      const response = await listCostCenters({
        page: 1,
        limit: 100,
        plantId: plantId || (canSelectPlant ? undefined : defaultPlantId || undefined),
      });

      const filteredByDepartment = departmentId
        ? response.data.filter((item) => item.departmentId === null || item.departmentId === departmentId)
        : response.data;

      setCostCenters(filteredByDepartment);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load cost centers");
    }
  };

  useEffect(() => {
    fetchAssetsList();
  }, [searchQuery, defaultPlantId, canSelectPlant]);

  useEffect(() => {
    fetchPlants();
    fetchDepartmentsList(canSelectPlant ? undefined : defaultPlantId);
    fetchModulesList(canSelectPlant ? undefined : defaultPlantId);
    fetchCostCentersList(canSelectPlant ? undefined : defaultPlantId);
  }, []);

  useEffect(() => {
    const assetId = searchParams.get("assetId");
    if (!assetId || assets.length === 0) return;
    const target = assets.find((item) => item.id === assetId);
    if (!target) return;
    setSelectedMachine(target);
    setIsViewOpen(true);
  }, [assets, searchParams]);

  useEffect(() => {
    if (!selectedMachine || !isViewOpen) {
      setAssetAmcSummary(null);
      return;
    }
    setAssetAmcLoading(true);
    void getAssetAmcSummary(selectedMachine.id)
      .then((response) => setAssetAmcSummary(response.data))
      .catch(() => setAssetAmcSummary(null))
      .finally(() => setAssetAmcLoading(false));
  }, [selectedMachine?.id, isViewOpen]);

  const filtered = useMemo(
    () => assets.filter((asset) => (categoryFilter === "all" ? true : asset.type === categoryFilter)),
    [assets, categoryFilter],
  );

  const departmentOptions = useMemo(
    () =>
      departments
        .filter((department) => !formData.plantId || department.plantId === formData.plantId)
        .map((department) => ({ value: department.id, label: `${department.code} - ${department.name}` })),
    [departments, formData.plantId],
  );

  const moduleOptions = useMemo(
    () =>
      modules
        .filter((module) => (!formData.plantId || module.plantId === formData.plantId) && (!formData.departmentId || module.departmentId === formData.departmentId))
        .map((module) => ({ value: module.id, label: `${module.code ? `${module.code} - ` : ""}${module.name}` })),
    [modules, formData.plantId, formData.departmentId],
  );

  const costCenterOptions = useMemo(
    () =>
      costCenters
        .filter((costCenter) => (!formData.plantId || costCenter.plantId === formData.plantId) && (!formData.departmentId || costCenter.departmentId === null || costCenter.departmentId === formData.departmentId))
        .map((costCenter) => ({ value: costCenter.id, label: `${costCenter.code} - ${costCenter.name}` })),
    [costCenters, formData.plantId, formData.departmentId],
  );

  const getDepartmentName = (departmentId: string | null) => departments.find((item) => item.id === departmentId)?.name || "-";
  const getModuleName = (moduleId: string | null) => modules.find((item) => item.id === moduleId)?.name || "-";
  const getCostCenterName = (costCenterId: string | null) => costCenters.find((item) => item.id === costCenterId)?.name || "-";
  const getPlantName = (plantId: string | null) => plantsOptions.find((item) => item.value === plantId)?.label || "-";
  const formatTimestamp = (value: string | null | undefined) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };
  const getCapacityText = (asset: Asset) => {
    if (!asset.ratedCapacity) return "-";
    return asset.capacityUnit ? `${asset.ratedCapacity} ${asset.capacityUnit}` : asset.ratedCapacity;
  };

  const canSubmitMachineForm =
    formData.code.trim().length > 0 &&
    formData.name.trim().length > 0 &&
    formData.assetType.trim().length > 0 &&
    (canSelectPlant ? Boolean(formData.plantId && formData.departmentId && formData.moduleId) : Boolean(defaultPlantId && formData.departmentId && formData.moduleId));

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.readAsDataURL(file);
    });

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }
    try {
      const imageDataUrl = await fileToDataUrl(file);
      setFormData((prev) => ({ ...prev, machineImageUrl: imageDataUrl }));
    } catch (error: any) {
      toast.error(error?.message || "Failed to upload image");
    }
  };

  const generateQrImage = async (payload: string) => {
    const QRCode = await import("qrcode");
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      width: 320,
      margin: 2,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    });
  };

  const buildMachineUrlPayload = (assetId: string) => `${window.location.origin}/machine/${assetId}`;

  const handleOpenQr = async (asset: Asset) => {
    setQrLoading(true);
    try {
      const response = await getAssetQr(asset.id);
      setQrData(response.data);
      setQrImageDataUrl(await generateQrImage(buildMachineUrlPayload(asset.id)));
      setIsQrOpen(true);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load QR code");
    } finally {
      setQrLoading(false);
    }
  };

  const handleRotateQr = async () => {
    if (!selectedMachine) return;
    setQrLoading(true);
    try {
      const response = await rotateAssetQr(selectedMachine.id);
      setQrData(response.data);
      setQrImageDataUrl(await generateQrImage(buildMachineUrlPayload(selectedMachine.id)));
      toast.success("QR token rotated successfully");
    } catch (error: any) {
      toast.error(error?.message || "Failed to rotate QR token");
    } finally {
      setQrLoading(false);
    }
  };

  const triggerQrDownload = (imageDataUrl: string, machineCode: string) => {
    const anchor = document.createElement("a");
    anchor.href = imageDataUrl;
    anchor.download = `${machineCode}-qr.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const downloadQrImage = () => {
    if (!qrImageDataUrl || !selectedMachine) return;
    triggerQrDownload(qrImageDataUrl, selectedMachine.code);
  };

  const handleDownloadQrForMachine = async () => {
    if (!selectedMachine) return;
    setQrLoading(true);
    try {
      const response = await getAssetQr(selectedMachine.id);
      const imageDataUrl = await generateQrImage(buildMachineUrlPayload(selectedMachine.id));
      setQrData(response.data);
      setQrImageDataUrl(imageDataUrl);
      triggerQrDownload(imageDataUrl, selectedMachine.code);
    } catch (error: any) {
      toast.error(error?.message || "Failed to download QR");
    } finally {
      setQrLoading(false);
    }
  };

  const printQrLabel = () => {
    if (!qrImageDataUrl || !selectedMachine || !qrData) return;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>QR Label - ${selectedMachine.code}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            .label { width: 280px; border: 1px solid #d4d4d8; padding: 12px; border-radius: 8px; }
            .title { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
            .meta { font-size: 12px; color: #52525b; margin-bottom: 8px; }
            img { width: 220px; height: 220px; }
            .token { margin-top: 8px; font-size: 11px; color: #71717a; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="title">${selectedMachine.code} - ${selectedMachine.name}</div>
            <div class="meta">QR label for quick asset lookup</div>
            <img src="${qrImageDataUrl}" alt="Asset QR" />
            <div class="token">Machine ID: ${selectedMachine.id}</div>
            <div class="token">Machine Name: ${selectedMachine.name}</div>
            <div class="token">URL: ${buildMachineUrlPayload(selectedMachine.id)}</div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleAdd = () => {
    setFormData({ ...emptyForm, plantId: canSelectPlant ? "" : defaultPlantId });
    setSelectedMachine(null);
    setIsEditing(false);
    setIsFormOpen(true);
  };

  const handleEdit = async (asset: Asset) => {
    if (asset.plantId) {
      await Promise.all([
        fetchDepartmentsList(asset.plantId),
        fetchModulesList(asset.plantId, asset.departmentId || undefined),
        fetchCostCentersList(asset.plantId, asset.departmentId || undefined),
      ]);
    }
    setFormData({
      code: asset.code,
      name: asset.name,
      type: asset.type,
      assetType: asset.assetType || "PUMP",
      departmentId: asset.departmentId || "",
      moduleId: asset.moduleId || "",
      costCenterId: asset.costCenterId || "",
      plantId: asset.plantId || "",
      criticality: asset.criticality,
      status: asset.status,
      make: asset.make || "",
      model: asset.model || "",
      serialNumber: asset.serialNumber || "",
      refrigerantGasType: asset.refrigerantGasType || "",
      machineImageUrl: asset.machineImageUrl || "",
      commissionDate: asset.commissionDate || "",
      warrantyExpiry: asset.warrantyExpiry || "",
    });
    setSelectedMachine(asset);
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handlePlantChange = async (plantId: string) => {
    setFormData((prev) => ({ ...prev, plantId, departmentId: "", moduleId: "", costCenterId: "" }));
    await Promise.all([fetchDepartmentsList(plantId), fetchModulesList(plantId), fetchCostCentersList(plantId)]);
  };

  const handleDepartmentChange = async (departmentId: string) => {
    const plantId = formData.plantId || (canSelectPlant ? undefined : defaultPlantId);
    setFormData((prev) => ({ ...prev, departmentId, moduleId: "", costCenterId: "" }));
    await Promise.all([fetchModulesList(plantId, departmentId), fetchCostCentersList(plantId, departmentId)]);
  };

  const handleSubmit = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error("Code and name are required");
      return;
    }

    const resolvedPlantId = canSelectPlant ? formData.plantId || null : defaultPlantId || null;
    if (!resolvedPlantId || !formData.departmentId || !formData.moduleId) {
      toast.error("Plant, department and module are required");
      return;
    }
    if (!formData.assetType) {
      toast.error("Asset type is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        type: formData.type,
        assetType: formData.assetType as "BOILER" | "COMPRESSOR" | "CHILLER" | "HVAC" | "PUMP",
        departmentId: formData.departmentId,
        moduleId: formData.moduleId,
        costCenterId: formData.costCenterId || null,
        plantId: resolvedPlantId,
        criticality: formData.criticality,
        status: formData.status,
        make: formData.make.trim() || null,
        model: formData.model.trim() || null,
        serialNumber: formData.serialNumber.trim() || null,
        refrigerantGasType: formData.refrigerantGasType.trim() || null,
        machineImageUrl: formData.machineImageUrl || null,
        commissionDate: formData.commissionDate || null,
        warrantyExpiry: formData.warrantyExpiry || null,
      };

      if (isEditing && selectedMachine) {
        await updateAsset(selectedMachine.id, payload);
        toast.success("Machine updated");
      } else {
        await createAsset(payload);
        toast.success("Machine created");
      }
      invalidateOptions(["assets", "modules"]);
      setIsFormOpen(false);
      await fetchAssetsList();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save machine");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedMachine) return;
    setSaving(true);
    const previous = assets;
    setAssets((curr) => curr.filter((row) => row.id !== selectedMachine.id));
    try {
      await deleteAsset(selectedMachine.id);
      toast.success("Machine deleted");
      invalidateOptions("assets");
      setIsDeleteOpen(false);
      await fetchAssetsList();
    } catch (error: any) {
      setAssets(previous);
      toast.error(error?.message || "Failed to delete machine");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMachineImage = async () => {
    if (!selectedMachine || !canManage) return;
    setSaving(true);
    try {
      await updateAsset(selectedMachine.id, { machineImageUrl: null });
      setSelectedMachine({ ...selectedMachine, machineImageUrl: null });
      setAssets((rows) =>
        rows.map((row) => (row.id === selectedMachine.id ? { ...row, machineImageUrl: null } : row)),
      );
      toast.success("Machine image removed");
      invalidateOptions("assets");
    } catch (error: any) {
      toast.error(error?.message || "Failed to remove machine image");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "code", header: "Code", render: (item: Asset) => <span className="font-semibold text-primary">{item.code}</span> },
    { key: "name", header: "Name", render: (item: Asset) => <span className="font-medium">{item.name}</span> },
    {
      key: "plant",
      header: "Plant",
      render: (item: Asset) => getPlantName(item.plantId),
      hideOnMobile: true,
    },
    {
      key: "department",
      header: "Department",
      render: (item: Asset) => getDepartmentName(item.departmentId),
      hideOnMobile: true,
    },
    {
      key: "module",
      header: "Module",
      render: (item: Asset) => getModuleName(item.moduleId),
      hideOnMobile: true,
    },
    {
      key: "assetType",
      header: "Asset Type",
      render: (item: Asset) => item.assetType || "-",
      hideOnMobile: true,
    },
    {
      key: "criticality",
      header: "Criticality",
      render: (item: Asset) => (
        <StatusBadge variant={item.criticality === "HIGH" ? "critical" : item.criticality === "MEDIUM" ? "warning" : "default"}>
          {item.criticality}
        </StatusBadge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item: Asset) => (
        <StatusBadge variant={item.status === "ACTIVE" ? "active" : item.status === "UNDER_MAINTENANCE" ? "in_progress" : "inactive"}>
          {item.status.replace(/_/g, " ")}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item: Asset) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSelectedMachine(item);
              setIsViewOpen(true);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSelectedMachine(item);
              void handleOpenQr(item);
            }}
            disabled={qrLoading}
          >
            <QrCode className="h-4 w-4" />
          </Button>
          {canManage && (
            <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {canManage && (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => {
                setSelectedMachine(item);
                setIsDeleteOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <BackButton />
      <PageHeader
        title="Machines & Equipment"
        description="Manage machines under Plant -> Department -> Module -> Machine hierarchy"
        actions={
          canManage ? (
            <Button onClick={handleAdd} className="w-full gap-2 gradient-primary text-primary-foreground shadow-glow sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Machine
            </Button>
          ) : undefined
        }
      />
      <Card className="shadow-card">
        <CardContent className="py-4">
          <HierarchyBreadcrumb currentLevel="machine" />
        </CardContent>
      </Card>
      <FilterToolbar
        left={
          <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
            <Cog className="h-5 w-5 text-primary" />
            Equipment ({filtered.length})
          </CardTitle>
        }
        right={
          <>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 pl-9" />
            </div>
            <SelectField
              label=""
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "all", label: "All" },
                { value: "MACHINE", label: "Machine" },
                { value: "UTILITY", label: "Utility" },
              ]}
              className="w-full sm:w-[160px] min-w-[140px] flex-shrink-0"
            />
          </>
        }
      />
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg font-semibold">Machine List</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (<TableSkeleton />) : filtered.length === 0 ? (<EmptyState title="No machines found" description="Add your first machine record to start work orders and logs." actionLabel={canManage ? "Add Machine" : undefined} onAction={canManage ? handleAdd : undefined} />) : (
            <ResponsiveTable
              data={filtered}
              columns={columns}
              keyExtractor={(item: Asset) => item.id}
              mobileCard={(item: Asset) => (
                <MobileCard
                  onView={() => {
                    setSelectedMachine(item);
                    setIsViewOpen(true);
                  }}
                  onEdit={canManage ? () => handleEdit(item) : undefined}
                  onDelete={
                    canManage
                      ? () => {
                          setSelectedMachine(item);
                          setIsDeleteOpen(true);
                        }
                      : undefined
                  }
                >
                  <MobileCardHeader
                    title={item.code}
                    subtitle={item.name}
                    badge={<StatusBadge variant={item.status === "ACTIVE" ? "active" : "inactive"}>{item.status}</StatusBadge>}
                  />
                  <MobileCardRow label="Department" value={getDepartmentName(item.departmentId)} />
                  <MobileCardRow label="Module" value={getModuleName(item.moduleId)} />
                  <MobileCardRow label="Asset Type" value={item.assetType || "-"} />
                  <MobileCardRow label="Criticality" value={item.criticality} />
                </MobileCard>
              )}
            />
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={isEditing ? "Edit Machine" : "Add New Machine"}
        description="Manage machine/equipment"
        onSubmit={handleSubmit}
        submitLabel={saving ? "Saving..." : isEditing ? "Update" : "Add"}
        isLoading={saving}
        submitDisabled={!canSubmitMachineForm}
        size="lg"
      >
        <FormGrid>
          <InputField label="Code" value={formData.code} onChange={(value) => setFormData({ ...formData, code: value })} placeholder="MCH-001" required />
          <InputField label="Name" value={formData.name} onChange={(value) => setFormData({ ...formData, name: value })} placeholder="CNC Lathe" required />
          <SelectField label="Type" value={formData.type} onChange={(value) => setFormData({ ...formData, type: value })} options={[{ value: "MACHINE", label: "Machine" }, { value: "UTILITY", label: "Utility" }]} />
          <SelectField
            label="Asset Type"
            required
            value={formData.assetType}
            onChange={(value) => setFormData({ ...formData, assetType: value })}
            options={[
              { value: "BOILER", label: "Boiler" },
              { value: "COMPRESSOR", label: "Compressor" },
              { value: "CHILLER", label: "Chiller" },
              { value: "HVAC", label: "HVAC" },
              { value: "PUMP", label: "Pump" },
            ]}
            placeholder="Select asset type"
          />
          <SelectField label="Criticality" value={formData.criticality} onChange={(value) => setFormData({ ...formData, criticality: value })} options={[{ value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }]} />
          {canSelectPlant ? (
            <SelectField label="Plant" required value={formData.plantId} onChange={handlePlantChange} options={plantsOptions} placeholder="Select plant" />
          ) : (
            <InputField label="Plant" value={getPlantName(defaultPlantId)} onChange={() => {}} disabled />
          )}
          <SelectField
            label="Department"
            required
            value={formData.departmentId}
            onChange={handleDepartmentChange}
            options={departmentOptions}
            placeholder="Select department"
            disabled={canSelectPlant ? !formData.plantId : false}
            hint={
              canSelectPlant && !formData.plantId
                ? "Select plant first."
                : departmentOptions.length === 0
                  ? "No departments for selected plant."
                  : undefined
            }
          />
          <SelectField
            label="Module"
            required
            value={formData.moduleId}
            onChange={(value) => setFormData({ ...formData, moduleId: value })}
            options={moduleOptions}
            placeholder="Select module"
            disabled={!formData.departmentId}
            hint={!formData.departmentId ? "Select department first." : moduleOptions.length === 0 ? "No modules for selected department." : undefined}
          />
          <SelectField
            label="Cost Center"
            value={formData.costCenterId}
            onChange={(value) => setFormData({ ...formData, costCenterId: value })}
            options={costCenterOptions}
            placeholder="Select cost center"
            disabled={!formData.departmentId}
            hint={!formData.departmentId ? "Select department first." : costCenterOptions.length === 0 ? "No cost centers for selected scope." : undefined}
          />
          <SelectField label="Status" value={formData.status} onChange={(value) => setFormData({ ...formData, status: value })} options={[{ value: "ACTIVE", label: "Active" }, { value: "UNDER_MAINTENANCE", label: "Under Maintenance" }, { value: "INACTIVE", label: "Inactive" }]} />
          <InputField label="Make" value={formData.make} onChange={(value) => setFormData({ ...formData, make: value })} />
          <InputField label="Model" value={formData.model} onChange={(value) => setFormData({ ...formData, model: value })} />
          <InputField label="Serial Number" value={formData.serialNumber} onChange={(value) => setFormData({ ...formData, serialNumber: value })} />
          <InputField
            label="Refrigerant Gas Type"
            value={formData.refrigerantGasType}
            onChange={(value) => setFormData({ ...formData, refrigerantGasType: value })}
            placeholder="R134a / R410A / Ammonia"
          />
          <div className="col-span-1 sm:col-span-2 space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <ImagePlus className="h-4 w-4 text-primary" />
              Machine Image
            </label>
            <Input
              type="file"
              accept="image/*"
              onChange={(event) => void handleImageUpload(event.target.files?.[0] || null)}
            />
            {formData.machineImageUrl ? (
              <div className="rounded-md border border-border/60 p-2 w-fit">
                <img src={formData.machineImageUrl} alt="Machine preview" className="h-20 w-20 object-cover rounded" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Upload JPG/PNG/WebP image (max 5MB)</p>
            )}
            {formData.machineImageUrl ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setFormData({ ...formData, machineImageUrl: "" })}>
                Remove Image
              </Button>
            ) : null}
          </div>
          <InputField label="Commission Date" value={formData.commissionDate} onChange={(value) => setFormData({ ...formData, commissionDate: value })} type="date" />
          <InputField label="Warranty Expiry" value={formData.warrantyExpiry} onChange={(value) => setFormData({ ...formData, warrantyExpiry: value })} type="date" />
        </FormGrid>
      </FormDialog>
      <ViewDialog
        open={isViewOpen}
        onOpenChange={setIsViewOpen}
        title={selectedMachine?.name || ""}
        subtitle={selectedMachine?.code}
        contentClassName="sm:max-w-3xl max-h-[80vh] overflow-y-auto"
      >
        {selectedMachine && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{selectedMachine.code}</p>
                <p className="break-words text-sm text-muted-foreground">
                  {getPlantName(selectedMachine.plantId)} {"->"} {getDepartmentName(selectedMachine.departmentId)} {"->"} {getModuleName(selectedMachine.moduleId)}
                </p>
              </div>
              <StatusBadge variant={selectedMachine.status === "ACTIVE" ? "active" : selectedMachine.status === "UNDER_MAINTENANCE" ? "in_progress" : "inactive"}>
                {selectedMachine.status.replace(/_/g, " ")}
              </StatusBadge>
            </div>

            <div className="space-y-3">
              <div className="w-full flex justify-center">
                <div className="w-full max-w-[360px] h-[220px] sm:h-[240px] border border-border/60 rounded-xl bg-muted/30 flex items-center justify-center overflow-hidden shadow-sm">
                  {selectedMachine.machineImageUrl ? (
                    <img
                      src={selectedMachine.machineImageUrl}
                      alt={selectedMachine.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <ImageIcon className="h-10 w-10 mb-2" />
                      <p className="text-sm">No Image Available</p>
                    </div>
                  )}
                </div>
              </div>
              {selectedMachine.machineImageUrl && canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => void handleRemoveMachineImage()}
                  disabled={saving}
                >
                  {saving ? "Removing..." : "Remove Image"}
                </Button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { label: "Plant", value: getPlantName(selectedMachine.plantId) },
                { label: "Department", value: getDepartmentName(selectedMachine.departmentId) },
                { label: "Module", value: getModuleName(selectedMachine.moduleId) },
                { label: "Machine Name", value: selectedMachine.name },
                { label: "Machine Code", value: selectedMachine.code },
                { label: "Machine Type", value: `${selectedMachine.type} / ${selectedMachine.assetType || "-"}` },
                { label: "Manufacturer", value: selectedMachine.manufacturer || selectedMachine.make || "-" },
                { label: "Model", value: selectedMachine.model || "-" },
                { label: "Capacity", value: getCapacityText(selectedMachine) },
                { label: "Commissioning Date", value: selectedMachine.commissionDate || "-" },
                { label: "Location", value: selectedMachine.location || "-" },
                { label: "Criticality", value: selectedMachine.criticality },
                { label: "AMC Contract", value: assetAmcSummary?.covered ? assetAmcSummary.contract?.contractName || assetAmcSummary.contract?.contractNumber || "-" : "Not Covered" },
                { label: "QR Code ID", value: selectedMachine.qrCodeId || "-" },
                { label: "Created At", value: formatTimestamp(selectedMachine.createdAt) },
                { label: "Updated At", value: formatTimestamp(selectedMachine.updatedAt) },
                { label: "Cost Center", value: getCostCenterName(selectedMachine.costCenterId) },
                { label: "Serial Number", value: selectedMachine.serialNumber || "-" },
                { label: "Refrigerant Gas Type", value: selectedMachine.refrigerantGasType || "-" },
                { label: "Warranty Expiry", value: selectedMachine.warrantyExpiry || "-" },
              ].map((field) => (
                <div key={field.label} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</p>
                  <p className="mt-1 break-words text-sm font-medium text-foreground">{field.value || "-"}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">AMC Summary</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {assetAmcLoading ? "Loading AMC details..." : assetAmcSummary?.covered ? "Asset is covered under AMC" : "No active AMC coverage"}
                  </p>
                </div>
                {assetAmcSummary?.covered ? <StatusBadge variant="active">{assetAmcSummary.contract?.status || "ACTIVE"}</StatusBadge> : null}
              </div>
              {assetAmcSummary?.covered ? (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contract</p>
                    <p className="mt-1 text-sm font-medium">{assetAmcSummary.contract?.contractName || assetAmcSummary.contract?.contractNumber}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next Visit</p>
                    <p className="mt-1 text-sm font-medium">{assetAmcSummary.nextVisit?.visitDate || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending Breakdowns</p>
                    <p className="mt-1 text-sm font-medium">{assetAmcSummary.pendingBreakdowns}</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
              <Button variant="outline" onClick={() => setIsViewOpen(false)}>
                Close
              </Button>
              {canManage ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsViewOpen(false);
                    void handleEdit(selectedMachine);
                  }}
                >
                  Edit
                </Button>
              ) : null}
              <Button className="gap-2" onClick={() => void handleDownloadQrForMachine()} disabled={qrLoading}>
                <Download className="h-4 w-4" />
                Download QR
              </Button>
            </div>
          </div>
        )}
      </ViewDialog>
      <ViewDialog open={isQrOpen} onOpenChange={setIsQrOpen} title="Asset QR Code" subtitle={selectedMachine?.code}>
        <div className="space-y-4">
          {qrImageDataUrl ? (
            <div className="flex justify-center">
              <img src={qrImageDataUrl} alt="Asset QR code" className="h-64 w-64 rounded-md border border-border bg-white p-2" />
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground">QR image is being generated...</div>
          )}
          {qrData ? (
            <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              <p><span className="font-medium text-foreground">Resolver URL:</span> {qrData.publicResolverUrl}</p>
              <p className="mt-1"><span className="font-medium text-foreground">Token:</span> {qrData.qrToken}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" className="gap-2" onClick={handleRotateQr} disabled={qrLoading || !selectedMachine}>
              <RefreshCcw className="h-4 w-4" />
              Rotate
            </Button>
            <Button variant="secondary" className="gap-2" onClick={downloadQrImage} disabled={!qrImageDataUrl}>
              <Download className="h-4 w-4" />
              Download QR
            </Button>
            <Button className="gap-2" onClick={printQrLabel} disabled={!qrImageDataUrl}>
              <Printer className="h-4 w-4" />
              Print Label
            </Button>
          </div>
        </div>
      </ViewDialog>
      <DeleteConfirmDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} title="Delete Machine" itemName={selectedMachine?.name} onConfirm={confirmDelete} isLoading={saving} />
    </PageShell>
  );
}





