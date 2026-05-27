import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Edit, Eye, ImageIcon, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  createOrganization,
  deleteOrganization,
  listOrganizations,
  type Organization,
  updateOrganization,
} from "@/api/organizations";
import { listRootUsers, type RootOrgUser } from "@/api/rootUsers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import BackButton from "@/components/masters/BackButton";
import { FormDialog } from "@/components/shared/FormDialog";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, SelectField, SwitchField, TextareaField } from "@/components/shared/FormField";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Toolbar } from "@/components/layout/Toolbar";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { FormGrid } from "@/components/layout/FormGrid";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import { EmptyState } from "@/components/app-shell/EmptyState";
import { useAuthStore } from "@/store/auth.store";
import { isRootAdmin } from "@/lib/permission-engine";
import { useBrandingStore } from "@/store/branding.store";

interface OrganizationFormState {
  name: string;
  code: string;
  legalName: string;
  industry: string;
  registrationNumber: string;
  taxId: string;
  website: string;
  contactEmail: string;
  contactPhone: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  notes: string;
  logoUrl: string;
  faviconUrl: string;
  brandColor: string;
  billingCycle: "" | "MONTHLY" | "YEARLY";
  subscriptionStatus: "DRAFT" | "TRIAL" | "ACTIVE" | "EXPIRING" | "EXPIRED" | "SUSPENDED";
  hasFreeTrial: boolean;
  trialStartDate: string;
  trialEndDate: string;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  reminderEnabled: boolean;
  reminderLeadDays: string;
  isActive: boolean;
  superadminUserIds: string[];
}

const emptyForm: OrganizationFormState = {
  name: "",
  code: "",
  legalName: "",
  industry: "",
  registrationNumber: "",
  taxId: "",
  website: "",
  contactEmail: "",
  contactPhone: "",
  primaryContactName: "",
  primaryContactEmail: "",
  primaryContactPhone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  country: "",
  postalCode: "",
  notes: "",
  logoUrl: "",
  faviconUrl: "",
  brandColor: "#0f172a",
  billingCycle: "",
  subscriptionStatus: "DRAFT",
  hasFreeTrial: false,
  trialStartDate: "",
  trialEndDate: "",
  subscriptionStartDate: "",
  subscriptionEndDate: "",
  reminderEnabled: true,
  reminderLeadDays: "60",
  isActive: true,
  superadminUserIds: [],
};

const billingCycleOptions = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

const subscriptionStatusOptions = [
  { value: "DRAFT", label: "Draft" },
  { value: "TRIAL", label: "Trial" },
  { value: "ACTIVE", label: "Active" },
  { value: "EXPIRING", label: "Expiring" },
  { value: "EXPIRED", label: "Expired" },
  { value: "SUSPENDED", label: "Suspended" },
];

const reminderLeadOptions = [
  { value: "15", label: "15 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days (2 months)" },
  { value: "90", label: "90 days" },
];

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function normalizeDateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function getSubscriptionVariant(status?: Organization["subscriptionStatus"]) {
  switch (status) {
    case "ACTIVE":
      return "active" as const;
    case "TRIAL":
      return "info" as const;
    case "EXPIRING":
      return "warning" as const;
    case "EXPIRED":
      return "inactive" as const;
    case "SUSPENDED":
      return "critical" as const;
    default:
      return "default" as const;
  }
}

function getBillingCycleLabel(value?: Organization["billingCycle"] | "") {
  if (!value) return "Not set";
  return value === "MONTHLY" ? "Monthly" : "Yearly";
}

function buildAddress(organization: Organization) {
  return [
    organization.addressLine1,
    organization.addressLine2,
    organization.city,
    organization.state,
    organization.country,
    organization.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  const status = getErrorStatus(error);
  if (status === 413) {
    return "Uploaded branding image is too large for the server. Use a smaller logo or favicon and try again.";
  }
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string" && error.message) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function getErrorStatus(error: unknown) {
  if (typeof error === "object" && error && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function isAcceptedImageFile(file: File, allowedExtensions: string[] = []) {
  if (file.type.startsWith("image/")) {
    return true;
  }
  const normalizedName = file.name.trim().toLowerCase();
  return allowedExtensions.some((extension) => normalizedName.endsWith(extension));
}

function getOrganizationSuperadminIds(users: RootOrgUser[], organizationId: string) {
  return users
    .filter((userItem) => userItem.organizationId === organizationId && userItem.roleKey === "SUPER_ADMIN" && userItem.isActive)
    .map((userItem) => userItem.id);
}

function formatScopedSuperadmins(users: RootOrgUser[]) {
  return users
    .map((userItem) => {
      const identifier = userItem.userCode?.trim() || userItem.fullName;
      return `${identifier} - ${userItem.fullName}`;
    })
    .join(", ");
}

function sortOrganizations(items: Organization[]) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || "");
    const rightTime = Date.parse(right.createdAt || "");
    return rightTime - leftTime;
  });
}

function matchesOrganizationSearch(organization: Organization, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [
    organization.name,
    organization.code,
    organization.legalName,
    organization.contactEmail,
    organization.primaryContactEmail,
    organization.website,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalized));
}

function buildRootOrganizationFallback(
  user: ReturnType<typeof useAuthStore.getState>["user"],
  brandingOrganizationId: string | null,
  brandingOrganizationName: string | null,
  brandingLogoUrl: string | null,
): Organization | null {
  const organizationId = user?.organizationId ?? brandingOrganizationId ?? null;
  const organizationName = brandingOrganizationName?.trim() || null;
  if (!organizationId || !organizationName) {
    return null;
  }

  return {
    id: organizationId,
    name: organizationName,
    code: null,
    legalName: organizationName,
    industry: null,
    registrationNumber: null,
    taxId: null,
    website: null,
    contactEmail: user?.email ?? null,
    contactPhone: user?.phone ?? null,
    primaryContactName: user?.fullName ?? null,
    primaryContactEmail: user?.email ?? null,
    primaryContactPhone: user?.phone ?? null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    country: null,
    postalCode: null,
    notes: null,
    logoUrl: brandingLogoUrl,
    faviconUrl: null,
    brandColor: null,
    billingCycle: null,
    subscriptionStatus: "ACTIVE",
    hasFreeTrial: false,
    trialStartDate: null,
    trialEndDate: null,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    reminderEnabled: true,
    reminderLeadDays: 60,
    lastReminderSentAt: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    plantsCount: 0,
    usersCount: 0,
    adminsCount: 0,
    superadminsCount: 0,
  };
}

export default function RootOrganizationMaster() {
  const { user } = useAuthStore();
  const refreshBranding = useBrandingStore((state) => state.fetchBranding);
  const brandingOrganizationId = useBrandingStore((state) => state.organizationId);
  const brandingOrganizationName = useBrandingStore((state) => state.organizationName);
  const brandingLogoUrl = useBrandingStore((state) => state.logoUrl);
  const isRootUser = isRootAdmin(user?.roles ?? []);
  const canManageOrganizations = isRootUser;
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [superadminsLoading, setSuperadminsLoading] = useState(true);
  const [superadminUsers, setSuperadminUsers] = useState<RootOrgUser[]>([]);
  const [viewSuperadminsLoading, setViewSuperadminsLoading] = useState(false);
  const [viewSuperadmins, setViewSuperadmins] = useState<RootOrgUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [formData, setFormData] = useState<OrganizationFormState>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const fallbackOrganization = useMemo(
    () =>
      buildRootOrganizationFallback(
        user,
        brandingOrganizationId,
        brandingOrganizationName,
        brandingLogoUrl,
      ),
    [brandingLogoUrl, brandingOrganizationId, brandingOrganizationName, user],
  );

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await listOrganizations({
        page: 1,
        limit: 200,
      });
      const listData = response.data;
      if (listData.length > 0 || !isRootUser) {
        setOrganizations(sortOrganizations(listData));
        return;
      }

      setOrganizations(fallbackOrganization ? [fallbackOrganization] : []);
    } catch (error: unknown) {
      if (fallbackOrganization && [400, 401].includes(getErrorStatus(error) ?? 0)) {
        setOrganizations([fallbackOrganization]);
        return;
      }
      const status = getErrorStatus(error);
      const message = status === 401
        ? "Your session expired while loading organizations. Sign in again and retry."
        : getErrorMessage(error, "Failed to load organizations");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [fallbackOrganization, isRootUser]);

  const fetchSuperadmins = useCallback(async () => {
    setSuperadminsLoading(true);
    try {
      const response = await listRootUsers({
        roleKey: "SUPER_ADMIN",
        page: 1,
        limit: 500,
        includeInactive: true,
      });
      setSuperadminUsers(response.data);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load organization superadmins"));
    } finally {
      setSuperadminsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrganizations();
  }, [fetchOrganizations, isRootUser]);

  useEffect(() => {
    const refresh = () => {
      void fetchOrganizations();
    };

    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
    };
  }, [fetchOrganizations]);

  useEffect(() => {
    void fetchSuperadmins();
  }, [fetchSuperadmins]);

  useEffect(() => {
    if (!isViewOpen || !selectedOrganization) {
      setViewSuperadmins([]);
      setViewSuperadminsLoading(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setViewSuperadminsLoading(true);
      try {
        const response = await listRootUsers({
          organizationId: selectedOrganization.id,
          roleKey: "SUPER_ADMIN",
          page: 1,
          limit: 200,
          includeInactive: true,
        });
        if (!cancelled) {
          setViewSuperadmins(response.data);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          toast.error(getErrorMessage(error, "Failed to load organization superadmins"));
          setViewSuperadmins([]);
        }
      } finally {
        if (!cancelled) {
          setViewSuperadminsLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isViewOpen, selectedOrganization]);

  const filtered = useMemo(
    () => organizations.filter((organization) => matchesOrganizationSearch(organization, searchQuery)),
    [organizations, searchQuery],
  );
  const displayOrganizations = useMemo(() => {
    if (filtered.length > 0) {
      return filtered;
    }
    if (!fallbackOrganization) {
      return filtered;
    }
    if (!matchesOrganizationSearch(fallbackOrganization, searchQuery)) {
      return filtered;
    }
    if (organizations.some((organization) => organization.id === fallbackOrganization.id)) {
      return filtered;
    }
    return [fallbackOrganization];
  }, [fallbackOrganization, filtered, organizations, searchQuery]);
  const selectedOrganizationSuperadmins = useMemo(
    () =>
      (isViewOpen ? viewSuperadmins : superadminUsers)
        .filter((userItem) => userItem.organizationId === selectedOrganization?.id && userItem.roleKey === "SUPER_ADMIN" && userItem.isActive),
    [isViewOpen, selectedOrganization?.id, superadminUsers, viewSuperadmins],
  );
  const sortedSuperadminUsers = useMemo(
    () =>
      [...superadminUsers]
        .filter((userItem) => userItem.roleKey === "SUPER_ADMIN" && userItem.isActive)
        .sort((left, right) => left.fullName.localeCompare(right.fullName)),
    [superadminUsers],
  );

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read logo file"));
      reader.readAsDataURL(file);
    });

  const handleLogoUpload = async (file: File | null) => {
    if (!file) return;
    if (!isAcceptedImageFile(file, [".svg"])) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo size must be under 2MB");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setFormData((prev) => ({ ...prev, logoUrl: dataUrl }));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to upload logo"));
    }
  };

  const handleFaviconUpload = async (file: File | null) => {
    if (!file) return;
    if (!isAcceptedImageFile(file, [".ico", ".svg"])) {
      toast.error("Please upload a favicon image");
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error("Favicon size must be under 1MB");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setFormData((prev) => ({ ...prev, faviconUrl: dataUrl }));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to upload favicon"));
    }
  };

  const handleAdd = () => {
    if (!canManageOrganizations) return;
    setFormData(emptyForm);
    setSelectedOrganization(null);
    setIsEditing(false);
    setIsFormOpen(true);
  };

  const openView = (organization: Organization) => {
    setSelectedOrganization(organization);
    setIsViewOpen(true);
  };

  const handleEdit = (item: Organization) => {
    if (!canManageOrganizations) return;
    setFormData({
      name: item.name,
      code: item.code || "",
      legalName: item.legalName || "",
      industry: item.industry || "",
      registrationNumber: item.registrationNumber || "",
      taxId: item.taxId || "",
      website: item.website || "",
      contactEmail: item.contactEmail || "",
      contactPhone: item.contactPhone || "",
      primaryContactName: item.primaryContactName || "",
      primaryContactEmail: item.primaryContactEmail || "",
      primaryContactPhone: item.primaryContactPhone || "",
      addressLine1: item.addressLine1 || "",
      addressLine2: item.addressLine2 || "",
      city: item.city || "",
      state: item.state || "",
      country: item.country || "",
      postalCode: item.postalCode || "",
      notes: item.notes || "",
      logoUrl: item.logoUrl || "",
      faviconUrl: item.faviconUrl || "",
      brandColor: item.brandColor || "#0f172a",
      billingCycle: item.billingCycle || "",
      subscriptionStatus: item.subscriptionStatus || "DRAFT",
      hasFreeTrial: item.hasFreeTrial,
      trialStartDate: normalizeDateInput(item.trialStartDate),
      trialEndDate: normalizeDateInput(item.trialEndDate),
      subscriptionStartDate: normalizeDateInput(item.subscriptionStartDate),
      subscriptionEndDate: normalizeDateInput(item.subscriptionEndDate),
      reminderEnabled: item.reminderEnabled,
      reminderLeadDays: String(item.reminderLeadDays || 60),
      isActive: item.isActive,
      superadminUserIds: getOrganizationSuperadminIds(superadminUsers, item.id),
    });
    setSelectedOrganization(item);
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!canManageOrganizations) return;
    if (!formData.name.trim()) {
      toast.error("Organization name is required");
      return;
    }
    if (formData.hasFreeTrial && formData.trialStartDate && formData.trialEndDate && formData.trialStartDate > formData.trialEndDate) {
      toast.error("Trial end date must be on or after the trial start date");
      return;
    }
    if (formData.subscriptionStartDate && formData.subscriptionEndDate && formData.subscriptionStartDate > formData.subscriptionEndDate) {
      toast.error("Subscription end date must be on or after the subscription start date");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim() || null,
        legalName: formData.legalName.trim() || null,
        industry: formData.industry.trim() || null,
        registrationNumber: formData.registrationNumber.trim() || null,
        taxId: formData.taxId.trim() || null,
        website: formData.website.trim() || null,
        contactEmail: formData.contactEmail.trim() || null,
        contactPhone: formData.contactPhone.trim() || null,
        primaryContactName: formData.primaryContactName.trim() || null,
        primaryContactEmail: formData.primaryContactEmail.trim() || null,
        primaryContactPhone: formData.primaryContactPhone.trim() || null,
        addressLine1: formData.addressLine1.trim() || null,
        addressLine2: formData.addressLine2.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        country: formData.country.trim() || null,
        postalCode: formData.postalCode.trim() || null,
        notes: formData.notes.trim() || null,
        logoUrl: formData.logoUrl || null,
        faviconUrl: formData.faviconUrl || null,
        brandColor: formData.brandColor || "#0f172a",
        billingCycle: formData.billingCycle || null,
        subscriptionStatus: formData.subscriptionStatus,
        hasFreeTrial: formData.hasFreeTrial,
        trialStartDate: formData.hasFreeTrial ? formData.trialStartDate || null : null,
        trialEndDate: formData.hasFreeTrial ? formData.trialEndDate || null : null,
        subscriptionStartDate: formData.subscriptionStartDate || null,
        subscriptionEndDate: formData.subscriptionEndDate || null,
        reminderEnabled: formData.reminderEnabled,
        reminderLeadDays: Number(formData.reminderLeadDays || 60),
        isActive: formData.isActive,
        superadminUserIds: formData.superadminUserIds,
      };
      if (isEditing && selectedOrganization) {
        await updateOrganization(selectedOrganization.id, payload);
        toast.success("Organization updated");
      } else {
        await createOrganization(payload);
        setSearchQuery("");
        toast.success("Organization created");
      }
      setIsFormOpen(false);
      await fetchOrganizations();
      await fetchSuperadmins();
      await refreshBranding(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save organization"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!canManageOrganizations) return;
    if (!selectedOrganization) return;
    setSaving(true);
    try {
      const deletedId = selectedOrganization.id;
      await deleteOrganization(deletedId);
      setOrganizations((current) => current.filter((organization) => organization.id !== deletedId));
      toast.success("Organization deleted");
      setIsDeleteOpen(false);
      await fetchOrganizations();
    } catch (error: unknown) {
      if (getErrorStatus(error) === 409) {
        toast.error(getErrorMessage(error, "Organization cannot be deleted"));
      } else {
        toast.error(getErrorMessage(error, "Failed to delete organization"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <BackButton to="/root/dashboard" label="Back to Governance Dashboard" />
      <PageHeader
        title="Organization Master"
        subtitle="Manage organization profiles, subscription controls, branding, and governance settings"
        actions={
          canManageOrganizations ? (
            <Button onClick={handleAdd} className="gap-2 gradient-primary text-primary-foreground shadow-glow w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Organization
            </Button>
          ) : undefined
        }
      />

      <DataTableShell
        title={
          <span className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Organizations ({displayOrganizations.length})
          </span>
        }
        toolbar={
          <Toolbar
            right={
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search-organizations"
                  name="searchOrganizations"
                  placeholder="Search organizations..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-10 pl-9"
                />
              </div>
            }
          />
        }
      >
        {loading ? (
          <TableSkeleton />
        ) : loadError ? (
          <EmptyState
            title="Unable to load organizations"
            description={loadError}
            actionLabel="Retry"
            onAction={() => {
              void fetchOrganizations();
            }}
          />
        ) : displayOrganizations.length === 0 ? (
          <EmptyState
            title={organizations.length === 0 ? "No organizations found" : "No matching organizations"}
            description={
              organizations.length === 0
                ? "Create your first organization with profile, subscription, reminder, and branding settings."
                : "Try a different search term or clear the current search to view all organization cards."
            }
            actionLabel={organizations.length === 0 && canManageOrganizations ? "Add Organization" : undefined}
            onAction={organizations.length === 0 && canManageOrganizations ? handleAdd : undefined}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {displayOrganizations.map((item) => (
              <Card key={item.id} className="border-border/70 shadow-card">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-card/80 p-2 dark:bg-card/60">
                      {item.logoUrl ? (
                        <img src={item.logoUrl} alt={`${item.name} logo`} className="h-full w-full object-contain" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <p className="truncate text-base font-semibold">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.code || item.legalName || "-"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge variant={item.isActive ? "active" : "inactive"}>
                          {item.isActive ? "Active" : "Inactive"}
                        </StatusBadge>
                        <StatusBadge variant={getSubscriptionVariant(item.subscriptionStatus)}>
                          {item.subscriptionStatus.replace(/_/g, " ")}
                        </StatusBadge>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-border/60 p-2">
                      <p className="text-muted-foreground">Plants</p>
                      <p className="font-semibold text-sm">{item.plantsCount ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-border/60 p-2">
                      <p className="text-muted-foreground">Users</p>
                      <p className="font-semibold text-sm">{item.usersCount ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-border/60 p-2">
                      <p className="text-muted-foreground">Billing</p>
                      <p className="text-sm font-semibold">{getBillingCycleLabel(item.billingCycle)}</p>
                    </div>
                    <div className="rounded-md border border-border/60 p-2">
                      <p className="text-muted-foreground">Reminder</p>
                      <p className="text-sm font-semibold">{item.reminderEnabled ? `${item.reminderLeadDays} days` : "Off"}</p>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between gap-3">
                      <span>Primary Contact</span>
                      <span className="truncate text-right text-foreground">{item.primaryContactEmail || item.contactEmail || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Renewal / Trial End</span>
                      <span className="text-right text-foreground">{formatDate(item.subscriptionEndDate || item.trialEndDate)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <span>Created {new Date(item.createdAt).toLocaleDateString()}</span>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openView(item)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canManageOrganizations && (
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {canManageOrganizations && (
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelectedOrganization(item); setIsDeleteOpen(true); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DataTableShell>

      {canManageOrganizations && (
        <FormDialog
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          title={isEditing ? "Edit Organization" : "Add Organization"}
          description="Capture a structured organization profile with subscription lifecycle, reminder controls, and branding."
          onSubmit={handleSubmit}
          submitLabel={saving ? "Saving..." : isEditing ? "Update" : "Create"}
          size="xl"
        >
          <FormGrid>
            <div className="sm:col-span-2 space-y-4 rounded-xl border border-border/70 p-4">
              <SectionTitle title="Identity" description="Basic organization identity and compliance details." />
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Organization Name" value={formData.name} onChange={(value) => setFormData({ ...formData, name: value })} required />
                <InputField label="Code" value={formData.code} onChange={(value) => setFormData({ ...formData, code: value.toUpperCase() })} />
                <InputField label="Legal Name" value={formData.legalName} onChange={(value) => setFormData({ ...formData, legalName: value })} />
                <InputField label="Industry" value={formData.industry} onChange={(value) => setFormData({ ...formData, industry: value })} />
                <InputField label="Registration Number" value={formData.registrationNumber} onChange={(value) => setFormData({ ...formData, registrationNumber: value })} />
                <InputField label="Tax ID" value={formData.taxId} onChange={(value) => setFormData({ ...formData, taxId: value })} />
              </div>
            </div>

            <div className="sm:col-span-2 space-y-4 rounded-xl border border-border/70 p-4">
              <SectionTitle title="Contacts" description="Operational and primary contact details used for administration and reminders." />
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="General Contact Email" type="email" value={formData.contactEmail} onChange={(value) => setFormData({ ...formData, contactEmail: value })} />
                <InputField label="General Contact Phone" type="tel" value={formData.contactPhone} onChange={(value) => setFormData({ ...formData, contactPhone: value })} />
                <InputField label="Primary Contact Name" value={formData.primaryContactName} onChange={(value) => setFormData({ ...formData, primaryContactName: value })} />
                <InputField label="Primary Contact Email" type="email" value={formData.primaryContactEmail} onChange={(value) => setFormData({ ...formData, primaryContactEmail: value })} />
                <InputField label="Primary Contact Phone" type="tel" value={formData.primaryContactPhone} onChange={(value) => setFormData({ ...formData, primaryContactPhone: value })} />
                <InputField label="Website" type="url" value={formData.website} onChange={(value) => setFormData({ ...formData, website: value })} placeholder="https://example.com" />
              </div>
            </div>

            <div className="sm:col-span-2 space-y-4 rounded-xl border border-border/70 p-4">
              <SectionTitle title="Organization Superadmins" description="Assign one or more scoped superadmins to this organization. Assigned users will see only this organization context after login." />
              {superadminsLoading ? (
                <div className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">Loading superadmin users...</div>
              ) : sortedSuperadminUsers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                  No superadmin users found. Create superadmin users from the root user management page first.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {sortedSuperadminUsers.map((superadmin) => {
                    const checked = formData.superadminUserIds.includes(superadmin.id);
                    const currentOrganizationLabel = superadmin.organizationName || "Unassigned organization";
                    return (
                      <label key={superadmin.id} className="flex items-start gap-3 rounded-xl border border-border/70 p-3">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(nextChecked) =>
                            setFormData((prev) => ({
                              ...prev,
                              superadminUserIds: nextChecked === true
                                ? Array.from(new Set([...prev.superadminUserIds, superadmin.id]))
                                : prev.superadminUserIds.filter((id) => id !== superadmin.id),
                            }))
                          }
                          className="mt-0.5"
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium">{superadmin.fullName}</p>
                            <StatusBadge variant={superadmin.isActive ? "active" : "inactive"} showDot={false}>
                              {superadmin.isActive ? "Active" : "Inactive"}
                            </StatusBadge>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{superadmin.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Current organization: <span className="text-foreground">{currentOrganizationLabel}</span>
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="sm:col-span-2 space-y-4 rounded-xl border border-border/70 p-4">
              <SectionTitle title="Address & Notes" description="Store location and additional context in a structured, auditable form." />
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Address Line 1" value={formData.addressLine1} onChange={(value) => setFormData({ ...formData, addressLine1: value })} />
                <InputField label="Address Line 2" value={formData.addressLine2} onChange={(value) => setFormData({ ...formData, addressLine2: value })} />
                <InputField label="City" value={formData.city} onChange={(value) => setFormData({ ...formData, city: value })} />
                <InputField label="State / Region" value={formData.state} onChange={(value) => setFormData({ ...formData, state: value })} />
                <InputField label="Country" value={formData.country} onChange={(value) => setFormData({ ...formData, country: value })} />
                <InputField label="Postal Code" value={formData.postalCode} onChange={(value) => setFormData({ ...formData, postalCode: value })} />
              </div>
              <TextareaField label="Internal Notes" value={formData.notes} onChange={(value) => setFormData({ ...formData, notes: value })} rows={4} />
            </div>

            <div className="sm:col-span-2 space-y-4 rounded-xl border border-border/70 p-4">
              <SectionTitle title="Subscription & Trial" description="Track billing cycle, free trial windows, and proactive renewal reminders for super admins." />
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Billing Cycle"
                  value={formData.billingCycle}
                  onChange={(value) => setFormData({ ...formData, billingCycle: value as OrganizationFormState["billingCycle"] })}
                  options={billingCycleOptions}
                  placeholder="Select billing cycle"
                />
                <SelectField
                  label="Subscription Status"
                  value={formData.subscriptionStatus}
                  onChange={(value) => setFormData({ ...formData, subscriptionStatus: value as OrganizationFormState["subscriptionStatus"] })}
                  options={subscriptionStatusOptions}
                />
                <InputField
                  label="Subscription Start Date"
                  type="date"
                  value={formData.subscriptionStartDate}
                  onChange={(value) => setFormData({ ...formData, subscriptionStartDate: value })}
                />
                <InputField
                  label="Subscription End Date"
                  type="date"
                  value={formData.subscriptionEndDate}
                  onChange={(value) => setFormData({ ...formData, subscriptionEndDate: value })}
                />
                <SelectField
                  label="Reminder Lead Time"
                  value={formData.reminderLeadDays}
                  onChange={(value) => setFormData({ ...formData, reminderLeadDays: value })}
                  options={reminderLeadOptions}
                  disabled={!formData.reminderEnabled}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SwitchField
                  label="Free Trial Enabled"
                  description="Allow a free trial window before the paid subscription becomes active."
                  checked={formData.hasFreeTrial}
                  onChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      hasFreeTrial: checked,
                      subscriptionStatus: checked && prev.subscriptionStatus === "DRAFT" ? "TRIAL" : prev.subscriptionStatus,
                    }))
                  }
                />
                <SwitchField
                  label="Reminder Notifications"
                  description="Notify organization super admins and admins before trial or subscription expiry."
                  checked={formData.reminderEnabled}
                  onChange={(checked) => setFormData({ ...formData, reminderEnabled: checked })}
                />
              </div>
              {formData.hasFreeTrial && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField label="Trial Start Date" type="date" value={formData.trialStartDate} onChange={(value) => setFormData({ ...formData, trialStartDate: value })} />
                  <InputField label="Trial End Date" type="date" value={formData.trialEndDate} onChange={(value) => setFormData({ ...formData, trialEndDate: value })} />
                </div>
              )}
            </div>

            <div className="sm:col-span-2 space-y-4 rounded-xl border border-border/70 p-4">
              <SectionTitle title="Branding & Status" description="Keep organization branding secure and aligned with browser identity, favicon, and operational status." />
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Organization Status"
                  value={formData.isActive ? "Active" : "Inactive"}
                  onChange={(value) => setFormData({ ...formData, isActive: value === "Active" })}
                  options={[
                    { value: "Active", label: "Active" },
                    { value: "Inactive", label: "Inactive" },
                  ]}
                />
                <div className="space-y-2">
                  <label htmlFor="organization-brand-color" className="text-sm font-medium text-foreground">Brand Color</label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="organization-brand-color"
                      name="organizationBrandColor"
                      type="color"
                      value={formData.brandColor}
                      onChange={(event) => setFormData({ ...formData, brandColor: event.target.value })}
                      className="h-10 w-16 p-1"
                    />
                    <Input
                      id="organization-brand-color-text"
                      name="organizationBrandColorText"
                      value={formData.brandColor}
                      onChange={(event) => setFormData({ ...formData, brandColor: event.target.value })}
                      placeholder="#0f172a"
                      className="font-mono"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Used for app title theme color, installed PWA branding, and mobile shortcut styling.</p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="organization-logo-upload" className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Upload className="h-4 w-4 text-primary" />
                    Organization Logo
                  </label>
                  <Input
                    id="organization-logo-upload"
                    name="organizationLogoUpload"
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleLogoUpload(event.target.files?.[0] || null)}
                  />
                  {formData.logoUrl ? (
                    <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
                      <div className="h-12 w-12 overflow-hidden rounded-md border border-border/60 bg-card/80 p-1 dark:bg-card/60">
                        <img src={formData.logoUrl} alt="Organization logo preview" className="h-full w-full object-contain" />
                      </div>
                      <Button variant="ghost" size="sm" type="button" onClick={() => setFormData({ ...formData, logoUrl: "" })}>
                        Remove logo
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Upload a logo image (max 2MB)</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label htmlFor="organization-favicon-upload" className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Upload className="h-4 w-4 text-primary" />
                    Browser Favicon
                  </label>
                  <Input
                    id="organization-favicon-upload"
                    name="organizationFaviconUpload"
                    type="file"
                    accept="image/*,.ico"
                    onChange={(event) => void handleFaviconUpload(event.target.files?.[0] || null)}
                  />
                  {formData.faviconUrl ? (
                    <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-card/80 p-1 dark:bg-card/60">
                        <img src={formData.faviconUrl} alt="Organization favicon preview" className="h-8 w-8 object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">Browser tab branding</p>
                        <p className="text-xs text-muted-foreground">Plant users will see {formData.name.trim() || "Organization"} CMMS in the browser tab.</p>
                      </div>
                      <Button variant="ghost" size="sm" type="button" onClick={() => setFormData({ ...formData, faviconUrl: "" })}>
                        Remove favicon
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Upload a favicon image (max 1MB). Used on the browser tab for organization users.</p>
                  )}
                </div>
              </div>
            </div>
          </FormGrid>
        </FormDialog>
      )}

      <ViewDialog
        open={isViewOpen}
        onOpenChange={setIsViewOpen}
        title={selectedOrganization?.name || ""}
        subtitle={selectedOrganization?.code || "-"}
        contentClassName="sm:max-w-[860px]"
      >
        {selectedOrganization && (
          <div className="space-y-6">
            <div className="rounded-md border border-border/60 p-4">
              {selectedOrganization.logoUrl ? (
                <div className="flex justify-center">
                  <div className="h-24 w-24 rounded-md border border-border/60 bg-card/80 p-2 overflow-hidden dark:bg-card/60">
                    <img src={selectedOrganization.logoUrl} alt={`${selectedOrganization.name} logo`} className="h-full w-full object-contain" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="h-4 w-4" />
                  No logo uploaded
                </div>
              )}
            </div>

            <DetailSection title="Organization Profile">
              <DetailRow label="Name" value={selectedOrganization.name} />
              <DetailRow label="Code" value={selectedOrganization.code || "-"} />
              <DetailRow label="Legal Name" value={selectedOrganization.legalName || "-"} />
              <DetailRow label="Industry" value={selectedOrganization.industry || "-"} />
              <DetailRow label="Registration Number" value={selectedOrganization.registrationNumber || "-"} />
              <DetailRow label="Tax ID" value={selectedOrganization.taxId || "-"} />
              <DetailRow label="Plants" value={String(selectedOrganization.plantsCount ?? 0)} />
              <DetailRow label="Users" value={String(selectedOrganization.usersCount ?? 0)} />
              <DetailRow label="Admins" value={String(selectedOrganization.adminsCount ?? 0)} />
              <DetailRow label="Superadmins" value={String(selectedOrganization.superadminsCount ?? 0)} />
              <DetailRow
                label="Scoped Superadmin Users"
                value={
                  selectedOrganizationSuperadmins.length > 0
                    ? formatScopedSuperadmins(selectedOrganizationSuperadmins)
                    : "No scoped superadmins assigned"
                }
                className="sm:col-span-2"
              />
              <DetailRow
                label="Status"
                value={
                  <StatusBadge variant={selectedOrganization.isActive ? "active" : "inactive"}>
                    {selectedOrganization.isActive ? "Active" : "Inactive"}
                  </StatusBadge>
                }
              />
              <DetailRow label="Created" value={new Date(selectedOrganization.createdAt).toLocaleDateString()} />
              <DetailRow label="Browser Tab Title" value={`${selectedOrganization.name} CMMS`} />
            </DetailSection>

            <DetailSection title="Contacts">
              <DetailRow label="General Email" value={selectedOrganization.contactEmail || "-"} />
              <DetailRow label="General Phone" value={selectedOrganization.contactPhone || "-"} />
              <DetailRow label="Primary Contact" value={selectedOrganization.primaryContactName || "-"} />
              <DetailRow label="Primary Contact Email" value={selectedOrganization.primaryContactEmail || "-"} />
              <DetailRow label="Primary Contact Phone" value={selectedOrganization.primaryContactPhone || "-"} />
              <DetailRow label="Website" value={selectedOrganization.website || "-"} />
            </DetailSection>

            <DetailSection title="Assigned Superadmins">
              <DetailRow
                label="Superadmin Users"
                value={
                  viewSuperadminsLoading
                    ? "Loading scoped superadmins..."
                    : selectedOrganizationSuperadmins.length > 0
                    ? selectedOrganizationSuperadmins.map((userItem) => `${userItem.userCode || userItem.fullName} - ${userItem.email}`).join(", ")
                    : "No scoped superadmins assigned"
                }
                className="sm:col-span-2"
              />
            </DetailSection>

            <DetailSection title="Branding">
              <DetailRow label="Brand Color" value={selectedOrganization.brandColor || "#0f172a"} />
              <DetailRow
                label="Favicon"
                value={
                  selectedOrganization.faviconUrl ? (
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-card/80 p-1 dark:bg-card/60">
                        <img src={selectedOrganization.faviconUrl} alt={`${selectedOrganization.name} favicon`} className="h-6 w-6 object-contain" />
                      </div>
                      <span>Configured</span>
                    </div>
                  ) : "Not uploaded"
                }
              />
            </DetailSection>

            <DetailSection title="Subscription">
              <DetailRow label="Billing Cycle" value={getBillingCycleLabel(selectedOrganization.billingCycle)} />
              <DetailRow
                label="Subscription Status"
                value={
                  <StatusBadge variant={getSubscriptionVariant(selectedOrganization.subscriptionStatus)}>
                    {selectedOrganization.subscriptionStatus.replace(/_/g, " ")}
                  </StatusBadge>
                }
              />
              <DetailRow label="Free Trial" value={selectedOrganization.hasFreeTrial ? "Enabled" : "Disabled"} />
              <DetailRow label="Reminder Lead" value={selectedOrganization.reminderEnabled ? `${selectedOrganization.reminderLeadDays} day(s)` : "Disabled"} />
              <DetailRow label="Trial Start" value={formatDate(selectedOrganization.trialStartDate)} />
              <DetailRow label="Trial End" value={formatDate(selectedOrganization.trialEndDate)} />
              <DetailRow label="Subscription Start" value={formatDate(selectedOrganization.subscriptionStartDate)} />
              <DetailRow label="Subscription End" value={formatDate(selectedOrganization.subscriptionEndDate)} />
              <DetailRow label="Last Reminder Sent" value={formatDateTime(selectedOrganization.lastReminderSentAt)} />
            </DetailSection>

            <DetailSection title="Address">
              <DetailRow label="Address" value={buildAddress(selectedOrganization) || "-"} className="sm:col-span-2" />
            </DetailSection>

            {selectedOrganization.notes && (
              <DetailSection title="Internal Notes">
                <DetailRow label="Notes" value={selectedOrganization.notes} className="sm:col-span-2" />
              </DetailSection>
            )}
          </div>
        )}
      </ViewDialog>

      {canManageOrganizations && (
        <DeleteConfirmDialog
          open={isDeleteOpen}
          onOpenChange={setIsDeleteOpen}
          title="Delete Organization"
          description="This permanently removes the organization from the database after its dependent records are cleared. Delete related plants or other linked records first if the system blocks the action."
          itemName={selectedOrganization?.name}
          onConfirm={confirmDelete}
          isLoading={saving}
        />
      )}
    </PageShell>
  );
}
