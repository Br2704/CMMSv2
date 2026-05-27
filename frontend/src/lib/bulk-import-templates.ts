/**
 * Enhanced Bulk Import Template Utilities
 * Extends the base import-template with enterprise-grade features
 */

import { CsvTemplateColumn, CsvTemplateConfig, ExcelTemplateConfig } from "./import-template";

export interface EnhancedCsvTemplateColumn extends CsvTemplateColumn {
    category?: string;
    fieldType?: "text" | "email" | "phone" | "date" | "number" | "select" | "multiselect" | "boolean" | "hierarchy" | "password";
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    helpText?: string;
    isDropdown?: boolean;
    hierarchyParent?: string;
}

export interface EnhancedCsvTemplateConfig extends CsvTemplateConfig {
    columns: EnhancedCsvTemplateColumn[];
    fieldCategories?: Record<string, string[]>; // Maps category to column keys
    validationRules?: Record<string, string>; // Maps field key to validation rule description
    importInstructions?: string[];
    supportedFormats?: string[];
    dataQuickReference?: Record<string, string[]>; // Maps field to common values
}

export interface EnhancedExcelTemplateConfig extends ExcelTemplateConfig {
    columns: EnhancedCsvTemplateColumn[];
    dataQuickReference?: Record<string, string[]>;
    validationRules?: Record<string, string>;
}

/**
 * Generate enhanced CSV template with better dropdown indicators
 */
export function generateEnhancedCsvTemplate(config: EnhancedCsvTemplateConfig): string {
    const headers = config.columns.map((col) => formatColumnHeader(col));

    // Generate helper rows
    const helperRows: string[][] = [];

    // Instructions row
    if (config.importInstructions && config.importInstructions.length > 0) {
        helperRows.push(generateHelperRow("__instructions", config.importInstructions.join(" ")));
    }

    // Field categories
    if (config.fieldCategories) {
        const categoryInfo = Object.entries(config.fieldCategories)
            .map(([category, fields]) => `${category}: ${fields.join(", ")}`)
            .join(" | ");
        helperRows.push(generateHelperRow("__categories", categoryInfo));
    }

    // Required fields
    const requiredInfo = config.columns.map((col) => `${col.key}: ${col.required ? "REQUIRED" : "optional"}`).join(" | ");
    helperRows.push(generateHelperRow("__required", requiredInfo));

    // Field types
    const typeInfo = config.columns.map((col) => `${col.key}: ${formatFieldType(col.fieldType, col.allowedValues?.length)}`).join(" | ");
    helperRows.push(generateHelperRow("__field_types", typeInfo));

    // Examples
    const exampleInfo = config.columns.map((col) => `${col.key}: ${col.example || ""}`).join(" | ");
    helperRows.push(generateHelperRow("__examples", exampleInfo));

    // Allowed values
    const allowedInfo = config.columns
        .map((col) => `${col.key}: ${formatAllowedValues(col.allowedValues)}`)
        .join(" | ");
    helperRows.push(generateHelperRow("__allowed_values", allowedInfo));

    // Help text
    const helpInfo = config.columns.map((col) => `${col.key}: ${col.helpText || col.description || ""}`).join(" | ");
    helperRows.push(generateHelperRow("__help", helpInfo));

    // Validation rules
    if (config.validationRules && Object.keys(config.validationRules).length > 0) {
        const validationInfo = Object.entries(config.validationRules)
            .map(([field, rule]) => `${field}: ${rule}`)
            .join(" | ");
        helperRows.push(generateHelperRow("__validation", validationInfo));
    }

    // Reference sections with grouped values
    const referenceRows: string[][] = [];
    if (config.dataQuickReference && Object.keys(config.dataQuickReference).length > 0) {
        referenceRows.push([""]); // Blank line separator
        referenceRows.push(["# QUICK REFERENCE", "Common values for quick copy-paste"]);

        for (const [fieldName, values] of Object.entries(config.dataQuickReference)) {
            referenceRows.push([`# ${fieldName}`, values.join(" | ")]);
            // Add individual rows for easy reference
            values.forEach((value) => {
                referenceRows.push(["#", value]);
            });
        }
    }

    // Reference sections for allowed values
    if (config.referenceSections && config.referenceSections.length > 0) {
        if (referenceRows.length === 0) {
            referenceRows.push([""]); // Blank line separator if not already added
        }
        referenceRows.push(["# ALLOWED VALUES REFERENCE", ""]);

        config.referenceSections.forEach((section) => {
            referenceRows.push(["", ""]);
            referenceRows.push([`# ${section.title}`, ""]);
            section.values.forEach((value) => {
                referenceRows.push(["# ", value]);
            });
        });
    }

    // Combine all rows
    const allRows = [headers, ...helperRows, ...config.exampleRows, ...referenceRows];

    // Convert to CSV
    return rowsToCsv(allRows);
}

/**
 * Format column header with field type indicator
 */
export function formatColumnHeader(col: EnhancedCsvTemplateColumn): string {
    let header = col.key;

    // Add required indicator
    if (col.required) {
        header += " *";
    }

    // Add dropdown indicator
    if (col.isDropdown || (col.allowedValues && col.allowedValues.length > 0)) {
        header += " [SELECT]";
    }

    // Add hierarchy indicator
    if (col.fieldType === "hierarchy" || col.hierarchyParent) {
        header += " ↓";
    }

    return header;
}

/**
 * Format field type for display
 */
export function formatFieldType(
    fieldType?: string,
    hasAllowedValues?: number,
): string {
    if (!fieldType) return "text";

    const typeMap: Record<string, string> = {
        text: "Text",
        email: "Email",
        phone: "Phone",
        date: "Date (YYYY-MM-DD)",
        number: "Number",
        select: "Select One",
        multiselect: "Select Multiple",
        boolean: "True/False",
        hierarchy: "Hierarchy",
    };

    let result = typeMap[fieldType] || fieldType;

    if (hasAllowedValues && hasAllowedValues > 0) {
        result += ` (${hasAllowedValues} options)`;
    }

    return result;
}

/**
 * Format allowed values for display
 */
export function formatAllowedValues(values?: string[]): string {
    if (!values || values.length === 0) {
        return "Free text";
    }

    if (values.length <= 3) {
        return values.join(" | ");
    }

    const preview = values.slice(0, 3).join(" | ");
    return `${preview} (+${values.length - 3} more)`;
}

/**
 * Generate a helper row with key and value
 */
function generateHelperRow(key: string, value: string): string[] {
    return [key, value];
}

/**
 * Convert rows to CSV format
 */
function rowsToCsv(rows: string[][]): string {
    return rows
        .map((row) =>
            row
                .map((cell) => {
                    const normalized = String(cell ?? "");
                    // Quote if contains comma, quote, or newline
                    if (/[,"\n\r]/.test(normalized)) {
                        return `"${normalized.replace(/"/g, '""')}"`;
                    }
                    return normalized;
                })
                .join(","),
        )
        .join("\n");
}

/**
 * Generate sample reference data for quick copy-paste
 */
export function generateQuickReference(
    columnData: Record<
        string,
        {
            label: string;
            values: string[];
        }
    >,
): Record<string, string[]> {
    const quickRef: Record<string, string[]> = {};

    for (const [key, data] of Object.entries(columnData)) {
        const values = Array.from(new Set(data.values.filter(Boolean)));
        if (values.length > 0) {
            quickRef[data.label || key] = values.slice(0, 10); // Limit to first 10 for readability
        }
    }

    return quickRef;
}

/**
 * Build validation rules map for template
 */
export function buildValidationRulesMap(
    columns: EnhancedCsvTemplateColumn[],
): Record<string, string> {
    const rules: Record<string, string> = {};

    for (const col of columns) {
        const rulesList: string[] = [];

        if (col.required) {
            rulesList.push("required");
        }

        if (col.fieldType === "email") {
            rulesList.push("valid email format");
        } else if (col.fieldType === "date") {
            rulesList.push("YYYY-MM-DD format");
        } else if (col.fieldType === "phone") {
            rulesList.push("valid phone format");
        } else if (col.fieldType === "number") {
            rulesList.push("numeric only");
        }

        if (col.minLength) {
            rulesList.push(`min ${col.minLength} chars`);
        }

        if (col.maxLength) {
            rulesList.push(`max ${col.maxLength} chars`);
        }

        if (col.pattern) {
            rulesList.push(`pattern: ${col.pattern}`);
        }

        if (col.allowedValues && col.allowedValues.length > 0) {
            rulesList.push("use allowed values only");
        }

        if (rulesList.length > 0) {
            rules[col.key] = rulesList.join("; ");
        }
    }

    return rules;
}

/**
 * Create a dropdown field indicator
 */
export function createDropdownIndicator(allowedValues?: string[]): string {
    if (!allowedValues || allowedValues.length === 0) {
        return "";
    }
    return `[SELECT: ${Math.min(3, allowedValues.length)} options available]`;
}

/**
 * Generate field description with all metadata
 */
export function generateFieldDescription(col: EnhancedCsvTemplateColumn): string {
    const parts: string[] = [];

    if (col.label) {
        parts.push(col.label);
    }

    if (col.required) {
        parts.push("(REQUIRED)");
    }

    if (col.description) {
        parts.push(col.description);
    }

    if (col.fieldType === "select" && col.allowedValues) {
        parts.push(`Values: ${col.allowedValues.slice(0, 3).join(", ")}${col.allowedValues.length > 3 ? ", ..." : ""}`);
    }

    if (col.format) {
        parts.push(`Format: ${col.format}`);
    }

    if (col.helpText) {
        parts.push(`Help: ${col.helpText}`);
    }

    return parts.join(" → ");
}

/**
 * Format a single example with annotations
 */
export function annotateExampleValue(value: string, col: EnhancedCsvTemplateColumn): string {
    if (!value) return "";

    let annotation = value;

    // Add type annotation if empty
    if (!value.trim()) {
        if (col.required) {
            annotation = "[LEAVE BLANK OR PROVIDE VALUE]";
        } else {
            annotation = "[OPTIONAL - CAN BE BLANK]";
        }
    }

    return annotation;
}

/**
 * Create a categorized field map for documentation
 */
export function createCategorizedFieldMap(
    columns: EnhancedCsvTemplateColumn[],
): Record<string, string[]> {
    const categories: Record<string, string[]> = {};

    for (const col of columns) {
        const category = col.category || "General";
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push(col.key);
    }

    return categories;
}

/**
 * Generate import checklist for users
 */
export function generateImportChecklist(): string[] {
    return [
        "1. Download the template file and save locally",
        "2. Review the Field Guide sheet for column descriptions",
        "3. Check the Master Data sheet for reference/allowed values",
        "4. Fill the Machine Upload sheet with your data",
        "5. Required fields are marked with * and must be filled",
        "6. For fields with [SELECT], choose from the allowed values list",
        "7. Delete all helper rows (starting with __) before uploading",
        "8. Verify dates are in YYYY-MM-DD format",
        "9. Save as .xls or .csv and upload",
        "10. Review the import preview before confirming",
    ];
}

/**
 * Generate validation summary
 */
export function generateValidationSummary(
    columns: EnhancedCsvTemplateColumn[],
): string {
    const requiredCount = columns.filter((c) => c.required).length;
    const selectCount = columns.filter((c) => c.isDropdown || (c.allowedValues && c.allowedValues.length > 0)).length;
    const dateCount = columns.filter((c) => c.fieldType === "date").length;

    return `
VALIDATION SUMMARY:
- Required fields: ${requiredCount}
- Dropdown/select fields: ${selectCount}
- Date fields: ${dateCount}
- Total columns: ${columns.length}

KEY VALIDATION RULES:
- All required fields (*) must be filled
- Dropdown fields must use exact values from the list
- Dates must be YYYY-MM-DD format
- Emails must be valid format
- Numbers must be numeric only
- No duplicate values in code/ID fields
`;
}

/**
 * Export enhanced template as downloadable CSV
 */
export function downloadEnhancedCsvTemplate(config: EnhancedCsvTemplateConfig, fileName?: string): void {
    const csv = generateEnhancedCsvTemplate(config);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName || config.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

/**
 * Export enhanced Excel template with advanced formatting
 * (This would wrap the existing downloadEnterpriseExcelTemplate with enhanced features)
 */
export function downloadEnhancedExcelTemplate(config: EnhancedExcelTemplateConfig, fileName?: string): void {
    // This would integrate with the existing Excel generator
    // For now, we'll create a placeholder that the developer can extend
    // TODO: Implement actual Excel generation when integrating with the Excel generator
}
