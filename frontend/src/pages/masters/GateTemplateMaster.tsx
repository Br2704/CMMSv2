import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, Search, Settings2, Trash2, Users, Wand2, X } from "lucide-react";
import BackButton from "@/components/masters/BackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormDialog } from "@/components/shared/FormDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { useMastersOptions } from "@/hooks/useMastersOptions";
import { broadcastGateSync, subscribeGateSync } from "@/lib/gate-sync";
import { useAuthStore, isSuperAdmin } from "@/store/auth.store";
import { listRoles } from "@/api/roles";
import {
  createGateTemplate,
  createGateTemplateField,
  createGateTemplateUser,
  deleteGateTemplate,
  deleteGateTemplateField,
  deleteGateTemplateUser,
  getGateSyncStatus,
  listGates,
  listGateTemplateFields,
  listGateTemplateUsers,
  listGateTemplates,
  updateGateTemplate,
  updateGateTemplateUser,
  type Gate,
  type GateTemplate,
  type GateTemplateUser,
} from "@/api/gates";

const visitorTypeOptions = [
  { value: "EMPLOYEE_ENTRY", label: "Employee Entry" },
  { value: "VISITOR_ENTRY", label: "Visitor Entry" },
  { value: "VENDOR_ENTRY", label: "Vendor Entry" },
  { value: "CONTRACTOR_ENTRY", label: "Contractor Entry" },
  { value: "MATERIAL_INWARD", label: "Material Inward" },
  { value: "MATERIAL_OUTWARD", label: "Material Outward" },
  { value: "VEHICLE_ENTRY", label: "Vehicle Entry" },
  { value: "COURIER_ENTRY", label: "Courier Entry" },
  { value: "WASTE_DISPOSAL_ENTRY", label: "Waste Disposal Entry" },
];

const fieldTypeOptions = [
  { value: "TEXT", label: "Text" },
  { value: "TEXTAREA", label: "Text Area" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "TIME", label: "Time" },
  { value: "DROPDOWN", label: "Dropdown" },
  { value: "PHOTO", label: "Photo Capture" },
  { value: "DOCUMENT", label: "Document Upload" },
  { value: "VEHICLE_NUMBER", label: "Vehicle Number" },
  { value: "SIGNATURE", label: "Signature" },
  { value: "CHECKBOX", label: "Checkbox" },
];

const emptyField = {
  fieldName: "",
  fieldLabel: "",
  fieldType: "TEXT",
  options: "",
  isRequired: false,
  unit: "",
  allowedMin: "",
  allowedMax: "",
  placeholder: "",
  fieldGroup: "VISITOR",
  captureKey: "",
  helpText: "",
  defaultValue: "",
  isEnvironmental: false,
};

function slugifyFieldName(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function getRecommendedFields(visitorType: string): Array<typeof emptyField> {
  const text = (fieldName: string, fieldLabel: string, overrides: Partial<typeof emptyField> = {}) => ({ ...emptyField, fieldName, fieldLabel, ...overrides });
  const number = (fieldName: string, fieldLabel: string, overrides: Partial<typeof emptyField> = {}) => ({ ...text(fieldName, fieldLabel, overrides), fieldType: "NUMBER" });
  const dropdown = (fieldName: string, fieldLabel: string, options: string, overrides: Partial<typeof emptyField> = {}) => ({ ...text(fieldName, fieldLabel, overrides), fieldType: "DROPDOWN", options });
  const upload = (fieldName: string, fieldLabel: string, fieldType: "PHOTO" | "DOCUMENT" | "SIGNATURE", overrides: Partial<typeof emptyField> = {}) => ({ ...text(fieldName, fieldLabel, overrides), fieldType });
  const checkbox = (fieldName: string, fieldLabel: string, overrides: Partial<typeof emptyField> = {}) => ({ ...text(fieldName, fieldLabel, overrides), fieldType: "CHECKBOX" });

  const sharedCompliance = [
    dropdown("entry_shift", "Entry Shift", "A, B, C, General", { fieldGroup: "SECURITY" }),
    text("security_guard_name", "Security Guard Name", { fieldGroup: "SECURITY" }),
    text("visitor_badge_number", "Visitor Badge Number", { fieldGroup: "SECURITY" }),
    checkbox("safety_briefing_done", "Safety Briefing Completed", { fieldGroup: "COMPLIANCE" }),
    checkbox("ppe_issued", "PPE Issued", { fieldGroup: "COMPLIANCE" }),
    checkbox("nda_or_confidentiality_confirmed", "NDA / Confidentiality Confirmed", { fieldGroup: "COMPLIANCE" }),
    text("incident_or_exception_notes", "Incident / Exception Notes", { fieldType: "TEXTAREA", fieldGroup: "SECURITY" }),
  ];

  const sharedIso14064 = [
    dropdown("emission_category", "Emission Category", "Scope 1, Scope 2, Scope 3", { fieldGroup: "ISO14064", captureKey: "emission_category", isEnvironmental: true, helpText: "Classify the transport or movement emissions correctly." }),
    dropdown("transport_mode", "Transport Mode", "Road, Rail, Sea, Air, Internal", { fieldGroup: "ISO14064", captureKey: "transport_mode", isEnvironmental: true }),
    number("transport_distance_km", "Transport Distance", { unit: "km", fieldGroup: "ISO14064", captureKey: "transport_distance_km", isEnvironmental: true }),
    dropdown("vehicle_fuel_type", "Vehicle Fuel Type", "Diesel, Petrol, CNG, LNG, Electric, Hybrid", { fieldGroup: "ISO14064", captureKey: "vehicle_fuel_type", isEnvironmental: true }),
    dropdown("vehicle_engine_type", "Vehicle Engine Type", "ICE, Hybrid, Electric", { fieldGroup: "ISO14064", captureKey: "vehicle_engine_type", isEnvironmental: true }),
    number("vehicle_idle_time", "Vehicle Idle Time", { unit: "min", fieldGroup: "ISO14064", captureKey: "vehicle_idle_time", isEnvironmental: true }),
    text("entry_purpose_emission_context", "Emission Context / Reason", { fieldGroup: "ISO14064", isEnvironmental: true, helpText: "Use this to support later GHG review and audit trails." }),
  ];

  const byType: Record<string, Array<typeof emptyField>> = {
    EMPLOYEE_ENTRY: [
      text("employee_name", "Employee Name", { isRequired: true, fieldGroup: "PERSON", captureKey: "visitor_name" }),
      text("employee_code", "Employee Code", { isRequired: true, fieldGroup: "PERSON" }),
      text("department_visiting", "Department", { fieldGroup: "PERSON" }),
      text("designation", "Designation", { fieldGroup: "PERSON" }),
      text("supervisor_name", "Reporting Supervisor", { fieldGroup: "PERSON" }),
      dropdown("employment_type", "Employment Type", "Permanent, Contract, Apprentice, Consultant", { fieldGroup: "PERSON" }),
      text("mobile_number", "Mobile Number", { fieldType: "NUMBER", fieldGroup: "PERSON", captureKey: "visitor_phone" }),
      checkbox("bio_attendance_verified", "Biometric / Attendance Verified", { fieldGroup: "COMPLIANCE" }),
      checkbox("medical_fitness_valid", "Medical Fitness Valid", { fieldGroup: "COMPLIANCE" }),
      checkbox("iso_training_completed", "ISO / Safety Training Completed", { fieldGroup: "COMPLIANCE" }),
      ...sharedCompliance,
    ],
    VISITOR_ENTRY: [
      text("visitor_name", "Visitor Name", { isRequired: true, fieldGroup: "PERSON", captureKey: "visitor_name" }),
      text("company_name", "Company Name", { fieldGroup: "PERSON", captureKey: "visitor_company" }),
      number("mobile_number", "Mobile Number", { isRequired: true, fieldGroup: "PERSON", captureKey: "visitor_phone" }),
      dropdown("gender", "Gender", "Male, Female, Other", { fieldGroup: "PERSON" }),
      dropdown("id_proof_type", "ID Proof Type", "Aadhaar, Passport, Driving License, PAN", { isRequired: true, fieldGroup: "COMPLIANCE", captureKey: "id_proof_type" }),
      text("id_proof_number", "ID Proof Number", { isRequired: true, fieldGroup: "COMPLIANCE", captureKey: "id_proof_number" }),
      dropdown("purpose_of_visit", "Purpose of Visit", "Meeting, Audit, Service, Delivery, Training, Inspection", { isRequired: true, fieldGroup: "VISIT", captureKey: "purpose" }),
      text("department_visiting", "Department Visiting", { fieldGroup: "VISIT" }),
      text("person_to_meet", "Person to Meet", { isRequired: true, fieldGroup: "VISIT", captureKey: "person_to_meet" }),
      text("expected_duration_hours", "Expected Duration", { fieldGroup: "VISIT", unit: "hrs" }),
      upload("photo_capture", "Photo Capture", "PHOTO", { isRequired: true, fieldGroup: "SECURITY" }),
      upload("id_proof_upload", "ID Proof Upload", "DOCUMENT", { fieldGroup: "COMPLIANCE" }),
      upload("visitor_signature", "Visitor Signature", "SIGNATURE", { fieldGroup: "SECURITY" }),
      checkbox("host_approval_confirmed", "Host Approval Confirmed", { fieldGroup: "COMPLIANCE" }),
      checkbox("visitor_declaration_signed", "Visitor Declaration Signed", { fieldGroup: "COMPLIANCE" }),
      ...sharedCompliance,
    ],
    VENDOR_ENTRY: [
      text("vendor_name", "Vendor Name", { isRequired: true, fieldGroup: "PERSON", captureKey: "vendor_name" }),
      text("vendor_company", "Vendor Company", { isRequired: true, fieldGroup: "PERSON", captureKey: "visitor_company" }),
      text("contact_person", "Vendor Contact Person", { fieldGroup: "PERSON" }),
      text("mobile_number", "Mobile Number", { fieldGroup: "PERSON", captureKey: "visitor_phone" }),
      text("service_order_number", "Service / Work Order Number", { fieldGroup: "COMPLIANCE" }),
      text("toolbox_talk_ref", "Toolbox Talk Reference", { fieldGroup: "COMPLIANCE" }),
      checkbox("work_permit_verified", "Work Permit Verified", { fieldGroup: "COMPLIANCE" }),
      checkbox("vendor_qualification_valid", "Vendor Qualification Valid", { fieldGroup: "COMPLIANCE" }),
      checkbox("risk_assessment_shared", "Risk Assessment Shared", { fieldGroup: "COMPLIANCE" }),
      upload("vendor_photo", "Vendor Photo", "PHOTO", { fieldGroup: "SECURITY" }),
      ...sharedCompliance,
      ...sharedIso14064,
    ],
    CONTRACTOR_ENTRY: [
      text("contractor_name", "Contractor Name", { isRequired: true, fieldGroup: "PERSON", captureKey: "visitor_name" }),
      text("contractor_company", "Contractor Company", { isRequired: true, fieldGroup: "PERSON", captureKey: "visitor_company" }),
      text("contract_number", "Contract Number", { fieldGroup: "COMPLIANCE" }),
      dropdown("contractor_category", "Contractor Category", "Civil, Electrical, Mechanical, Housekeeping, Utility", { fieldGroup: "COMPLIANCE" }),
      text("supervisor_name", "Contractor Supervisor", { fieldGroup: "PERSON" }),
      number("crew_size", "Crew Size", { fieldGroup: "PERSON" }),
      checkbox("induction_completed", "Safety Induction Completed", { fieldGroup: "COMPLIANCE" }),
      checkbox("medical_fitness_valid", "Medical Fitness Valid", { fieldGroup: "COMPLIANCE" }),
      checkbox("permit_to_work_issued", "Permit To Work Issued", { fieldGroup: "COMPLIANCE" }),
      checkbox("ppe_verified", "PPE Verified", { fieldGroup: "COMPLIANCE" }),
      upload("contractor_photo", "Contractor Photo", "PHOTO", { fieldGroup: "SECURITY" }),
      upload("ptw_copy", "PTW Copy", "DOCUMENT", { fieldGroup: "COMPLIANCE" }),
      ...sharedCompliance,
      ...sharedIso14064,
    ],
    VEHICLE_ENTRY: [
      text("vehicle_number", "Vehicle Number", { fieldType: "VEHICLE_NUMBER", isRequired: true, fieldGroup: "VEHICLE", captureKey: "vehicle_number" }),
      text("driver_name", "Driver Name", { isRequired: true, fieldGroup: "VEHICLE", captureKey: "driver_name" }),
      number("driver_contact", "Driver Contact", { fieldGroup: "VEHICLE", captureKey: "driver_contact" }),
      dropdown("vehicle_type", "Vehicle Type", "Truck, Tempo, Car, Van, Two Wheeler, Tanker, Trailer", { fieldGroup: "VEHICLE", captureKey: "vehicle_type" }),
      text("material_description", "Material Description", { fieldGroup: "MATERIAL", captureKey: "material_description" }),
      text("vendor_name", "Vendor Name", { fieldGroup: "MATERIAL", captureKey: "vendor_name" }),
      number("load_weight", "Load Weight", { unit: "kg", fieldGroup: "MATERIAL", captureKey: "load_weight" }),
      number("unload_weight", "Unload Weight", { unit: "kg", fieldGroup: "MATERIAL", captureKey: "unload_weight" }),
      text("gate_pass_number", "Gate Pass Number", { fieldGroup: "SECURITY", captureKey: "gate_pass_number" }),
      text("invoice_number", "Invoice Number", { fieldGroup: "SECURITY", captureKey: "invoice_number" }),
      checkbox("vehicle_documents_checked", "Vehicle Documents Checked", { fieldGroup: "COMPLIANCE" }),
      checkbox("pollution_certificate_valid", "PUC / Emission Certificate Valid", { fieldGroup: "COMPLIANCE" }),
      ...sharedIso14064,
      ...sharedCompliance,
    ],
    MATERIAL_INWARD: [
      text("material_name", "Material Name", { isRequired: true, fieldGroup: "MATERIAL" }),
      text("material_category", "Material Category", { fieldGroup: "MATERIAL" }),
      number("quantity", "Quantity", { isRequired: true, fieldGroup: "MATERIAL", captureKey: "quantity" }),
      text("unit_of_measurement", "Unit of Measurement", { fieldGroup: "MATERIAL", captureKey: "unit" }),
      text("vendor_name", "Vendor Name", { isRequired: true, fieldGroup: "MATERIAL", captureKey: "vendor_name" }),
      text("purchase_order_number", "Purchase Order Number", { fieldGroup: "MATERIAL" }),
      text("gate_pass_number", "Gate Pass Number", { fieldGroup: "SECURITY", captureKey: "gate_pass_number" }),
      text("invoice_number", "Invoice Number", { fieldGroup: "SECURITY", captureKey: "invoice_number" }),
      dropdown("material_hazard_category", "Material Hazard Category", "Non Hazardous, Flammable, Corrosive, Toxic, Oxidizer", { fieldGroup: "COMPLIANCE", isEnvironmental: true }),
      checkbox("msds_attached", "MSDS Attached", { fieldGroup: "COMPLIANCE" }),
      checkbox("incoming_inspection_completed", "Incoming Inspection Completed", { fieldGroup: "COMPLIANCE" }),
      ...sharedIso14064,
      ...sharedCompliance,
    ],
    MATERIAL_OUTWARD: [
      text("material_name", "Material Name", { isRequired: true, fieldGroup: "MATERIAL" }),
      text("material_category", "Material Category", { fieldGroup: "MATERIAL" }),
      number("quantity", "Quantity", { isRequired: true, fieldGroup: "MATERIAL", captureKey: "quantity" }),
      text("unit_of_measurement", "Unit of Measurement", { fieldGroup: "MATERIAL", captureKey: "unit" }),
      text("dispatch_reference_number", "Dispatch Reference Number", { fieldGroup: "SECURITY" }),
      text("customer_or_receiver", "Customer / Receiver", { fieldGroup: "MATERIAL" }),
      text("gate_pass_number", "Gate Pass Number", { fieldGroup: "SECURITY", captureKey: "gate_pass_number" }),
      text("invoice_number", "Invoice Number", { fieldGroup: "SECURITY", captureKey: "invoice_number" }),
      checkbox("dispatch_approval_done", "Dispatch Approval Completed", { fieldGroup: "COMPLIANCE" }),
      checkbox("weighbridge_verified", "Weighbridge Verified", { fieldGroup: "COMPLIANCE" }),
      ...sharedIso14064,
      ...sharedCompliance,
    ],
    COURIER_ENTRY: [
      text("courier_company", "Courier Company", { isRequired: true, fieldGroup: "PERSON", captureKey: "visitor_company" }),
      text("courier_person_name", "Courier Person Name", { fieldGroup: "PERSON", captureKey: "visitor_name" }),
      text("awb_or_tracking_number", "AWB / Tracking Number", { isRequired: true, fieldGroup: "SECURITY" }),
      dropdown("parcel_type", "Parcel Type", "Documents, Spare Parts, Samples, Chemicals, Others", { fieldGroup: "MATERIAL" }),
      text("consignee_department", "Consignee Department", { fieldGroup: "VISIT" }),
      text("consignee_person", "Consignee Person", { fieldGroup: "VISIT", captureKey: "person_to_meet" }),
      checkbox("tamper_check_completed", "Tamper Check Completed", { fieldGroup: "COMPLIANCE" }),
      checkbox("material_screened", "Parcel Screened", { fieldGroup: "COMPLIANCE" }),
      upload("proof_of_delivery_upload", "Proof Of Delivery Upload", "DOCUMENT", { fieldGroup: "SECURITY" }),
      ...sharedCompliance,
      ...sharedIso14064,
    ],
    WASTE_DISPOSAL_ENTRY: [
      dropdown("waste_type", "Waste Type", "Hazardous, Non Hazardous, Recyclable, Scrap, E-Waste, Sludge", { isRequired: true, fieldGroup: "ISO14064", captureKey: "waste_type", isEnvironmental: true }),
      number("waste_quantity", "Waste Quantity", { unit: "kg", isRequired: true, fieldGroup: "ISO14064", captureKey: "waste_quantity", isEnvironmental: true }),
      dropdown("waste_disposal_method", "Waste Disposal Method", "Recycle, Landfill, Incineration, Authorized Recycler", { fieldGroup: "ISO14064", isEnvironmental: true }),
      text("authorized_vendor_name", "Authorized Disposal Vendor", { fieldGroup: "PERSON", captureKey: "vendor_name" }),
      text("manifest_or_challan_number", "Manifest / Challan Number", { fieldGroup: "SECURITY" }),
      checkbox("hazard_label_checked", "Hazard Label Checked", { fieldGroup: "COMPLIANCE" }),
      checkbox("weighment_slip_verified", "Weighment Slip Verified", { fieldGroup: "COMPLIANCE" }),
      upload("waste_manifest_upload", "Waste Manifest Upload", "DOCUMENT", { fieldGroup: "COMPLIANCE" }),
      ...sharedIso14064,
      ...sharedCompliance,
    ],
  };

  return byType[visitorType] || byType.VISITOR_ENTRY;
}

export default function GateTemplateMaster() {
  const { user } = useAuthStore();
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, departmentsOptions, modulesOptions, assetsOptions, fetchPlants, fetchDepartments, fetchModules, fetchAssets } = useMastersOptions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<GateTemplate[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [searchTemplate, setSearchTemplate] = useState("");
  const [templateDialog, setTemplateDialog] = useState(false);
  const [fieldDialog, setFieldDialog] = useState(false);
  const [usersDialog, setUsersDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<GateTemplate | null>(null);
  const [fields, setFields] = useState<Array<typeof emptyField>>([]);
  const [templateUsers, setTemplateUsers] = useState<GateTemplateUser[]>([]);
  const [templateForm, setTemplateForm] = useState({
    gateId: "",
    plantId: defaultPlantId,
    templateName: "",
    visitorType: "VISITOR_ENTRY",
    departmentId: "",
    moduleId: "",
    machineId: "",
    allowedRoles: [] as string[],
    frequency: "",
    securityLevel: "",
  });
  const [userForm, setUserForm] = useState({ allowedUserType: "", departmentId: "", approvalRequired: false });
  const syncVersionRef = useRef<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [templateResponse, gateResponse, roleResponse] = await Promise.all([
        listGateTemplates({ page: 1, limit: 100, search: searchTemplate || undefined, plantId: canSelectPlant ? undefined : defaultPlantId || undefined }),
        listGates({ page: 1, limit: 200, plantId: canSelectPlant ? undefined : defaultPlantId || undefined }),
        listRoles(),
      ]);
      setTemplates(templateResponse.data);
      setGates(gateResponse.data);
      setRoles(roleResponse.data.map((role) => ({ id: role.id, name: role.name })));
    } catch (error: any) {
      toast.error(error?.message || "Failed to load gate templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPlants();
    void loadData();
  }, [searchTemplate, defaultPlantId, canSelectPlant]);

  useEffect(() => {
    const unsubscribe = subscribeGateSync(() => {
      void loadData();
    });
    return unsubscribe;
  }, [searchTemplate, defaultPlantId, canSelectPlant]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const response = await getGateSyncStatus({ plantId: canSelectPlant ? undefined : defaultPlantId || undefined });
          const nextVersion = `${response.data.configVersion || ""}:${response.data.activityVersion || ""}`;
          if (syncVersionRef.current && syncVersionRef.current !== nextVersion) {
            await loadData();
          }
          syncVersionRef.current = nextVersion;
        } catch {
          // Ignore background sync failures; manual load path already shows errors.
        }
      })();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [canSelectPlant, defaultPlantId, searchTemplate]);

  useEffect(() => {
    const plantId = canSelectPlant ? templateForm.plantId || undefined : defaultPlantId || undefined;
    if (!plantId) return;
    void fetchDepartments(plantId);
    void fetchModules(plantId, templateForm.departmentId || undefined);
    void fetchAssets(plantId, templateForm.departmentId || undefined, templateForm.moduleId || undefined);
  }, [canSelectPlant, defaultPlantId, templateForm.plantId, templateForm.departmentId, templateForm.moduleId]);

  const gateOptions = useMemo(() => gates.map((gate) => ({ value: gate.id, label: `${gate.gateName} (${gate.gateCode})` })), [gates]);
  const plantName = (plantId: string | null | undefined) => plantsOptions.find((item) => item.value === plantId)?.label || "-";
  const scopeName = (template: GateTemplate) => [departmentsOptions.find((i) => i.value === template.departmentId)?.label, modulesOptions.find((i) => i.value === template.moduleId)?.label, assetsOptions.find((i) => i.value === template.machineId)?.label].filter(Boolean).join(" / ") || "Plant";

  const saveTemplate = async () => {
    if (!templateForm.gateId || !templateForm.templateName.trim()) return toast.error("Gate and template name are required");
    setSaving(true);
    try {
      const payload = {
        gateId: templateForm.gateId,
        plantId: canSelectPlant ? templateForm.plantId || null : defaultPlantId || null,
        templateName: templateForm.templateName.trim(),
        visitorType: templateForm.visitorType,
        departmentId: templateForm.departmentId || null,
        moduleId: templateForm.moduleId || null,
        machineId: templateForm.machineId || null,
        allowedRoles: templateForm.allowedRoles.length ? templateForm.allowedRoles : null,
        frequency: templateForm.frequency || null,
        securityLevel: templateForm.securityLevel || null,
      };
      if (selectedTemplate) await updateGateTemplate(selectedTemplate.id, payload); else await createGateTemplate(payload);
      toast.success(selectedTemplate ? "Template updated" : "Template created");
      broadcastGateSync();
      setTemplateDialog(false);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const openFields = async (template: GateTemplate) => {
    setSelectedTemplate(template);
    try {
      const response = await listGateTemplateFields(template.id);
      setFields(response.data.map((field) => ({
        fieldName: field.fieldName,
        fieldLabel: field.fieldLabel,
        fieldType: field.fieldType,
        options: (field.options || []).join(", "),
        isRequired: field.isRequired,
        unit: field.unit || "",
        allowedMin: field.allowedMin || "",
        allowedMax: field.allowedMax || "",
        placeholder: field.placeholder || "",
        fieldGroup: field.fieldGroup || "VISITOR",
        captureKey: field.captureKey || "",
        helpText: field.helpText || "",
        defaultValue: field.defaultValue || "",
        isEnvironmental: Boolean(field.isEnvironmental),
      })));
      setFieldDialog(true);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load fields");
    }
  };

  const openUsers = async (template: GateTemplate) => {
    setSelectedTemplate(template);
    setUserForm({ allowedUserType: "", departmentId: "", approvalRequired: false });
    try {
      const response = await listGateTemplateUsers(template.id);
      setTemplateUsers(response.data);
      setUsersDialog(true);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load user types");
    }
  };

  const saveFields = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      const existing = await listGateTemplateFields(selectedTemplate.id);
      for (const field of existing.data) await deleteGateTemplateField(field.id);
      for (const [index, field] of fields.entries()) {
        await createGateTemplateField(selectedTemplate.id, {
          fieldName: field.fieldName || slugifyFieldName(field.fieldLabel),
          fieldLabel: field.fieldLabel,
          fieldType: field.fieldType,
          options: field.fieldType === "DROPDOWN" ? field.options.split(",").map((item) => item.trim()).filter(Boolean) : null,
          isRequired: field.isRequired,
          unit: field.unit || null,
          allowedMin: field.allowedMin || null,
          allowedMax: field.allowedMax || null,
          placeholder: field.placeholder || null,
          fieldGroup: field.fieldGroup || null,
          captureKey: field.captureKey || null,
          helpText: field.helpText || null,
          defaultValue: field.defaultValue || null,
          isEnvironmental: field.isEnvironmental,
          displayOrder: index,
        });
      }
      toast.success("Fields saved");
      broadcastGateSync();
      setFieldDialog(false);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save fields");
    } finally {
      setSaving(false);
    }
  };

  const addTemplateUser = async () => {
    if (!selectedTemplate || !userForm.allowedUserType.trim()) {
      toast.error("Allowed user type is required");
      return;
    }
    setSaving(true);
    try {
      const response = await createGateTemplateUser(selectedTemplate.id, {
        allowedUserType: userForm.allowedUserType.trim(),
        departmentId: userForm.departmentId || null,
        approvalRequired: userForm.approvalRequired,
      });
      setTemplateUsers((current) => [...current, response.data]);
      setUserForm({ allowedUserType: "", departmentId: "", approvalRequired: false });
      toast.success("User type added");
      broadcastGateSync();
    } catch (error: any) {
      toast.error(error?.message || "Failed to add user type");
    } finally {
      setSaving(false);
    }
  };

  const updateTemplateUser = async (userType: GateTemplateUser, updates: Partial<GateTemplateUser>) => {
    setSaving(true);
    try {
      const response = await updateGateTemplateUser(userType.id, {
        allowedUserType: updates.allowedUserType ?? userType.allowedUserType,
        departmentId: updates.departmentId ?? userType.departmentId,
        approvalRequired: updates.approvalRequired ?? userType.approvalRequired,
      });
      setTemplateUsers((current) => current.map((item) => (item.id === userType.id ? response.data : item)));
      broadcastGateSync();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update user type");
    } finally {
      setSaving(false);
    }
  };

  const removeTemplateUser = async (userType: GateTemplateUser) => {
    if (!confirm(`Remove ${userType.allowedUserType}?`)) return;
    setSaving(true);
    try {
      await deleteGateTemplateUser(userType.id);
      setTemplateUsers((current) => current.filter((item) => item.id !== userType.id));
      toast.success("User type removed");
      broadcastGateSync();
    } catch (error: any) {
      toast.error(error?.message || "Failed to remove user type");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">Gate Entry Template Management</h1>
        <p className="text-sm text-muted-foreground">Configure entry templates, allowed user types, and dynamic ISO 14064 data fields for each gate.</p>
      </motion.div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" /> Entry Types ({templates.length})</CardTitle>
            <div className="flex gap-2">
              <div className="relative min-w-[220px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={searchTemplate} onChange={(event) => setSearchTemplate(event.target.value)} placeholder="Search entry types..." /></div>
              <Button onClick={() => { setSelectedTemplate(null); setTemplateForm({ gateId: "", plantId: canSelectPlant ? "" : defaultPlantId, templateName: "", visitorType: "VISITOR_ENTRY", departmentId: "", moduleId: "", machineId: "", allowedRoles: [], frequency: "", securityLevel: "" }); setTemplateDialog(true); }}><Plus className="mr-2 h-4 w-4" /> Add Entry Type</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : (
            <div className="grid gap-4 lg:grid-cols-2">
              {templates.map((template) => (
                <Card key={template.id} className="border border-border/70 shadow-none">
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{template.templateName}</p>
                        <p className="text-xs text-muted-foreground">{template.gate?.gateName || gates.find((gate) => gate.id === template.gateId)?.gateName || "-"}</p>
                      </div>
                      <StatusBadge variant={template.isActive ? "active" : "default"} showDot>{template.isActive ? "Active" : "Inactive"}</StatusBadge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{template.visitorType.replace(/_/g, " ")}</Badge>
                      <Badge variant="outline">{template.fieldCount || 0} fields</Badge>
                      {template.securityLevel ? <Badge variant="outline">Level: {template.securityLevel}</Badge> : null}
                      {template.frequency ? <Badge variant="outline">Frequency: {template.frequency}</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{scopeName(template)}</p>
                    {template.allowedRoles && template.allowedRoles.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {template.allowedRoles.slice(0, 4).map((role) => <Badge key={role} variant="outline">{role}</Badge>)}
                        {template.allowedRoles.length > 4 ? <Badge variant="outline">+{template.allowedRoles.length - 4}</Badge> : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => void openFields(template)}>Fields</Button>
                      <Button variant="outline" onClick={() => void openUsers(template)}><Users className="mr-2 h-4 w-4" /> User Types</Button>
                      <Button variant="outline" onClick={() => { setSelectedTemplate(template); setTemplateForm({ gateId: template.gateId, plantId: template.plantId || (canSelectPlant ? "" : defaultPlantId), templateName: template.templateName, visitorType: template.visitorType, departmentId: template.departmentId || "", moduleId: template.moduleId || "", machineId: template.machineId || "", allowedRoles: template.allowedRoles || [], frequency: template.frequency || "", securityLevel: template.securityLevel || "" }); setTemplateDialog(true); }}>Edit</Button>
                      <Button variant="outline" className="text-destructive" onClick={async () => { if (!confirm(`Deactivate ${template.templateName}?`)) return; await deleteGateTemplate(template.id); toast.success("Entry type deactivated"); broadcastGateSync(); await loadData(); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FormDialog open={templateDialog} onOpenChange={setTemplateDialog} title={selectedTemplate ? "Edit Entry Type" : "Add Entry Type"} submitLabel={saving ? "Saving..." : selectedTemplate ? "Update" : "Create"} onSubmit={() => void saveTemplate()} size="lg">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Gate" value={templateForm.gateId} onChange={(value) => setTemplateForm((current) => ({ ...current, gateId: value }))} options={gateOptions} required />
          <InputField label="Entry Type Name" value={templateForm.templateName} onChange={(value) => setTemplateForm((current) => ({ ...current, templateName: value }))} required />
          <SelectField label="Visitor Type" value={templateForm.visitorType} onChange={(value) => setTemplateForm((current) => ({ ...current, visitorType: value }))} options={visitorTypeOptions} />
          {canSelectPlant ? <SelectField label="Plant" value={templateForm.plantId} onChange={(value) => setTemplateForm((current) => ({ ...current, plantId: value }))} options={plantsOptions} /> : <InputField label="Plant" value={plantName(defaultPlantId)} onChange={() => {}} disabled />}
          <SelectField label="Department" value={templateForm.departmentId} onChange={(value) => setTemplateForm((current) => ({ ...current, departmentId: value, moduleId: "", machineId: "" }))} options={departmentsOptions} placeholder="Optional" />
          <SelectField label="Module" value={templateForm.moduleId} onChange={(value) => setTemplateForm((current) => ({ ...current, moduleId: value, machineId: "" }))} options={modulesOptions} placeholder="Optional" />
          <SelectField label="Machine" value={templateForm.machineId} onChange={(value) => setTemplateForm((current) => ({ ...current, machineId: value }))} options={assetsOptions} placeholder="Optional" />
          <InputField label="Frequency" value={templateForm.frequency} onChange={(value) => setTemplateForm((current) => ({ ...current, frequency: value }))} placeholder="Optional (Daily, Weekly, Monthly)" />
          <InputField label="Security Level" value={templateForm.securityLevel} onChange={(value) => setTemplateForm((current) => ({ ...current, securityLevel: value }))} placeholder="Optional (Low, Medium, High)" />
        </div>
        <div className="mt-4 space-y-2 rounded-2xl border border-border/70 p-4">
          <p className="text-sm font-medium">Allowed Roles</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((role) => (
              <label key={role.id} className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
                <Checkbox
                  checked={templateForm.allowedRoles.includes(role.name)}
                  onCheckedChange={(checked) =>
                    setTemplateForm((current) => ({
                      ...current,
                      allowedRoles: checked
                        ? [...current.allowedRoles, role.name]
                        : current.allowedRoles.filter((item) => item !== role.name),
                    }))
                  }
                />
                <span>{role.name}</span>
              </label>
            ))}
            {roles.length === 0 ? <p className="text-sm text-muted-foreground">No roles found.</p> : null}
          </div>
        </div>
      </FormDialog>

      <Dialog open={fieldDialog} onOpenChange={setFieldDialog}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>Entry Fields - {selectedTemplate?.templateName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setFields(getRecommendedFields(selectedTemplate?.visitorType || "VISITOR_ENTRY"))}><Wand2 className="mr-2 h-4 w-4" /> Load Recommended Fields</Button>
              <Button variant="outline" onClick={() => setFields((current) => [...current, { ...emptyField }])}><Plus className="mr-2 h-4 w-4" /> Add Field</Button>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
              Use the recommended preset as the baseline, then add or remove fields for your plant process. Capture groups such as PERSON, VISIT, SECURITY, COMPLIANCE, MATERIAL, VEHICLE, and ISO14064 help structure visitor, safety, and GHG-related evidence for audits.
            </div>
            {fields.map((field, index) => (
              <Card key={`${field.fieldName}-${index}`} className="border border-border/70 shadow-none">
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (index === 0) return; const next = [...fields]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setFields(next); }}><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (index === fields.length - 1) return; const next = [...fields]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; setFields(next); }}><ArrowDown className="h-4 w-4" /></Button>
                    </div>
                    <div className="grid flex-1 gap-3 md:grid-cols-4">
                      <Input value={field.fieldLabel} onChange={(event) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fieldLabel: event.target.value, fieldName: item.fieldName || slugifyFieldName(event.target.value) } : item))} placeholder="Field label" />
                      <Input value={field.fieldName} onChange={(event) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fieldName: slugifyFieldName(event.target.value) } : item))} placeholder="Field key" />
                      <Select value={field.fieldType} onValueChange={(value) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fieldType: value } : item))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{fieldTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>
                      <Input value={field.fieldGroup} onChange={(event) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fieldGroup: event.target.value } : item))} placeholder="Field group" />
                      <Input value={field.captureKey} onChange={(event) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, captureKey: event.target.value } : item))} placeholder="Capture key" />
                      <Input value={field.unit} onChange={(event) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value } : item))} placeholder="Unit" />
                      <Input value={field.allowedMin} onChange={(event) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, allowedMin: event.target.value } : item))} placeholder="Allowed min" />
                      <Input value={field.allowedMax} onChange={(event) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, allowedMax: event.target.value } : item))} placeholder="Allowed max" />
                      <Input value={field.placeholder} onChange={(event) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, placeholder: event.target.value } : item))} placeholder="Placeholder" />
                      <Input className="md:col-span-2" value={field.helpText} onChange={(event) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, helpText: event.target.value } : item))} placeholder="Help text" />
                      <Input className="md:col-span-2" value={field.defaultValue} onChange={(event) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, defaultValue: event.target.value } : item))} placeholder="Default value" />
                      {field.fieldType === "DROPDOWN" ? <div className="md:col-span-4"><Input value={field.options} onChange={(event) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, options: event.target.value } : item))} placeholder="Options separated by comma" /></div> : null}
                      <div className="flex items-center gap-2"><Checkbox checked={field.isRequired} onCheckedChange={(checked) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, isRequired: !!checked } : item))} /><Label>Required</Label></div>
                      <div className="flex items-center gap-2"><Checkbox checked={field.isEnvironmental} onCheckedChange={(checked) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, isEnvironmental: !!checked } : item))} /><Label>ESG / GHG</Label></div>
                    </div>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index))}><X className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {fields.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No fields configured yet. Load a recommended set or add your own custom fields.</div> : null}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFieldDialog(false)}>Cancel</Button><Button onClick={() => void saveFields()} disabled={saving}>Save Fields</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={usersDialog} onOpenChange={setUsersDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Allowed User Types - {selectedTemplate?.templateName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input value={userForm.allowedUserType} onChange={(event) => setUserForm((current) => ({ ...current, allowedUserType: event.target.value }))} placeholder="Allowed user type" />
              <Select value={userForm.departmentId} onValueChange={(value) => setUserForm((current) => ({ ...current, departmentId: value }))}>
                <SelectTrigger><SelectValue placeholder="Department (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No department</SelectItem>
                  {departmentsOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Checkbox checked={userForm.approvalRequired} onCheckedChange={(checked) => setUserForm((current) => ({ ...current, approvalRequired: !!checked }))} />
                <Label>Approval required</Label>
              </div>
              <Button className="sm:col-span-3" onClick={() => void addTemplateUser()} disabled={saving}>Add User Type</Button>
            </div>

            <div className="space-y-2">
              {templateUsers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No user types configured yet.</div>
              ) : (
                templateUsers.map((item) => (
                  <Card key={item.id} className="border border-border/70 shadow-none">
                    <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{item.allowedUserType}</p>
                        <p className="text-xs text-muted-foreground">{item.department?.name || departmentsOptions.find((opt) => opt.value === item.departmentId)?.label || "Any department"}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-xs">
                          <Checkbox checked={item.approvalRequired} onCheckedChange={(checked) => void updateTemplateUser(item, { approvalRequired: !!checked })} />
                          Approval required
                        </label>
                        <Button variant="outline" className="text-destructive" onClick={() => void removeTemplateUser(item)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setUsersDialog(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
