/**
 * Advanced Bulk Import Validator
 * Provides centralized validation for bulk CSV/Excel imports across all modules
 */

export interface ValidationRule {
    name: string;
    validate: (value: string, context?: ValidationContext) => ValidationError | null;
}

export interface ValidationContext {
    rowNumber: number;
    columnKey: string;
    columnLabel?: string;
    existingValues?: Set<string>;
    allowedValues?: string[];
    isRequired?: boolean;
    [key: string]: any;
}

export interface ValidationError {
    type: "error" | "warning" | "info";
    message: string;
    suggestion?: string;
    rowNumber: number;
    columnKey: string;
    columnLabel?: string;
}

export interface RowValidationResult {
    rowNumber: number;
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    data?: Record<string, string>;
}

export interface BulkImportValidationResult {
    isValid: boolean;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    errors: ValidationError[];
    warnings: ValidationError[];
    rowResults: RowValidationResult[];
    duplicateMap: Map<string, string[]>; // Maps normalized value to row numbers
}

/**
 * Base validator class providing common validation patterns
 */
export class BulkImportValidator {
    private rules: Map<string, ValidationRule> = new Map();
    private duplicateFields: Set<string> = new Set();
    private globalContext: Partial<ValidationContext> = {};

    /**
     * Register a validation rule
     */
    registerRule(name: string, rule: ValidationRule): void {
        this.rules.set(name, rule);
    }

    /**
     * Mark a field for duplicate detection
     */
    markDuplicateField(fieldKey: string): void {
        this.duplicateFields.add(fieldKey);
    }

    /**
     * Set global validation context (e.g., existing values, allowed options)
     */
    setGlobalContext(context: Partial<ValidationContext>): void {
        this.globalContext = { ...this.globalContext, ...context };
    }

    /**
     * Validate a single row
     */
    validateRow(
        rowData: Record<string, string>,
        rowNumber: number,
        schema: Array<{ key: string; label: string; required?: boolean; type?: string }>,
    ): RowValidationResult {
        const errors: ValidationError[] = [];
        const warnings: ValidationError[] = [];

        // Validate each column in schema
        for (const column of schema) {
            const value = rowData[column.key] || "";
            const context: ValidationContext = {
                rowNumber,
                columnKey: column.key,
                columnLabel: column.label,
                isRequired: column.required,
                ...this.globalContext,
            };

            // Check required fields
            if (column.required && !value.trim()) {
                errors.push({
                    type: "error",
                    message: `${column.label || column.key} is required`,
                    rowNumber,
                    columnKey: column.key,
                    columnLabel: column.label,
                });
                continue;
            }

            // Skip validation for empty optional fields
            if (!value.trim()) continue;

            // Apply type-specific validators
            if (column.type === "email") {
                const emailError = this.validateEmail(value, context);
                if (emailError) errors.push(emailError);
            } else if (column.type === "phone") {
                const phoneWarning = this.validatePhone(value, context);
                if (phoneWarning) warnings.push(phoneWarning);
            } else if (column.type === "date") {
                const dateError = this.validateDate(value, context);
                if (dateError) errors.push(dateError);
            } else if (column.type === "number") {
                const numberError = this.validateNumber(value, context);
                if (numberError) errors.push(numberError);
            }

            // Apply custom rules if registered
            if (this.rules.has(column.key)) {
                const rule = this.rules.get(column.key)!;
                const ruleError = rule.validate(value, context);
                if (ruleError) {
                    if (ruleError.type === "error") {
                        errors.push(ruleError);
                    } else {
                        warnings.push(ruleError);
                    }
                }
            }
        }

        return {
            rowNumber,
            isValid: errors.length === 0,
            errors,
            warnings,
            data: rowData,
        };
    }

    /**
     * Validate multiple rows
     */
    validateRows(
        rows: Array<Record<string, string>>,
        schema: Array<{ key: string; label: string; required?: boolean; type?: string }>,
    ): BulkImportValidationResult {
        const rowResults: RowValidationResult[] = [];
        const allErrors: ValidationError[] = [];
        const allWarnings: ValidationError[] = [];
        const duplicateMap: Map<string, string[]> = new Map();
        const duplicateValueMap: Map<string, number[]> = new Map();

        // Validate each row
        for (let i = 0; i < rows.length; i++) {
            const result = this.validateRow(rows[i], i + 2, schema); // +2 because row 0 is header, row 1 is row number 1
            rowResults.push(result);
            allErrors.push(...result.errors);
            allWarnings.push(...result.warnings);
        }

        // Detect duplicates in duplicate-marked fields
        for (const fieldKey of this.duplicateFields) {
            const schema_column = schema.find((col) => col.key === fieldKey);
            if (!schema_column) continue;

            for (const result of rowResults) {
                const value = result.data?.[fieldKey];
                if (value && value.trim()) {
                    const normalized = this.normalizeDuplicateValue(value);
                    if (!duplicateValueMap.has(normalized)) {
                        duplicateValueMap.set(normalized, []);
                    }
                    duplicateValueMap.get(normalized)!.push(result.rowNumber);
                }
            }
        }

        // Build duplicate map and add errors for duplicates within CSV
        for (const [normalized, rowNumbers] of duplicateValueMap) {
            if (rowNumbers.length > 1) {
                duplicateMap.set(normalized, rowNumbers.map((n) => `Row ${n}`));

                // Add duplicate error to all but first occurrence
                for (let i = 1; i < rowNumbers.length; i++) {
                    allErrors.push({
                        type: "error",
                        message: `Duplicate value detected (also appears in row${rowNumbers.length > 2 ? "s" : ""} ${rowNumbers.slice(0, -1).join(", ")})`,
                        rowNumber: rowNumbers[i],
                        columnKey: Array.from(this.duplicateFields)[0], // Get first duplicate field
                    });
                }
            }
        }

        return {
            isValid: allErrors.length === 0,
            totalRows: rows.length,
            validRows: rowResults.filter((r) => r.isValid).length,
            invalidRows: rowResults.filter((r) => !r.isValid).length,
            errors: allErrors,
            warnings: allWarnings,
            rowResults,
            duplicateMap,
        };
    }

    /**
     * Email validation
     */
    private validateEmail(value: string, context: ValidationContext): ValidationError | null {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            return {
                type: "error",
                message: `Invalid email format`,
                suggestion: `Use format: example@domain.com`,
                rowNumber: context.rowNumber,
                columnKey: context.columnKey,
                columnLabel: context.columnLabel,
            };
        }
        return null;
    }

    /**
     * Phone validation
     */
    private validatePhone(value: string, context: ValidationContext): ValidationError | null {
        // Allow various phone formats, just warn if suspicious
        const phoneRegex = /^[\d\s\-+().]+$/;
        if (!phoneRegex.test(value)) {
            return {
                type: "warning",
                message: `Phone number format may be invalid`,
                rowNumber: context.rowNumber,
                columnKey: context.columnKey,
                columnLabel: context.columnLabel,
            };
        }
        return null;
    }

    /**
     * Date validation (YYYY-MM-DD format)
     */
    private validateDate(value: string, context: ValidationContext): ValidationError | null {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(value)) {
            return {
                type: "error",
                message: `Invalid date format`,
                suggestion: `Use YYYY-MM-DD format (e.g., 2024-01-15)`,
                rowNumber: context.rowNumber,
                columnKey: context.columnKey,
                columnLabel: context.columnLabel,
            };
        }

        const date = new Date(value);
        if (isNaN(date.getTime())) {
            return {
                type: "error",
                message: `Invalid date value`,
                suggestion: `Date does not exist (e.g., 2024-02-30)`,
                rowNumber: context.rowNumber,
                columnKey: context.columnKey,
                columnLabel: context.columnLabel,
            };
        }
        return null;
    }

    /**
     * Number validation
     */
    private validateNumber(value: string, context: ValidationContext): ValidationError | null {
        if (!/^-?\d+(\.\d+)?$/.test(value)) {
            return {
                type: "error",
                message: `Invalid number format`,
                suggestion: `Use numeric values only (e.g., 123 or 123.45)`,
                rowNumber: context.rowNumber,
                columnKey: context.columnKey,
                columnLabel: context.columnLabel,
            };
        }
        return null;
    }

    /**
     * Validate option selection from allowed values
     */
    validateOption(value: string, context: ValidationContext): ValidationError | null {
        if (!context.allowedValues || context.allowedValues.length === 0) {
            return null;
        }

        const normalized = this.normalizeValue(value);
        const isValid = context.allowedValues.some((opt) => this.normalizeValue(opt) === normalized);

        if (!isValid) {
            return {
                type: "error",
                message: `Invalid selection for ${context.columnLabel || context.columnKey}`,
                suggestion: `Must be one of: ${context.allowedValues.slice(0, 5).join(", ")}${context.allowedValues.length > 5 ? ", ..." : ""}`,
                rowNumber: context.rowNumber,
                columnKey: context.columnKey,
                columnLabel: context.columnLabel,
            };
        }
        return null;
    }

    /**
     * Normalize value for comparison (e.g., for duplicate detection)
     */
    private normalizeDuplicateValue(value: string): string {
        return value.trim().toLowerCase().replace(/\s+/g, " ");
    }

    /**
     * Normalize value for option matching
     */
    private normalizeValue(value: string): string {
        return value.trim().toLowerCase();
    }

    /**
     * Export validation results as CSV
     */
    exportErrorsAsCsv(result: BulkImportValidationResult): string {
        const headers = ["Row Number", "Column", "Type", "Message", "Suggestion"];
        const rows = result.errors.map((error) => [
            error.rowNumber.toString(),
            error.columnLabel || error.columnKey,
            error.type,
            error.message,
            error.suggestion || "",
        ]);

        const csvRows = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
        return csvRows;
    }

    /**
     * Generate detailed validation report
     */
    generateReport(result: BulkImportValidationResult): string {
        const lines: string[] = [];

        lines.push("=== BULK IMPORT VALIDATION REPORT ===\n");
        lines.push(`Total Rows: ${result.totalRows}`);
        lines.push(`Valid Rows: ${result.validRows}`);
        lines.push(`Invalid Rows: ${result.invalidRows}`);
        lines.push(`Status: ${result.isValid ? "✓ VALID" : "✗ INVALID"}\n`);

        if (result.errors.length > 0) {
            lines.push("ERRORS:");
            result.errors.forEach((error) => {
                lines.push(`  Row ${error.rowNumber}, ${error.columnLabel || error.columnKey}: ${error.message}`);
                if (error.suggestion) {
                    lines.push(`    → ${error.suggestion}`);
                }
            });
            lines.push("");
        }

        if (result.warnings.length > 0) {
            lines.push("WARNINGS:");
            result.warnings.forEach((warning) => {
                lines.push(`  Row ${warning.rowNumber}, ${warning.columnLabel || warning.columnKey}: ${warning.message}`);
            });
            lines.push("");
        }

        return lines.join("\n");
    }
}

/**
 * Pre-built validators for common field types
 */
export const CommonValidators = {
    email: (): ValidationRule => ({
        name: "email",
        validate: (value: string, context?: ValidationContext) => {
            if (!value.trim()) return null;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                return {
                    type: "error",
                    message: "Invalid email format (e.g., user@example.com)",
                    rowNumber: context?.rowNumber || 0,
                    columnKey: context?.columnKey || "email",
                    columnLabel: context?.columnLabel,
                };
            }
            return null;
        },
    }),

    password: (policy: string): ValidationRule => ({
        name: "password",
        validate: (value: string, context?: ValidationContext) => {
            if (!value.trim()) {
                return {
                    type: "error",
                    message: "Password is required",
                    rowNumber: context?.rowNumber || 0,
                    columnKey: context?.columnKey || "password",
                    columnLabel: context?.columnLabel,
                };
            }
            // Password policy check would go here
            return null;
        },
    }),

    required: (): ValidationRule => ({
        name: "required",
        validate: (value: string, context?: ValidationContext) => {
            if (!value.trim()) {
                return {
                    type: "error",
                    message: `${context?.columnLabel || context?.columnKey} is required`,
                    rowNumber: context?.rowNumber || 0,
                    columnKey: context?.columnKey || "field",
                    columnLabel: context?.columnLabel,
                };
            }
            return null;
        },
    }),

    unique: (existingValues?: Set<string>): ValidationRule => ({
        name: "unique",
        validate: (value: string, context?: ValidationContext) => {
            if (!value.trim()) return null;
            const normalized = value.trim().toLowerCase();
            const valueSet = existingValues || context?.existingValues || new Set();
            if (valueSet.has(normalized)) {
                return {
                    type: "error",
                    message: `${value} already exists`,
                    suggestion: "Use a unique value",
                    rowNumber: context?.rowNumber || 0,
                    columnKey: context?.columnKey || "field",
                    columnLabel: context?.columnLabel,
                };
            }
            return null;
        },
    }),

    enum: (allowedValues: string[]): ValidationRule => ({
        name: "enum",
        validate: (value: string, context?: ValidationContext) => {
            if (!value.trim()) return null;
            const normalized = value.trim().toLowerCase();
            const isValid = allowedValues.some((opt) => opt.toLowerCase() === normalized);
            if (!isValid) {
                return {
                    type: "error",
                    message: `Invalid value. Must be one of: ${allowedValues.join(", ")}`,
                    rowNumber: context?.rowNumber || 0,
                    columnKey: context?.columnKey || "field",
                    columnLabel: context?.columnLabel,
                };
            }
            return null;
        },
    }),

    minLength: (length: number): ValidationRule => ({
        name: "minLength",
        validate: (value: string, context?: ValidationContext) => {
            if (!value.trim()) return null;
            if (value.length < length) {
                return {
                    type: "error",
                    message: `Must be at least ${length} characters`,
                    rowNumber: context?.rowNumber || 0,
                    columnKey: context?.columnKey || "field",
                    columnLabel: context?.columnLabel,
                };
            }
            return null;
        },
    }),

    maxLength: (length: number): ValidationRule => ({
        name: "maxLength",
        validate: (value: string, context?: ValidationContext) => {
            if (!value.trim()) return null;
            if (value.length > length) {
                return {
                    type: "error",
                    message: `Cannot exceed ${length} characters`,
                    rowNumber: context?.rowNumber || 0,
                    columnKey: context?.columnKey || "field",
                    columnLabel: context?.columnLabel,
                };
            }
            return null;
        },
    }),
};
