/**
 * Standardized Bulk Upload Configurations
 * Ready-to-use configurations for all master modules
 */

import { EnhancedCsvTemplateColumn, EnhancedCsvTemplateConfig } from "./bulk-import-templates";

/**
 * User Management Bulk Upload Configuration
 */
export const createUserBulkUploadConfig = (options: {
    roles: Array<{ value: string; label: string }>;
    plants: Array<{ value: string; label: string }>;
    departments: string[];
    passwordPolicy: string;
}): EnhancedCsvTemplateConfig => ({
    fileName: "user_bulk_upload_template.csv",
    columns: [
        {
            key: "user_code",
            label: "User Code",
            required: true,
            example: "USR001",
            description: "Unique employee or login code",
            fieldType: "text",
            minLength: 3,
            maxLength: 50,
            helpText: "Must be unique across the system",
        },
        {
            key: "full_name",
            label: "Full Name",
            required: true,
            example: "John Doe",
            description: "Display name for the user",
            fieldType: "text",
            minLength: 2,
            maxLength: 100,
        },
        {
            key: "email",
            label: "Email",
            required: true,
            example: "john.doe@example.com",
            description: "Valid unique email address",
            fieldType: "email",
            helpText: "Must be unique and in valid format",
        },
        {
            key: "password",
            label: "Temporary Password",
            required: true,
            example: "TempPass@123",
            format: options.passwordPolicy,
            fieldType: "password",
            helpText: "User should change password on first login",
        },
        {
            key: "role",
            label: "Role",
            required: true,
            example: options.roles[0]?.value || "USER",
            description: "User role/responsibility",
            fieldType: "select",
            isDropdown: true,
            allowedValues: options.roles.map((r) => r.value),
            helpText: "Select one role from the allowed list",
            category: "Access Control",
        },
        {
            key: "plant",
            label: "Plant/Location",
            required: true,
            example: options.plants[0]?.label || "Plant-001",
            description: "Assigned plant or location",
            fieldType: "select",
            isDropdown: true,
            allowedValues: options.plants.map((p) => p.label),
            helpText: "Select plant code or name",
            category: "Assignment",
        },
        {
            key: "department",
            label: "Department",
            required: false,
            example: options.departments[0] || "Maintenance",
            description: "Department assignment (optional)",
            fieldType: "select",
            isDropdown: true,
            allowedValues: options.departments,
            helpText: "Select existing department or leave blank",
            category: "Assignment",
        },
        {
            key: "phone",
            label: "Phone Number",
            required: false,
            example: "+91-9000000001",
            description: "Contact phone number",
            fieldType: "phone",
            helpText: "Optional contact number",
        },
        {
            key: "is_active",
            label: "Status",
            required: false,
            example: "true",
            description: "User account status",
            fieldType: "boolean",
            allowedValues: ["true", "false", "active", "inactive", "yes", "no"],
            helpText: "Defaults to true/active when left blank",
            category: "Status",
        },
    ],
    exampleRows: [
        [
            "USR001",
            "Alice Johnson",
            "alice.johnson@example.com",
            "InitialPass@123",
            options.roles[0]?.value || "USER",
            options.plants[0]?.label || "Plant-001",
            options.departments[0] || "Maintenance",
            "+91-9000000001",
            "true",
        ],
        [
            "USR002",
            "Bob Smith",
            "bob.smith@example.com",
            "InitialPass@456",
            options.roles[1]?.value || "SUPERVISOR",
            options.plants[0]?.label || "Plant-001",
            options.departments[0] || "Maintenance",
            "+91-9000000002",
            "true",
        ],
    ],
    fieldCategories: {
        "Basic Info": ["user_code", "full_name", "email", "phone"],
        "Access Control": ["password", "role"],
        "Assignment": ["plant", "department"],
        "Status": ["is_active"],
    },
    importInstructions: [
        "1. Download and review this template before preparing your data",
        "2. Fill all REQUIRED fields (marked with *)",
        "3. For Role and Plant fields, use exact values from the reference list",
        "4. Passwords must meet the policy requirements",
        "5. Email and User Code must be unique",
        "6. Delete all helper rows (starting with __) before uploading",
        "7. Save as CSV or Excel format",
        "8. Maximum 1000 rows per upload",
    ],
    referenceSections: [
        {
            title: "Available Roles",
            values: options.roles.map((r) => `${r.value} - ${r.label}`),
        },
        {
            title: "Available Plants",
            values: options.plants.map((p) => `${p.value} - ${p.label}`),
        },
        {
            title: "Available Departments",
            values: options.departments,
        },
    ],
    validationRules: {
        user_code: "unique, alphanumeric, 3-50 characters",
        full_name: "required, 2-100 characters",
        email: "required, valid email format, unique",
        password: options.passwordPolicy,
        role: "required, must be from role list",
        plant: "required, must be from plant list",
        department: "optional, must be from department list if provided",
        phone: "optional, valid phone format",
        is_active: "optional, boolean (true/false/active/inactive/yes/no)",
    },
    dataQuickReference: {
        "Roles": options.roles.map((r) => r.value),
        "Plants": options.plants.map((p) => p.label),
        "Departments": options.departments,
        "Boolean Values": ["true", "false", "active", "inactive"],
    },
});

/**
 * Machines/Assets Bulk Upload Configuration
 */
export const createMachineBulkUploadConfig = (options: {
    types: string[];
    assetTypes: string[];
    criticalities: string[];
    statuses: string[];
    departments: string[];
    modules: string[];
    vendors: string[];
    costCenters: string[];
}): EnhancedCsvTemplateConfig => ({
    fileName: "machine_bulk_upload_template.csv",
    columns: [
        {
            key: "machine_code",
            label: "Machine Code",
            required: true,
            example: "MCH-001",
            description: "Unique machine/asset identifier",
            fieldType: "text",
            minLength: 3,
            maxLength: 50,
            helpText: "Must be unique across the system",
            category: "Basic Info",
        },
        {
            key: "machine_name",
            label: "Machine Name",
            required: true,
            example: "Air Compressor 01",
            description: "Display name for the machine",
            fieldType: "text",
            maxLength: 100,
            category: "Basic Info",
        },
        {
            key: "department",
            label: "Department",
            required: true,
            example: options.departments[0] || "Maintenance",
            description: "Assigned department",
            fieldType: "select",
            isDropdown: true,
            allowedValues: options.departments,
            helpText: "Select from existing departments",
            category: "Assignment",
        },
        {
            key: "module",
            label: "Module/System",
            required: true,
            example: options.modules[0] || "Cooling System",
            description: "Machine module or system classification",
            fieldType: "select",
            isDropdown: true,
            allowedValues: options.modules,
            helpText: "Select or create new module",
            category: "Assignment",
        },
        {
            key: "type",
            label: "Type",
            required: true,
            example: options.types[0] || "UTILITY",
            description: "Machine type classification",
            fieldType: "select",
            isDropdown: true,
            allowedValues: options.types,
            category: "Classification",
        },
        {
            key: "asset_type",
            label: "Asset Type",
            required: true,
            example: options.assetTypes[0] || "PUMP",
            description: "Asset category/type",
            fieldType: "select",
            isDropdown: true,
            allowedValues: options.assetTypes,
            category: "Classification",
        },
        {
            key: "criticality",
            label: "Criticality",
            required: true,
            example: options.criticalities[0] || "HIGH",
            description: "Asset criticality level",
            fieldType: "select",
            isDropdown: true,
            allowedValues: options.criticalities,
            category: "Risk",
        },
        {
            key: "status",
            label: "Status",
            required: true,
            example: options.statuses[0] || "OPERATIONAL",
            description: "Current status",
            fieldType: "select",
            isDropdown: true,
            allowedValues: options.statuses,
            category: "Status",
        },
        {
            key: "manufacturer",
            label: "Manufacturer",
            required: false,
            example: "Atlas Copco",
            description: "Equipment manufacturer",
            fieldType: "text",
            category: "Technical Specs",
        },
        {
            key: "model",
            label: "Model Number",
            required: false,
            example: "GA55",
            description: "Model designation",
            fieldType: "text",
            category: "Technical Specs",
        },
        {
            key: "serial_number",
            label: "Serial Number",
            required: false,
            example: "AC-2024-0001",
            description: "Equipment serial number",
            fieldType: "text",
            helpText: "Must be unique if provided",
            category: "Technical Specs",
        },
        {
            key: "rated_capacity",
            label: "Rated Capacity",
            required: false,
            example: "125",
            description: "Equipment capacity value",
            fieldType: "number",
            category: "Technical Specs",
        },
        {
            key: "capacity_unit",
            label: "Capacity Unit",
            required: false,
            example: "CFM",
            description: "Unit of capacity measurement",
            fieldType: "text",
            category: "Technical Specs",
        },
        {
            key: "location",
            label: "Location",
            required: false,
            example: "Compressor Room",
            description: "Physical location",
            fieldType: "text",
            category: "Location",
        },
        {
            key: "cost_center",
            label: "Cost Center",
            required: false,
            example: options.costCenters[0] || "CC-001",
            description: "Associated cost center",
            fieldType: "select",
            isDropdown: true,
            allowedValues: options.costCenters,
            category: "Financial",
        },
        {
            key: "vendor",
            label: "Vendor/Supplier",
            required: false,
            example: options.vendors[0] || "Vendor Name",
            description: "Equipment vendor",
            fieldType: "select",
            isDropdown: true,
            allowedValues: options.vendors,
            category: "Sourcing",
        },
        {
            key: "commission_date",
            label: "Commission Date",
            required: false,
            example: "2024-01-15",
            description: "Date equipment was commissioned",
            fieldType: "date",
            format: "YYYY-MM-DD",
            category: "Timeline",
        },
        {
            key: "warranty_expiry",
            label: "Warranty Expiry",
            required: false,
            example: "2026-01-15",
            description: "Warranty expiration date",
            fieldType: "date",
            format: "YYYY-MM-DD",
            category: "Timeline",
        },
    ],
    exampleRows: [
        [
            "MCH-001",
            "Air Compressor 01",
            options.departments[0] || "Maintenance",
            options.modules[0] || "Cooling",
            options.types[0] || "UTILITY",
            options.assetTypes[0] || "PUMP",
            options.criticalities[0] || "HIGH",
            options.statuses[0] || "OPERATIONAL",
            "Atlas Copco",
            "GA55",
            "AC-2024-0001",
            "125",
            "CFM",
            "Compressor Room",
            options.costCenters[0] || "CC-001",
            options.vendors[0] || "Vendor A",
            "2024-01-10",
            "2026-01-10",
        ],
    ],
    fieldCategories: {
        "Basic Info": ["machine_code", "machine_name"],
        "Assignment": ["department", "module"],
        "Classification": ["type", "asset_type"],
        "Risk": ["criticality"],
        "Status": ["status"],
        "Technical Specs": ["manufacturer", "model", "serial_number", "rated_capacity", "capacity_unit"],
        "Location": ["location"],
        "Financial": ["cost_center"],
        "Sourcing": ["vendor"],
        "Timeline": ["commission_date", "warranty_expiry"],
    },
    importInstructions: [
        "1. Download and save this template locally",
        "2. Review the Field Guide sheet for detailed descriptions",
        "3. Check Master Data sheet for reference values",
        "4. Fill all REQUIRED fields (marked with *)",
        "5. For dropdown fields, use exact values from the reference list",
        "6. Dates must be in YYYY-MM-DD format",
        "7. Machine Code and Serial Number must be unique",
        "8. Delete all helper rows before uploading",
        "9. Maximum 500 machines per upload",
    ],
    referenceSections: [
        {
            title: "Machine Types",
            values: options.types,
        },
        {
            title: "Asset Types",
            values: options.assetTypes,
        },
        {
            title: "Criticality Levels",
            values: options.criticalities,
        },
        {
            title: "Status Values",
            values: options.statuses,
        },
        {
            title: "Departments",
            values: options.departments,
        },
        {
            title: "Modules/Systems",
            values: options.modules,
        },
        {
            title: "Vendors",
            values: options.vendors,
        },
    ],
    validationRules: {
        machine_code: "unique, alphanumeric, 3-50 characters",
        machine_name: "required, 2-100 characters",
        department: "required, must be from department list",
        module: "required, must be from module list",
        type: "required, must be from type list",
        asset_type: "required, must be from asset type list",
        criticality: "required, must be from criticality list",
        status: "required, must be from status list",
        manufacturer: "optional, max 100 characters",
        model: "optional, max 50 characters",
        serial_number: "optional, unique if provided",
        rated_capacity: "optional, numeric only",
        location: "optional, max 100 characters",
        cost_center: "optional, must be from cost center list",
        vendor: "optional, must be from vendor list",
        commission_date: "optional, YYYY-MM-DD format",
        warranty_expiry: "optional, YYYY-MM-DD format",
    },
    dataQuickReference: {
        "Types": options.types,
        "Asset Types": options.assetTypes,
        "Criticalities": options.criticalities,
        "Statuses": options.statuses,
        "Departments": options.departments,
        "Modules": options.modules.slice(0, 5),
        "Vendors": options.vendors.slice(0, 5),
    },
});

/**
 * Generic Master Data Bulk Upload Configuration
 * Reusable for any master module
 */
export const createGenericMasterConfig = (options: {
    moduleName: string;
    columns: EnhancedCsvTemplateColumn[];
    exampleRows: string[][];
    referenceSections?: Array<{ title: string; values: string[] }>;
    importInstructions?: string[];
}): EnhancedCsvTemplateConfig => ({
    fileName: `${options.moduleName.toLowerCase().replace(/\s+/g, "_")}_bulk_upload_template.csv`,
    columns: options.columns,
    exampleRows: options.exampleRows,
    fieldCategories: options.columns.reduce(
        (acc, col) => {
            const category = col.category || "General";
            if (!acc[category]) acc[category] = [];
            acc[category].push(col.key);
            return acc;
        },
        {} as Record<string, string[]>
    ),
    importInstructions:
        options.importInstructions ||
        [
            `1. Download the ${options.moduleName} bulk upload template`,
            "2. Fill all REQUIRED fields (marked with *)",
            "3. Review the reference sections for allowed values",
            "4. Delete helper rows before uploading",
            "5. Validate and review the import preview",
            "6. Confirm import to proceed",
        ],
    referenceSections: options.referenceSections || [],
    validationRules: options.columns.reduce(
        (acc, col) => {
            const rules: string[] = [];
            if (col.required) rules.push("required");
            if (col.minLength) rules.push(`min ${col.minLength} chars`);
            if (col.maxLength) rules.push(`max ${col.maxLength} chars`);
            if (col.fieldType === "email") rules.push("valid email");
            if (col.fieldType === "date") rules.push("YYYY-MM-DD format");
            if (col.fieldType === "number") rules.push("numeric only");
            if (col.allowedValues?.length) rules.push("use allowed values");
            if (rules.length) acc[col.key] = rules.join("; ");
            return acc;
        },
        {} as Record<string, string>
    ),
});

/**
 * Export configurations for easy use
 */
export default {
    createUserBulkUploadConfig,
    createMachineBulkUploadConfig,
    createGenericMasterConfig,
};
