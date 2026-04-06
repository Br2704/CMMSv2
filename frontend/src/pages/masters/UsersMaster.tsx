import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Search, Edit, Trash2, Users, Eye, EyeOff, Upload, Download } from "lucide-react";
import { toast } from "sonner";
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

type AppRole = string;

interface UserRow extends UserProfile {
  roles: AppRole[];
}

interface RoleOption {
  value: AppRole;
  label: string;
}

function normalizeRoleKey(role: string) {
  const normalized = role.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (normalized === "SUPER_ADMIN" || normalized === "SUPERADMIN") return "SUPERADMIN";
  if (normalized === "ROOTADMIN" || normalized === "ROOT_ADMIN") return "ROOT_ADMIN";
  if (normalized === "PLANT_ADMIN" || normalized === "PLANTADMIN" || normalized === "ORG_ADMIN" || normalized === "ORGANIZATION_ADMIN") {
    return "ADMIN";
  }
  if (normalized === "SECURITY_USER") return "SECURITY";
  return normalized;
}

function getErrorMessage(error: unknown, fallback: string) {
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

function normalizeHeaderName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  const pushCell = () => {
    currentRow.push(currentCell.trim());
    currentCell = "";
  };

  const pushRow = () => {
    if (currentRow.length === 0) return;
    rows.push(currentRow);
    currentRow = [];
  };

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      pushCell();
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      pushCell();
      pushRow();
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      continue;
    }

    currentCell += char;
  }

  pushCell();
  pushRow();

  return rows.filter((row) => row.some((cell) => cell.length > 0));
}

function downloadCsvTemplate(fileName: string, headers: string[], rows: string[][]) {
  const toCell = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = [headers.map(toCell).join(","), ...rows.map((row) => row.map(toCell).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
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
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load roles"));
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
          if (formData.password.trim().length < 8) {
            toast.error("Password must be at least 8 characters");
            setSubmitting(false);
            return;
          }
          await updateUser(selectedUser.userId, { password: formData.password.trim() });
        }
        toast.success("User updated successfully");
      } else {
        if (!formData.password || formData.password.trim().length < 8) {
          toast.error("Password must be at least 8 characters");
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
    if (roleOptions.length === 0) {
      toast.error("Roles are still loading. Try bulk upload again in a moment.");
      return;
    }

    const rows = parseCsvRows(content);
    if (rows.length < 2) {
      toast.error("CSV must include a header and at least one user row");
      return;
    }

    const headerRow = rows[0] || [];
    const headerIndex = new Map<string, number>();
    headerRow.forEach((header, index) => {
      const normalized = normalizeHeaderName(header);
      if (normalized) {
        headerIndex.set(normalized, index);
      }
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
        if (typeof value === "string" && value.trim().length > 0) {
          return value.trim();
        }
      }
      return "";
    };

    const roleValueByNormalized = new Map<string, string>();
    roleOptions.forEach((roleOption) => {
      roleValueByNormalized.set(normalizeRoleKey(roleOption.value), roleOption.value === "SUPER_ADMIN" ? "SUPERADMIN" : roleOption.value);
    });

    const parseIsActive = (value: string) => {
      if (!value) return true;
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "active"].includes(normalized)) return true;
      if (["false", "0", "no", "inactive"].includes(normalized)) return false;
      return true;
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

    const seenCodes = new Set<string>();
    const seenEmails = new Set<string>();
    const failures: string[] = [];
    let createdCount = 0;

    setBulkUploading(true);
    try {
      for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        if (!row || row.every((value) => value.trim().length === 0)) {
          continue;
        }

        const userCode = pickCell(row, ["user_code", "code"]);
        const fullName = pickCell(row, ["full_name", "name"]);
        const emailRaw = pickCell(row, ["email"]);
        const password = pickCell(row, ["password"]);

        if (!userCode || !fullName || !emailRaw || !password) {
          failures.push(`Row ${rowIndex + 1}: user_code, full_name, email, and password are required`);
          continue;
        }

        const normalizedEmail = emailRaw.toLowerCase();
        const userCodeKey = normalizeLookupValue(userCode);
        if (seenCodes.has(userCodeKey)) {
          failures.push(`Row ${rowIndex + 1}: duplicate user_code in CSV (${userCode})`);
          continue;
        }
        if (seenEmails.has(normalizedEmail)) {
          failures.push(`Row ${rowIndex + 1}: duplicate email in CSV (${emailRaw})`);
          continue;
        }
        seenCodes.add(userCodeKey);
        seenEmails.add(normalizedEmail);

        const roleRaw = pickCell(row, ["role"]) || "USER";
        const normalizedRole = normalizeRoleKey(roleRaw);
        const roleValue = roleValueByNormalized.get(normalizedRole);
        if (!roleValue) {
          failures.push(`Row ${rowIndex + 1}: role '${roleRaw}' is not allowed`);
          continue;
        }

        const systemRole = normalizedRole === "SUPERADMIN" || normalizedRole === "ROOT_ADMIN";
        const rowPlantValue = pickCell(row, ["plant_id", "plant_code", "plant"]);
        const resolvedPlantId =
          systemRole
            ? null
            : canSelectPlant
              ? (rowPlantValue ? plantLookup.get(normalizeLookupValue(rowPlantValue)) || rowPlantValue : defaultPlantId || null)
              : defaultPlantId || null;

        if (!systemRole && !resolvedPlantId) {
          failures.push(`Row ${rowIndex + 1}: plant is required for role '${roleValue}'`);
          continue;
        }

        try {
          const departmentRaw = pickCell(row, ["department", "department_name", "department_code"]);
          const departmentName = await resolveDepartmentName(resolvedPlantId, departmentRaw);

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
            isActive: parseIsActive(pickCell(row, ["is_active", "active", "status"])),
          });
          createdCount += 1;
        } catch (error: unknown) {
          failures.push(`Row ${rowIndex + 1}: ${getErrorMessage(error, "failed to create user")}`);
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
      const content = await file.text();
      await handleBulkUsersCsv(content);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to read bulk upload file"));
    }
  };

  const handleDownloadUsersSampleCsv = () => {
    downloadCsvTemplate(
      "user_bulk_upload_sample.csv",
      ["user_code", "full_name", "email", "password", "role", "plant", "department", "phone", "is_active"],
      [
        ["USR001", "Anita Sharma", "anita.sharma@example.com", "TempPass@123", "USER", "PLANT_CODE_OR_ID", "Maintenance", "+91-9000000001", "true"],
        ["SEC001", "Ravi Security", "ravi.security@example.com", "TempPass@123", "SECURITY", "PLANT_CODE_OR_ID", "Security", "+91-9000000002", "true"],
      ],
    );
    toast.success("User sample CSV downloaded");
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
                accept=".csv,text/csv"
                className="hidden"
                aria-label="Bulk upload users CSV"
                title="Bulk upload users CSV"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  void handleBulkUsersFileChange(file);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 sm:w-auto"
                onClick={() => bulkUploadInputRef.current?.click()}
                disabled={bulkUploading || roleOptions.length === 0}
              >
                <Upload className="h-4 w-4" />
                {bulkUploading ? "Uploading..." : "Bulk Upload CSV"}
              </Button>
              <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" onClick={handleDownloadUsersSampleCsv}>
                <Download className="h-4 w-4" />
                Download Sample CSV
              </Button>
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
          <InputField label="Email" value={formData.email} onChange={(value) => setFormData({ ...formData, email: value })} placeholder="user@company.com" type="email" required />
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Password
              {!selectedUser && <span className="text-destructive">*</span>}
            </Label>
            <div className="relative">
              <Input value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} type={showPassword ? "text" : "password"} placeholder={selectedUser ? "Leave blank to keep existing password" : "Min 8 characters"} className="pr-10" />
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
            <InputField label="Plant" value={getPlantName(defaultPlantId)} onChange={() => {}} disabled />
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
    </PageShell>
  );
}
