/**
 * useBulkImport Hook
 * Centralized hook for managing bulk import workflow across all modules
 */

import { useCallback, useState, useRef } from "react";
import { BulkImportValidator, BulkImportValidationResult, ValidationError, RowValidationResult } from "@/lib/bulk-import-validator";
import { parseCsvRows } from "@/lib/import-template";

export interface BulkImportState {
    // File handling
    file: File | null;
    fileContent: string | null;

    // Validation
    validationResult: BulkImportValidationResult | null;
    isValidating: boolean;

    // Import progress
    isImporting: boolean;
    importProgress: {
        currentRow: number;
        totalRows: number;
        successCount: number;
        failureCount: number;
    };

    // Results
    importErrors: ValidationError[];
    importWarnings: ValidationError[];
}

export interface BulkImportConfig {
    schema: Array<{
        key: string;
        label: string;
        required?: boolean;
        type?: string;
    }>;
    onImportRow?: (rowData: Record<string, string>, rowNumber: number) => Promise<void>;
    validator?: BulkImportValidator;
    maxFileSize?: number; // in MB
}

export const useBulkImport = (config: BulkImportConfig) => {
    const [state, setState] = useState<BulkImportState>({
        file: null,
        fileContent: null,
        validationResult: null,
        isValidating: false,
        isImporting: false,
        importProgress: {
            currentRow: 0,
            totalRows: 0,
            successCount: 0,
            failureCount: 0,
        },
        importErrors: [],
        importWarnings: [],
    });

    const validatorRef = useRef(config.validator || new BulkImportValidator());

    /**
     * Handle file selection
     */
    const handleFileSelected = useCallback(async (file: File) => {
        setState((prev) => ({
            ...prev,
            file,
            fileContent: null,
            validationResult: null,
            importErrors: [],
            importWarnings: [],
        }));

        try {
            const content = await file.text();
            setState((prev) => ({
                ...prev,
                fileContent: content,
            }));
        } catch (error) {
            if (import.meta.env.DEV) console.error("Failed to read file:", error);
            setState((prev) => ({
                ...prev,
                importErrors: [
                    {
                        type: "error",
                        message: "Failed to read file",
                        rowNumber: 0,
                        columnKey: "file",
                    },
                ],
            }));
        }
    }, []);

    /**
     * Parse and validate CSV content
     */
    const validateContent = useCallback(async () => {
        if (!state.fileContent) return null;

        setState((prev) => ({
            ...prev,
            isValidating: true,
        }));

        try {
            const rows = parseCsvRows(state.fileContent);

            if (rows.length === 0) {
                throw new Error("CSV file is empty");
            }

            // First row is header, skip it
            const dataRows = rows.slice(1).map((row) => {
                const data: Record<string, string> = {};
                config.schema.forEach((col, idx) => {
                    data[col.key] = row[idx] || "";
                });
                return data;
            });

            const result = validatorRef.current.validateRows(dataRows, config.schema);

            setState((prev) => ({
                ...prev,
                validationResult: result,
                isValidating: false,
                importErrors: result.errors,
                importWarnings: result.warnings,
            }));

            return result;
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : "Validation failed";
            setState((prev) => ({
                ...prev,
                isValidating: false,
                importErrors: [
                    {
                        type: "error",
                        message: errorMessage,
                        rowNumber: 0,
                        columnKey: "file",
                    },
                ],
            }));
            return null;
        }
    }, [state.fileContent, config.schema]);

    /**
     * Execute the import
     */
    const executeImport = useCallback(async () => {
        if (!state.validationResult || !state.validationResult.isValid) {
            throw new Error("Validation must pass before importing");
        }

        setState((prev) => ({
            ...prev,
            isImporting: true,
            importProgress: {
                currentRow: 0,
                totalRows: state.validationResult?.totalRows || 0,
                successCount: 0,
                failureCount: 0,
            },
        }));

        const errors: ValidationError[] = [];
        let successCount = 0;
        let failureCount = 0;

        try {
            for (const result of state.validationResult.rowResults) {
                if (!result.isValid) continue;

                try {
                    if (config.onImportRow) {
                        await config.onImportRow(result.data || {}, result.rowNumber);
                    }
                    successCount++;
                } catch (error: any) {
                    failureCount++;
                    errors.push({
                        type: "error",
                        message: error instanceof Error ? error.message : "Import failed",
                        rowNumber: result.rowNumber,
                        columnKey: "import",
                    });
                }

                // Update progress
                setState((prev) => ({
                    ...prev,
                    importProgress: {
                        ...prev.importProgress,
                        currentRow: result.rowNumber,
                        successCount,
                        failureCount,
                    },
                }));
            }
        } finally {
            setState((prev) => ({
                ...prev,
                isImporting: false,
                importErrors: errors,
            }));
        }

        return {
            successCount,
            failureCount,
            errors,
        };
    }, [state.validationResult, config]);

    /**
     * Reset the import state
     */
    const reset = useCallback(() => {
        setState({
            file: null,
            fileContent: null,
            validationResult: null,
            isValidating: false,
            isImporting: false,
            importProgress: {
                currentRow: 0,
                totalRows: 0,
                successCount: 0,
                failureCount: 0,
            },
            importErrors: [],
            importWarnings: [],
        });
    }, []);

    /**
     * Export errors as CSV
     */
    const exportErrorsAsCSV = useCallback(() => {
        const errors = state.importErrors;
        if (errors.length === 0) return;

        const headers = ["Row", "Column", "Type", "Message", "Suggestion"];
        const rows = errors.map((error) => [
            error.rowNumber.toString(),
            error.columnLabel || error.columnKey,
            error.type,
            error.message,
            error.suggestion || "",
        ]);

        const csv = [
            headers.map((h) => `"${h}"`).join(","),
            ...rows.map((row) =>
                row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
            ),
        ].join("\n");

        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `import-errors-${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [state.importErrors]);

    /**
     * Export validation result as CSV
     */
    const exportValidationResultAsCSV = useCallback(() => {
        if (!state.validationResult) return;

        const csv = validatorRef.current.exportErrorsAsCsv(state.validationResult);
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `validation-result-${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [state.validationResult]);

    return {
        // State
        state,

        // File handling
        handleFileSelected,

        // Validation
        validateContent,

        // Import
        executeImport,

        // Utilities
        reset,
        exportErrorsAsCSV,
        exportValidationResultAsCSV,
    };
};

export default useBulkImport;
