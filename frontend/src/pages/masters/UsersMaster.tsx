import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Search, Edit, Trash2, Users, Eye, EyeOff, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import BackButton from "@/components/masters/BackButton";
import { FormDialog } from "@/components/shared/FormDialog";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { ProfileImageField } from "@/components/shared/ProfileImageField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
  updateProfile,
  updateUserRoles,
  type UserProfile,
} from "@/api/users";
import { listDepartments, type Department } from "@/api/departments";
import { listRoleCatalog } from "@/api/roles";
import { useAuthStore, isRootAdmin, isSuperAdmin } from "@/store/auth.store";
import { useMastersOptions } from "@/hooks/useMastersOptions";
import { usePermissions } from "@/hooks/usePermissions";
import { getPermissionsUpdatedEventName } from "@/store/permissions.store";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Toolbar } from "@/components/layout/Toolbar";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { FormGrid } from "@/components/layout/FormGrid";
import { EmptyState } from "@/components/app-shell/EmptyState";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import {
  downloadEnterpriseExcelTemplate,
  findHeaderRowFromRows,
  isCsvHelperRow,
  parseExcelXmlRows,
  normalizeHeaderName,
  parseCsvRows,
} from "@/lib/import-template";
import { parseFileContent } from "@/lib/xlsx-utils";

type AppRole = string;

interface UserRow extends UserProfile {
  roles: AppRole[];
}

interface RoleOption {
  value: AppRole;
  label: string;
}

const PASSWORD_POLICY_MESSAGE = "Password must be 12-128 characters and include uppercase, lowercase, number, and special character.";

function isStrongPassword(password: string) {
  if (password.length < 12 || password.length > 128) {
    return false;
  }

  if (/\s/.test(password)) {
    return false;
  }

  return /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

function getValidationIssueMessage(error: unknown) {
  if (!error || typeof error !== "object") return null;

  const payload = (error as { payload?: unknown }).payload;
  if (!payload || typeof payload !== "object") return null;

  const details = (payload as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;

  const flattened = (details as { flattened?: unknown }).flattened;
  if (flattened && typeof flattened === "object") {
    const fieldErrors = (flattened as { fieldErrors?: unknown }).fieldErrors;
    if (fieldErrors && typeof fieldErrors === "object") {
      for (const messages of Object.values(fieldErrors as Record<string, unknown>)) {
        if (Array.isArray(messages)) {
          const first = messages.find((message) => typeof message === "string" && message.trim().length > 0);
          if (typeof first === "string") {
            return first;
          }
        }
      }
    }
  }

  const issues = (details as { issues?: unknown }).issues;
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      if (!issue || typeof issue !== "object") continue;
      const message = (issue as { message?: unknown }).message;
      if (typeof message === "string" && message.trim().length > 0) {
        return message;
      }
    }
  }

  return null;
}

function normalizeRoleKey(role: string | null | undefined) {
  if (!role) return "USER";
  const normalized = role.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (normalized === "SUPER_ADMIN" || normalized === "SUPERADMIN") return "SUPERADMIN";
  if (normalized === "ROOTADMIN" || normalized === "ROOT_ADMIN") return "ROOT_ADMIN";
  if (normalized === "PLANT_ADMIN" || normalized === "PLANTADMIN" || normalized === "ORG_ADMIN" || normalized === "ORGANIZATION_ADMIN") {
    return "ADMIN";
  }
  if (normalized === "SECURITY_USER") return "SECURITY";
  return normalized;
}

const BULK_UPLOAD_BLOCKED_ROLE_KEYS = new Set(["SUPERADMIN", "ROOT_ADMIN", "ADMIN"]);

function isBulkUploadBlockedRole(role: string) {
  return BULK_UPLOAD_BLOCKED_ROLE_KEYS.has(normalizeRoleKey(role));
}

function getErrorMessage(error: unknown, fallback: string) {
  const validationIssue = getValidationIssueMessage(error);
  if (validationIssue) {
    return validationIssue;
  }

  if (typeof error === "object" && error && "message" in error && typeof error.message === "string" && error.message) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const emptyForm = {
  userCode: "",
  fullName: "",
  email: "",
  password: "",
  phone: "",
  profileImageUrl: "",
  department: "",
  plantId: "",
  role: "" as AppRole | "",
};

export default function UsersMaster() {
  const [searchParams] = useSearchParams();
  const { user: currentUser } = useAuthStore();
  const currentIsSuperAdmin = isSuperAdmin(currentUser);
  const currentIsRootAdmin = isRootAdmin(currentUser);
  const { allowedRoleTargetsForCreate, allowedRoleTargetsForEdit, can, rbacVersion } = usePermissions();
  const canCreateUsers = can("USERS", "create");
  const canUpdateUsers = can("USERS", "update");
  const canDeleteUsers = can("USERS", "delete");
  const canSelectPlant = currentIsSuperAdmin || currentIsRootAdmin;
  const defaultPlantId = currentUser?.plantId || "";
  const { plantsOptions, fetchPlants, fetchDepartments: syncDepartmentsOptions, invalidateOptions } = useMastersOptions();

  const [importSummary, setImportSummary] = useState<{
    rows: any[];
    failures: string[];
    fileName: string;
  } | null>(null);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);

  const isSuperAdminRole = (role: string) => role.toUpperCase() === "SUPERADMIN" || role.toUpperCase() === "SUPER_ADMIN";
  const isRootAdminRole = (role: string) => role.toUpperCase() === "ROOT_ADMIN";
  const isSystemRoleWithoutPlant = useCallback((role: string) => isSuperAdminRole(role) || isRootAdminRole(role), []);
  const toRoleLabel = (role: string) =>
    role
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (value) => value.toUpperCase());

  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allRoles, setAllRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm, plantId: defaultPlantId });
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkPromptHandled, setBulkPromptHandled] = useState(false);
  const bulkUploadInputRef = useRef<HTMLInputElement | null>(null);
  const visibleRoleTargetKeys = useMemo(
    () => Array.from(new Set([...allowedRoleTargetsForCreate, ...allowedRoleTargetsForEdit].map((role) => normalizeRoleKey(role)))),
    [allowedRoleTargetsForCreate, allowedRoleTargetsForEdit],
  );
  const roleOptions = useMemo(
    () =>
      allRoles.filter((role) => {
        const normalized = normalizeRoleKey(role.value);
        if (currentIsRootAdmin) return true;
        const allowedTargets = selectedUser ? allowedRoleTargetsForEdit : allowedRoleTargetsForCreate;
        return allowedTargets.includes(normalized);
      }),
    [allRoles, allowedRoleTargetsForCreate, allowedRoleTargetsForEdit, currentIsRootAdmin, selectedUser],
  );
  const allowedBulkRoleOptions = useMemo(
    () =>
      allRoles.filter((role) => {
        if (isBulkUploadBlockedRole(role.value)) return false;
        if (currentIsRootAdmin) return true;
        return allowedRoleTargetsForCreate.includes(normalizeRoleKey(role.value));
      }),
    [allRoles, allowedRoleTargetsForCreate, currentIsRootAdmin],
  );
  const filterRoleOptions = useMemo(
    () =>
      allRoles.filter((role) => {
        if (currentIsRootAdmin) return true;
        return visibleRoleTargetKeys.includes(normalizeRoleKey(role.value));
      }),
    [allRoles, currentIsRootAdmin, visibleRoleTargetKeys],
  );

  const fetchUsersData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listUsers({
        page: 1,
        limit: 100,
        search: searchQuery || undefined,
        plantId: canSelectPlant ? undefined : defaultPlantId || undefined,
      });
      setUsers(
        response.data.map((item) => ({
          ...item,
          roles: (item.roles || []) as AppRole[],
        })),
      );
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load users"));
    } finally {
      setLoading(false);
    }
  }, [canSelectPlant, defaultPlantId, searchQuery]);

  const resolveDepartmentPlantId = useCallback(
    (plantId?: string | null) => plantId ?? (canSelectPlant ? undefined : defaultPlantId || undefined),
    [canSelectPlant, defaultPlantId],
  );

  const fetchDepartmentsData = useCallback(async (plantId?: string | null, force = false) => {
    const resolvedPlantId = resolveDepartmentPlantId(plantId);
    setDepartmentsLoading(true);
    try {
      await syncDepartmentsOptions(resolvedPlantId, force);
      const response = await listDepartments({
        page: 1,
        limit: 100,
        plantId: resolvedPlantId,
      });
      setDepartments(response.data);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load departments"));
    } finally {
      setDepartmentsLoading(false);
    }
  }, [resolveDepartmentPlantId, syncDepartmentsOptions]);

  useEffect(() => {
    fetchUsersData();
  }, [fetchUsersData]);

  const fetchRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const response = await listRoleCatalog();
      const options = response.data.map((role) => ({
        value: role.name,
        label: role.description?.trim() ? role.description : toRoleLabel(role.name),
      }));
      setAllRoles(options);
      return options;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load roles"));
      return [] as RoleOption[];
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
    fetchPlants(true);
  }, [fetchPlants, fetchRoles]);

  useEffect(() => {
    if (rbacVersion === null) return;
    void fetchRoles();
    void fetchUsersData();
    void fetchDepartmentsData(canSelectPlant ? undefined : defaultPlantId, true);
  }, [canSelectPlant, defaultPlantId, fetchDepartmentsData, fetchRoles, fetchUsersData, rbacVersion]);

  useEffect(() => {
    const eventName = getPermissionsUpdatedEventName();
    const handlePermissionsUpdated = () => {
      void fetchRoles();
      void fetchUsersData();
      void fetchDepartmentsData(canSelectPlant ? undefined : defaultPlantId, true);
    };

    window.addEventListener(eventName, handlePermissionsUpdated);
    return () => {
      window.removeEventListener(eventName, handlePermissionsUpdated);
    };
  }, [canSelectPlant, defaultPlantId, fetchDepartmentsData, fetchRoles, fetchUsersData]);

  useEffect(() => {
    fetchDepartmentsData(canSelectPlant ? undefined : defaultPlantId, true);
  }, [canSelectPlant, defaultPlantId, fetchDepartmentsData]);

  useEffect(() => {
    if (roleFilter !== "all" && !filterRoleOptions.some((role) => role.value === roleFilter)) {
      setRoleFilter("all");
    }
  }, [filterRoleOptions, roleFilter]);

  useEffect(() => {
    if (!formData.role || roleOptions.some((role) => role.value === formData.role)) return;
    setFormData((prev) => ({ ...prev, role: "" }));
  }, [roleOptions, formData.role]);

  useEffect(() => {
    if (isSystemRoleWithoutPlant(formData.role) && formData.plantId) {
      setFormData((prev) => ({ ...prev, plantId: "", department: "" }));
    }
  }, [formData.plantId, formData.role, isSystemRoleWithoutPlant]);

  useEffect(() => {
    if (!isFormOpen) return;
    fetchDepartmentsData(formData.plantId || undefined, true);
  }, [fetchDepartmentsData, formData.plantId, isFormOpen]);

  useEffect(() => {
    if (bulkPromptHandled || !canCreateUsers) return;
    if (searchParams.get("bulk") !== "1") return;
    setBulkPromptHandled(true);
    window.requestAnimationFrame(() => {
      bulkUploadInputRef.current?.click();
    });
  }, [bulkPromptHandled, canCreateUsers, searchParams]);

  useEffect(() => {
    const refreshPageData = () => {
      fetchPlants(true);
      fetchUsersData();
      fetchDepartmentsData(isFormOpen ? formData.plantId || undefined : canSelectPlant ? undefined : defaultPlantId, true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshPageData();
      }
    };

    window.addEventListener("focus", refreshPageData);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshPageData);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canSelectPlant, defaultPlantId, fetchDepartmentsData, fetchPlants, fetchUsersData, formData.plantId, isFormOpen]);

  const departmentOptions = useMemo(
    () => {
      const options = departments
        .filter((department) => !formData.plantId || department.plantId === formData.plantId)
        .map((department) => ({ value: department.name, label: `${department.code} - ${department.name}` }));

      if (formData.department && !options.some((department) => department.value === formData.department)) {
        options.unshift({
          value: formData.department,
          label: `${formData.department} (saved value)`,
        });
      }

      return options;
    },
    [departments, formData.department, formData.plantId],
  );

  const filteredUsers = useMemo(
    () =>
      users.filter((item) => {
        const hasSuperAdminRole = item.roles.some((role) => isSuperAdminRole(role));
        const hasRootAdminRole = item.roles.some((role) => isRootAdminRole(role));
        if (!currentIsSuperAdmin && !currentIsRootAdmin && (hasSuperAdminRole || hasRootAdminRole)) return false;
        const matchesRole = roleFilter === "all" || item.roles.includes(roleFilter as AppRole);
        return matchesRole;
      }),
    [users, roleFilter, currentIsSuperAdmin, currentIsRootAdmin],
  );

  const canMutateTargetUser = (item: UserRow) => {
    if (currentIsRootAdmin) return true;
    return item.roles.every((role) => allowedRoleTargetsForEdit.includes(normalizeRoleKey(role)));
  };

  const getInitials = (name: string) => name.split(" ").map((part) => part[0]).join("").toUpperCase();
  const getPlantName = (plantId: string | null) => plantsOptions.find((option) => option.value === plantId)?.label || "-";

  const getRoleVariant = (role: string) => {
    if (role.includes("ADMIN")) return "primary" as const;
    if (normalizeRoleKey(role) === "VENDOR") return "info" as const;
    if (normalizeRoleKey(role) === "VISITOR") return "warning" as const;
    if (role.includes("INCHARGE")) return "info" as const;
    return "default" as const;
  };

  const handleAdd = () => {
    setFormData({ ...emptyForm, plantId: canSelectPlant ? "" : defaultPlantId, role: roleOptions[0]?.value || "" });
    setSelectedUser(null);
    setShowPassword(false);
    fetchDepartmentsData(canSelectPlant ? undefined : defaultPlantId, true);
    setIsFormOpen(true);
  };

  const handleEdit = (row: UserRow) => {
    setFormData({
      userCode: row.userCode,
      fullName: row.fullName,
      email: row.email,
      password: "",
      phone: row.phone || "",
      profileImageUrl: row.profileImageUrl || "",
      department: row.department || "",
      plantId: row.plantId || "",
      role: (row.roles[0] || "") as AppRole | "",
    });
    setSelectedUser(row);
    setShowPassword(false);
    fetchDepartmentsData(row.plantId || undefined, true);
    setIsFormOpen(true);
  };

  const handlePlantChange = async (plantId: string) => {
    setFormData((prev) => ({ ...prev, plantId, department: "" }));
    await fetchDepartmentsData(plantId, true);
  };

  const handleSubmit = async () => {
    if (!formData.userCode.trim() || !formData.fullName.trim() || !formData.email.trim() || !formData.role) {
      toast.error("Please fill all required fields");
      return;
    }

    const selectedRole = formData.role === "SUPER_ADMIN" ? "SUPERADMIN" : formData.role;
    const resolvedPlantId = isSystemRoleWithoutPlant(selectedRole) ? null : canSelectPlant ? formData.plantId || null : defaultPlantId || null;
    if (!isSystemRoleWithoutPlant(selectedRole) && !resolvedPlantId) {
      toast.error("Plant is required");
      return;
    }

    setSubmitting(true);
    try {
      if (selectedUser) {
        await updateProfile(selectedUser.id, {
          userCode: formData.userCode.trim(),
          fullName: formData.fullName.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || null,
          profileImageUrl: formData.profileImageUrl.trim() || null,
          plantId: resolvedPlantId,
          department: formData.department || null,
        });

        await updateUserRoles(selectedUser.userId, { roles: [selectedRole], plantId: resolvedPlantId });

        if (formData.password.trim()) {
          if (!isStrongPassword(formData.password.trim())) {
            toast.error(PASSWORD_POLICY_MESSAGE);
            setSubmitting(false);
            return;
          }
          await updateUser(selectedUser.userId, { password: formData.password.trim() });
        }
        toast.success("User updated successfully");
      } else {
        if (!formData.password || !isStrongPassword(formData.password.trim())) {
          toast.error(PASSWORD_POLICY_MESSAGE);
          setSubmitting(false);
          return;
        }

        await createUser({
          email: formData.email.trim(),
          password: formData.password.trim(),
          userCode: formData.userCode.trim(),
          fullName: formData.fullName.trim(),
          phone: formData.phone.trim() || null,
          profileImageUrl: formData.profileImageUrl.trim() || null,
          plantId: resolvedPlantId,
          department: formData.department || null,
          roles: [selectedRole],
          isActive: true,
        });
        toast.success("User created successfully");
      }

      invalidateOptions("departments");
      setIsFormOpen(false);
      await Promise.all([fetchPlants(true), fetchUsersData(), fetchDepartmentsData(resolvedPlantId, true)]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save user"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkUsersCsv = async (content: string) => {
    if (allowedBulkRoleOptions.length === 0) {
      toast.error("No bulk-uploadable roles are available. Contact your administrator.");
      return;
    }
    const rows = parseExcelXmlRows(content, "user_code") || parseCsvRows(content);
    if (rows.length < 2) {
      toast.error("Upload file must include a header and at least one user row");
      return;
    }
    await processUserRows(rows);
  };

  const processUserRows = async (rows: string[][]) => {
    const headerRow = rows[0] || [];
    const headerIndex = new Map<string, number>();
    headerRow.forEach((header, index) => {
      const normalized = normalizeHeaderName(header);
      if (normalized) headerIndex.set(normalized, index);
    });

    const requiredHeaders: Array<{ label: string; aliases: string[] }> = [
      { label: "user_code", aliases: ["user_code", "code"] },
      { label: "full_name", aliases: ["full_name", "name"] },
      { label: "email", aliases: ["email"] },
      { label: "password", aliases: ["password"] },
    ];

    const missingHeaders = requiredHeaders
      .filter((entry) => !entry.aliases.some((alias) => headerIndex.has(alias)))
      .map((entry) => entry.label);

    if (missingHeaders.length > 0) {
      toast.error(`Missing CSV columns: ${missingHeaders.join(", ")}`);
      return;
    }

    const pickCell = (row: string[], aliases: string[]) => {
      for (const alias of aliases) {
        const cellIndex = headerIndex.get(alias);
        if (cellIndex === undefined) continue;
        const value = row[cellIndex];
        if (typeof value === "string" && value.trim().length > 0) return value.trim();
      }
      return "";
    };

    const roleValueByNormalized = new Map<string, string>();
    allowedBulkRoleOptions.forEach((roleOption) => {
      roleValueByNormalized.set(normalizeRoleKey(roleOption.value), roleOption.value === "SUPER_ADMIN" ? "SUPERADMIN" : roleOption.value);
    });
    const allowedRoleList = Array.from(roleValueByNormalized.values());
    const allowedRoleText = allowedRoleList.join(", ");

    const parseIsActive = (value: string) => {
      if (!value) return true;
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "active"].includes(normalized)) return true;
      if (["false", "0", "no", "inactive"].includes(normalized)) return false;
      return null;
    };

    const plantLookup = new Map<string, string>();
    plantsOptions.forEach((plantOption) => {
      plantLookup.set(normalizeLookupValue(plantOption.value), plantOption.value);
      plantLookup.set(normalizeLookupValue(plantOption.label), plantOption.value);
      const codeToken = plantOption.label.split("-")[0]?.trim();
      if (codeToken) {
        plantLookup.set(normalizeLookupValue(codeToken), plantOption.value);
      }
    });

    const departmentAliasByPlant = new Map<string, Map<string, string>>();
    const resolveDepartmentName = async (plantId: string | null, rawDepartment: string) => {
      const trimmed = rawDepartment.trim();
      if (!trimmed) return null;
      if (!plantId) return trimmed;

      if (!departmentAliasByPlant.has(plantId)) {
        const response = await listDepartments({ page: 1, limit: 500, plantId, includeInactive: false });
        const aliasMap = new Map<string, string>();
        response.data.forEach((department) => {
          aliasMap.set(normalizeLookupValue(department.name), department.name);
          aliasMap.set(normalizeLookupValue(department.code), department.name);
        });
        departmentAliasByPlant.set(plantId, aliasMap);
      }

      const aliases = departmentAliasByPlant.get(plantId)!;
      const key = normalizeLookupValue(trimmed);
      if (aliases.has(key)) {
        return aliases.get(key) || trimmed;
      }
      aliases.set(key, trimmed);
      return trimmed;
    };

    const existingCodeKeys = new Set(users.map((item) => normalizeLookupValue(item.userCode)));
    const existingEmailKeys = new Set(users.map((item) => item.email.trim().toLowerCase()));
    const seenCodes = new Set<string>();
    const seenEmails = new Set<string>();
    const failures: string[] = [];
    let createdCount = 0;

    const importRows = rows
      .map((row, index) => ({ row, csvRowNumber: index + 1 }))
      .slice(1)
      .filter(({ row }) => !isCsvHelperRow(row));

    if (importRows.length === 0) {
      toast.error("CSV must include at least one importable user row");
      return;
    }

    setBulkUploading(true);
    try {
      for (const { row, csvRowNumber } of importRows) {
        if (!row || row.every((value) => value.trim().length === 0)) {
          continue;
        }

        const userCode = pickCell(row, ["user_code", "code"]);
        const fullName = pickCell(row, ["full_name", "name"]);
        const emailRaw = pickCell(row, ["email"]);
        const password = pickCell(row, ["password"]);

        if (!userCode || !fullName || !emailRaw || !password) {
          failures.push(`Row ${csvRowNumber}: user_code, full_name, email, and password are required`);
          continue;
        }

        const normalizedEmail = emailRaw.toLowerCase();
        const userCodeKey = normalizeLookupValue(userCode);
        if (existingCodeKeys.has(userCodeKey)) {
          failures.push(`Row ${csvRowNumber}: user_code already exists (${userCode})`);
          continue;
        }
        if (existingEmailKeys.has(normalizedEmail)) {
          failures.push(`Row ${csvRowNumber}: email already exists (${emailRaw})`);
          continue;
        }
        if (seenCodes.has(userCodeKey)) {
          failures.push(`Row ${csvRowNumber}: duplicate user_code in CSV (${userCode})`);
          continue;
        }
        if (seenEmails.has(normalizedEmail)) {
          failures.push(`Row ${csvRowNumber}: duplicate email in CSV (${emailRaw})`);
          continue;
        }
        seenCodes.add(userCodeKey);
        seenEmails.add(normalizedEmail);

        if (!isStrongPassword(password)) {
          failures.push(`Row ${csvRowNumber}: ${PASSWORD_POLICY_MESSAGE}`);
          continue;
        }

        const roleRaw = pickCell(row, ["role"]) || allowedRoleList[0] || "";
        if (isBulkUploadBlockedRole(roleRaw)) {
          failures.push(`Row ${csvRowNumber}: role '${roleRaw}' is blocked for bulk upload`);
          continue;
        }
        const normalizedRole = normalizeRoleKey(roleRaw);
        const roleValue = roleValueByNormalized.get(normalizedRole);
        if (!roleValue) {
          failures.push(`Row ${csvRowNumber}: role '${roleRaw}' is not allowed. Allowed roles: ${allowedRoleText}`);
          continue;
        }

        const rowPlantValue = pickCell(row, ["plant_id", "plant_code", "plant"]);
        const resolvedPlantId =
          canSelectPlant
            ? (rowPlantValue ? plantLookup.get(normalizeLookupValue(rowPlantValue)) || null : defaultPlantId || null)
            : defaultPlantId || null;

        if (canSelectPlant && rowPlantValue && !resolvedPlantId) {
          failures.push(`Row ${csvRowNumber}: plant '${rowPlantValue}' is not recognized`);
          continue;
        }

        if (!resolvedPlantId) {
          failures.push(`Row ${csvRowNumber}: plant is required for role '${roleValue}'`);
          continue;
        }

        try {
          const departmentRaw = pickCell(row, ["department", "department_name", "department_code"]);
          const departmentName = await resolveDepartmentName(resolvedPlantId, departmentRaw);
          const isActive = parseIsActive(pickCell(row, ["is_active", "active", "status"]));
          if (isActive === null) {
            failures.push(`Row ${csvRowNumber}: is_active must be one of true, false, active, inactive, yes, no`);
            continue;
          }

          await createUser({
            email: normalizedEmail,
            password,
            userCode,
            fullName,
            phone: pickCell(row, ["phone"]) || null,
            profileImageUrl: null,
            plantId: resolvedPlantId,
            department: departmentName,
            roles: [roleValue],
            isActive,
          });
          existingCodeKeys.add(userCodeKey);
          existingEmailKeys.add(normalizedEmail);
          createdCount += 1;
        } catch (error: unknown) {
          failures.push(`Row ${csvRowNumber}: ${getErrorMessage(error, "failed to create user")}`);
        }
      }

      await Promise.all([
        fetchUsersData(),
        fetchDepartmentsData(canSelectPlant ? undefined : defaultPlantId, true),
      ]);
      invalidateOptions("departments");

      if (createdCount > 0) {
        toast.success(`Created ${createdCount} user${createdCount === 1 ? "" : "s"}`);
      }

      if (failures.length > 0) {
        const preview = failures.slice(0, 3).join(" | ");
        const suffix = failures.length > 3 ? ` (+${failures.length - 3} more)` : "";
        toast.error(`User bulk upload completed with ${failures.length} issue(s): ${preview}${suffix}`);
      }
    } finally {
      setBulkUploading(false);
    }
  };

    const handleBulkUsersFileChange = async (file: File | null) => {
    if (!file) return;
    try {
      setBulkUploading(true);
      const rawRows = await parseFileContent(file);
      const rows = findHeaderRowFromRows(rawRows, "user_code");
      if (rows.length < 2) {
        toast.error("Upload file must include a header and at least one user row");
        return;
      }

      // Explicitly skip enterprise template headers: Row 1 is header, Rows 2-6 are helper/metadata. 
      // findHeaderRowFromRows returns [header, ...data].
      // If header is Row 1, index 0 is Header, index 1-5 are helpers, index 6 is Row 7.
      const dataRows = rows.slice(6).filter((row) => row.some(cell => cell.trim().length > 0));
      if (dataRows.length === 0) {
        toast.error("Upload file must include at least one valid user record starting from Row 7");
        return;
      }

      setImportSummary({
        rows: [rows[0], ...dataRows],
        failures: [],
        fileName: file.name,
      });
      setIsImportConfirmOpen(true);
    } catch (error: any) {
      toast.error(getErrorMessage(error, "Failed to read spreadsheet file"));
    } finally {
      setBulkUploading(false);
    }
  };

  const confirmBulkImport = async () => {
    if (!importSummary) return;
    setIsImportConfirmOpen(false);
    await processUserRows(importSummary.rows);
    setImportSummary(null);
  };

  const handleDownloadUsersTemplate = async () => {
    const latestRoles = await fetchRoles();
    const sourceRoles = latestRoles.length > 0 ? latestRoles : allRoles;
    const latestAllowedBulkRoleOptions = sourceRoles.filter((role) => {
      if (isBulkUploadBlockedRole(role.value)) return false;
      if (currentIsRootAdmin) return true;
      return allowedRoleTargetsForCreate.includes(normalizeRoleKey(role.value));
    });
    const sampleRoleValues = latestAllowedBulkRoleOptions.map((role) => (role.value === "SUPER_ADMIN" ? "SUPERADMIN" : role.value));

    const sampleRows = sampleRoleValues.length > 0
      ? sampleRoleValues.map((roleValue, index) => [
          `USR00${index + 1}`,
          `Sample ${roleValue.replace(/_/g, " ")}`,
          `sample.${index + 1}@example.com`,
          "TempPass@123",
          roleValue,
          "PLANT_CODE_OR_ID",
          "Maintenance",
          `+91-90000000${String(index + 1).padStart(2, "0")}`,
          "Active",
        ])
      : [["USR001", "Sample User", "sample.user@example.com", "TempPass@123", "USER", "PLANT_CODE_OR_ID", "Maintenance", "+91-9000000001", "Active"]];

    const plantValues = plantsOptions.map((plant) => plant.label || plant.value).filter(Boolean);
    const departmentValues = departments
      .map((department) => [department.code, department.name].filter(Boolean).join(" - "))
      .filter(Boolean);

    downloadEnterpriseExcelTemplate({
      fileName: "user_bulk_upload_demo.xlsx",
      title: "CMMS User Management Demo Upload Template",
      uploadSheetName: "User Upload",
      columns: [
        { key: "user_code", label: "User code", required: true, example: "USR001", description: "Unique employee or login code.", width: 120 },
        { key: "full_name", label: "Full name", required: true, example: "Sample User", description: "Display name for the user.", width: 180 },
        { key: "email", label: "Email", required: true, example: "sample.user@example.com", format: "Valid unique email address.", width: 220 },
        { key: "password", label: "Temporary password", required: true, example: "TempPass@123", format: PASSWORD_POLICY_MESSAGE, width: 180 },
        { key: "role", label: "Role", required: true, example: sampleRoleValues[0] || "USER", allowedValues: sampleRoleValues, description: "Use one allowed role exactly as listed.", width: 140 },
        { key: "plant", label: "Plant", required: true, example: plantValues[0] || "PLANT_CODE_OR_ID", allowedValues: plantValues, description: "Accepts plant code, name, or id when available.", width: 180 },
        { key: "department", label: "Department", example: departmentValues[0] || "Maintenance", allowedValues: departmentValues, description: "Accepts department code or name.", width: 180 },
        { key: "phone", label: "Phone", example: "+91-9000000001", format: "Optional contact number.", width: 140 },
        { key: "is_active", label: "Status", example: "Active", allowedValues: ["Active", "Inactive"], description: "Defaults to Active when left blank.", width: 120 },
      ],
      rows: sampleRows,
      instructions: [
        "Fill data in the User Upload sheet only.",
        "Required columns are marked with * and highlighted.",
        "Use dropdown values where available. Do not rename database column headers.",
        "Save the workbook after editing the template.",
      ],
      referenceSections: [
        { title: "Allowed roles", values: sampleRoleValues },
        { title: "Plant reference", values: plantValues.length > 0 ? plantValues : ["PLANT_CODE_OR_ID"] },
        { title: "Department reference", values: departmentValues.length > 0 ? departmentValues : ["Maintenance"] },
      ],
    });
    toast.success("User demo workbook downloaded (.xlsx)");
  };

  const confirmDelete = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      await deleteUser(selectedUser.userId);
      toast.success("User deleted successfully");
      setIsDeleteOpen(false);
      await fetchUsersData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete user"));
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      key: "user",
      header: "User",
      render: (item: UserRow) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            {item.profileImageUrl ? <AvatarImage src={item.profileImageUrl} alt={item.fullName} className="object-cover" /> : null}
            <AvatarFallback className="bg-primary/10 text-primary text-xs">{getInitials(item.fullName)}</AvatarFallback>
          </Avatar>
          <div>
            <span className="font-medium block">{item.fullName}</span>
            <span className="text-xs text-muted-foreground">{item.userCode}</span>
          </div>
        </div>
      ),
    },
    { key: "email", header: "Email", render: (item: UserRow) => <span className="text-muted-foreground text-sm">{item.email}</span>, hideOnMobile: true },
    {
      key: "role",
      header: "Role",
      render: (item: UserRow) => (
        <div className="flex flex-wrap gap-1">
          {item.roles.map((role) => (
            <StatusBadge key={role} variant={getRoleVariant(role)} showDot={false}>
              {role.replace(/_/g, " ")}
            </StatusBadge>
          ))}
        </div>
      ),
    },
    { key: "department", header: "Department", render: (item: UserRow) => item.department || "-", hideOnMobile: true },
    { key: "plant", header: "Plant", render: (item: UserRow) => getPlantName(item.plantId), hideOnMobile: true },
    { key: "status", header: "Status", render: (item: UserRow) => <StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge> },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item: UserRow) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedUser(item); setIsViewOpen(true); }}>
            <Eye className="h-4 w-4" />
          </Button>
          {canUpdateUsers && (
            <Button variant="ghost" size="icon" onClick={() => handleEdit(item)} disabled={!canMutateTargetUser(item)}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {canDeleteUsers && (
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelectedUser(item); setIsDeleteOpen(true); }} disabled={!canMutateTargetUser(item)}>
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
        title="User Management"
        subtitle="Manage users, roles, and permissions"
        actions={
          canCreateUsers ? (
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <input
                ref={bulkUploadInputRef}
                type="file"
                accept=".xls,.csv,text/csv,application/vnd.ms-excel,text/xml"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  void handleBulkUsersFileChange(file);
                  event.target.value = "";
                }}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Upload className="h-4 w-4" />
                    {bulkUploading ? "Processing..." : "Bulk Actions"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Data Management</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => bulkUploadInputRef.current?.click()} disabled={bulkUploading}>
                    <Upload className="mr-2 h-4 w-4" />
                    Import Spreadsheet
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleDownloadUsersTemplate()}>
                    <Download className="mr-2 h-4 w-4" />
                    Download Demo Template
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {roleOptions.length > 0 ? (
                <Button onClick={handleAdd} className="gap-2 gradient-primary text-primary-foreground shadow-glow w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  Add User
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <DataTableShell
        title={
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Users ({filteredUsers.length})
          </span>
        }
        toolbar={
          <Toolbar
            right={
              <>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search users..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 pl-9" />
                </div>
                <SelectField
                  label=""
                  value={roleFilter}
                  onChange={setRoleFilter}
                  options={[{ value: "all", label: "All Roles" }, ...filterRoleOptions.map((role) => ({ value: role.value, label: role.label }))]}
                  className="w-full sm:min-w-[180px]"
                  disabled={rolesLoading}
                />
              </>
            }
          />
        }
      >
        {loading ? (
          <TableSkeleton />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            title="No users found"
            description="Create a user account to start role-based access setup."
            actionLabel={canCreateUsers && roleOptions.length > 0 ? "Add User" : undefined}
            onAction={canCreateUsers && roleOptions.length > 0 ? handleAdd : undefined}
          />
        ) : (
          <ResponsiveTable
            data={filteredUsers}
            columns={columns}
            keyExtractor={(item) => item.id}
            mobileCard={(item) => (
              <MobileCard
                onView={() => { setSelectedUser(item); setIsViewOpen(true); }}
                onEdit={canUpdateUsers && canMutateTargetUser(item) ? () => handleEdit(item) : undefined}
                onDelete={canDeleteUsers && canMutateTargetUser(item) ? () => { setSelectedUser(item); setIsDeleteOpen(true); } : undefined}
              >
                <MobileCardHeader title={item.fullName} subtitle={item.userCode} badge={<StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge>} />
                <MobileCardRow
                  label="Role"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {item.roles.map((role) => (
                        <StatusBadge key={role} variant={getRoleVariant(role)} showDot={false}>
                          {role.replace(/_/g, " ")}
                        </StatusBadge>
                      ))}
                    </div>
                  }
                />
                <MobileCardRow label="Department" value={item.department || "-"} />
                <MobileCardRow label="Email" value={item.email} />
              </MobileCard>
            )}
          />
        )}
      </DataTableShell>

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={selectedUser ? "Edit User" : "Add New User"}
        description={selectedUser ? "Update user information" : "Create a new user account"}
        onSubmit={handleSubmit}
        submitLabel={submitting ? selectedUser ? "Updating..." : "Creating..." : selectedUser ? "Update User" : "Create User"}
        size="lg"
      >
        <FormGrid>
          <div className="sm:col-span-2">
            <ProfileImageField
              value={formData.profileImageUrl}
              onChange={(value) => setFormData({ ...formData, profileImageUrl: value })}
              fallbackText={formData.fullName || formData.userCode || "User"}
              name={formData.fullName || "User"}
            />
          </div>
          <InputField label="User Code" value={formData.userCode} onChange={(value) => setFormData({ ...formData, userCode: value })} placeholder="USR001" required />
          <InputField label="Full Name" value={formData.fullName} onChange={(value) => setFormData({ ...formData, fullName: value })} placeholder="Rajesh Kumar" required />
          <InputField label="Email" value={formData.email} onChange={(value) => setFormData({ ...formData, email: value })} placeholder="user@company.com" type="email" required autoComplete="off" />
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Password
              {!selectedUser && <span className="text-destructive">*</span>}
            </Label>
            <div className="relative">
              <Input value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} type={showPassword ? "text" : "password"} placeholder={selectedUser ? "Leave blank to keep existing password" : "Min 12 characters"} className="pr-10" autoComplete="new-password" />
              <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-10 w-10" onClick={() => setShowPassword((prev) => !prev)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <InputField label="Phone" value={formData.phone} onChange={(value) => setFormData({ ...formData, phone: value })} placeholder="+91 98765 43210" type="tel" />
          <SelectField
            label="Role"
            value={formData.role}
            onChange={(value) => setFormData({ ...formData, role: value as AppRole })}
            options={roleOptions.map((role) => ({ value: role.value, label: role.label }))}
            placeholder="Select role"
            required
            disabled={rolesLoading}
          />
          {canSelectPlant ? (
            <SelectField
              label="Plant"
              value={formData.plantId}
              onChange={handlePlantChange}
              options={plantsOptions}
              placeholder={isSystemRoleWithoutPlant(formData.role) ? "Not required for system role" : "Select plant"}
              disabled={isSystemRoleWithoutPlant(formData.role)}
            />
          ) : (
            <InputField label="Plant" value={getPlantName(defaultPlantId)} onChange={() => { }} disabled />
          )}
          <SelectField
            label="Department"
            value={formData.department}
            onChange={(value) => setFormData({ ...formData, department: value })}
            options={departmentOptions}
            placeholder={
              isSystemRoleWithoutPlant(formData.role)
                ? "Not required for system role"
                : canSelectPlant && !formData.plantId
                  ? "Select plant first"
                  : departmentsLoading
                    ? "Loading departments..."
                    : departmentOptions.length === 0
                      ? "No departments found"
                      : "Select department"
            }
            disabled={departmentsLoading || isSystemRoleWithoutPlant(formData.role) || (canSelectPlant && !formData.plantId)}
            hint={formData.department && departmentOptions[0]?.value === formData.department && departmentOptions[0]?.label.endsWith("(saved value)") ? "This user has a saved department value that is not present in the latest department master." : undefined}
          />
        </FormGrid>
      </FormDialog>

      <ViewDialog open={isViewOpen} onOpenChange={setIsViewOpen} title={selectedUser?.fullName || ""} subtitle={selectedUser?.userCode}>
        {selectedUser && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 pb-4 border-b">
              <Avatar className="h-16 w-16">
                {selectedUser.profileImageUrl ? <AvatarImage src={selectedUser.profileImageUrl} alt={selectedUser.fullName} className="object-cover" /> : null}
                <AvatarFallback className="bg-primary/10 text-primary text-lg">{getInitials(selectedUser.fullName)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-lg">{selectedUser.fullName}</p>
                <p className="text-muted-foreground">{selectedUser.email}</p>
              </div>
            </div>
            <DetailSection title="User Information">
              <DetailRow label="User Code" value={selectedUser.userCode} />
              <DetailRow label="Email" value={selectedUser.email} />
              <DetailRow label="Phone" value={selectedUser.phone || "-"} />
              <DetailRow label="Department" value={selectedUser.department || "-"} />
              <DetailRow label="Plant" value={getPlantName(selectedUser.plantId)} />
            </DetailSection>
            <DetailSection title="Access & Status">
              <DetailRow
                label="Roles"
                value={
                  <div className="flex flex-wrap gap-1">
                    {selectedUser.roles.map((role) => (
                      <StatusBadge key={role} variant={getRoleVariant(role)} showDot={false}>
                        {role.replace(/_/g, " ")}
                      </StatusBadge>
                    ))}
                  </div>
                }
              />
              <DetailRow label="Status" value={<StatusBadge variant={selectedUser.isActive ? "active" : "inactive"}>{selectedUser.isActive ? "Active" : "Inactive"}</StatusBadge>} />
              <DetailRow label="Created" value={new Date(selectedUser.createdAt).toLocaleDateString()} />
            </DetailSection>
          </div>
        )}
      </ViewDialog>

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete User"
        description={currentIsRootAdmin ? "This permanently removes the selected user from the database." : undefined}
        itemName={selectedUser?.fullName}
        onConfirm={confirmDelete}
        isLoading={submitting}
      />

      <AlertDialog open={isImportConfirmOpen} onOpenChange={setIsImportConfirmOpen}>
        <AlertDialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Import Review - {importSummary?.fileName}</AlertDialogTitle>
            <AlertDialogDescription>
              We found {importSummary?.rows.length ? importSummary.rows.length - 1 : 0} user record(s) in your file. 
              Please review the data preview below before finalizing the import.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <ScrollArea className="flex-1 h-[350px] my-4 border rounded-md">
            <div className="p-1 min-w-full overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    {importSummary?.rows[0]?.slice(0, 8).map((header: string, i: number) => (
                      <TableHead key={i} className="whitespace-nowrap text-[11px] h-8">{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importSummary?.rows.slice(1, 21).map((row: string[], rowIndex: number) => (
                    <TableRow key={rowIndex}>
                      {row.slice(0, 8).map((cell, cellIndex) => (
                        <TableCell key={cellIndex} className="whitespace-nowrap text-[11px] py-1 max-w-[150px] truncate">
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {importSummary && importSummary.rows.length > 21 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-2 text-[11px]">
                        ... and {importSummary.rows.length - 21} more rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setImportSummary(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmBulkImport()} disabled={bulkUploading}>
              {bulkUploading ? "Processing..." : "Confirm & Import Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
