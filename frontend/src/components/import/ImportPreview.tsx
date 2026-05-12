/**
 * Import Preview Component
 * Shows parsed CSV data with validation status before import
 */

import React, { useMemo } from "react";
import { AlertCircle, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkImportValidationResult, RowValidationResult } from "@/lib/bulk-import-validator";

export interface ImportPreviewProps {
    validationResult: BulkImportValidationResult;
    columnLabels: Record<string, string>;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading?: boolean;
    confirmButtonLabel?: string;
}

export const ImportPreview: React.FC<ImportPreviewProps> = ({
    validationResult,
    columnLabels,
    onConfirm,
    onCancel,
    isLoading,
    confirmButtonLabel = "Import Data",
}) => {
    const [expandedRows, setExpandedRows] = React.useState<Set<number>>(new Set());

    const toggleRowExpand = (rowNumber: number) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(rowNumber)) {
            newExpanded.delete(rowNumber);
        } else {
            newExpanded.add(rowNumber);
        }
        setExpandedRows(newExpanded);
    };

    const validRows = useMemo(() => validationResult.rowResults.filter((r) => r.isValid), [validationResult]);
    const invalidRows = useMemo(() => validationResult.rowResults.filter((r) => !r.isValid), [validationResult]);

    const rowsToShow = validationResult.isValid ? validRows : validationResult.rowResults;

    return (
        <div className="space-y-6">
            {/* Status Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="text-sm text-blue-600 font-medium">Total Rows</div>
                    <div className="text-2xl font-bold text-blue-900">{validationResult.totalRows}</div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-sm text-green-600 font-medium">Valid Rows</div>
                    <div className="text-2xl font-bold text-green-900">{validationResult.validRows}</div>
                </div>

                <div
                    className={`${invalidRows.length > 0 ? "bg-red-50 border border-red-200" : "bg-gray-50 border border-gray-200"} rounded-lg p-4`}
                >
                    <div className={`text-sm font-medium ${invalidRows.length > 0 ? "text-red-600" : "text-gray-600"}`}>Invalid Rows</div>
                    <div className={`text-2xl font-bold ${invalidRows.length > 0 ? "text-red-900" : "text-gray-900"}`}>
                        {validationResult.invalidRows}
                    </div>
                </div>

                <div className={`${validationResult.warnings.length > 0 ? "bg-yellow-50 border border-yellow-200" : "bg-gray-50 border border-gray-200"} rounded-lg p-4`}>
                    <div className={`text-sm font-medium ${validationResult.warnings.length > 0 ? "text-yellow-600" : "text-gray-600"}`}>Warnings</div>
                    <div className={`text-2xl font-bold ${validationResult.warnings.length > 0 ? "text-yellow-900" : "text-gray-900"}`}>
                        {validationResult.warnings.length}
                    </div>
                </div>
            </div>

            {/* Tabs for different views */}
            <Tabs defaultValue={validationResult.isValid ? "valid" : "invalid"} className="w-full">
                <TabsList>
                    <TabsTrigger value="valid">
                        <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                        Valid Rows ({validationResult.validRows})
                    </TabsTrigger>
                    {invalidRows.length > 0 && (
                        <TabsTrigger value="invalid">
                            <AlertCircle className="w-4 h-4 mr-2 text-red-600" />
                            Issues ({validationResult.invalidRows})
                        </TabsTrigger>
                    )}
                    {validationResult.warnings.length > 0 && (
                        <TabsTrigger value="warnings">
                            <AlertTriangle className="w-4 h-4 mr-2 text-yellow-600" />
                            Warnings ({validationResult.warnings.length})
                        </TabsTrigger>
                    )}
                </TabsList>

                {/* Valid Rows Tab */}
                <TabsContent value="valid" className="space-y-4">
                    <div className="rounded-lg border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-green-50">
                                    <TableHead className="w-12">Row</TableHead>
                                    <TableHead>Status</TableHead>
                                    {Object.entries(columnLabels)
                                        .slice(0, 5)
                                        .map(([key, label]) => (
                                            <TableHead key={key} className="max-w-xs">
                                                {label}
                                            </TableHead>
                                        ))}
                                    {Object.keys(columnLabels).length > 5 && <TableHead>...</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {validRows.map((row) => (
                                    <TableRow key={row.rowNumber} className="hover:bg-green-50">
                                        <TableCell className="font-medium text-green-600">{row.rowNumber}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                ✓ Valid
                                            </Badge>
                                        </TableCell>
                                        {Object.entries(columnLabels)
                                            .slice(0, 5)
                                            .map(([key]) => (
                                                <TableCell key={key} className="max-w-xs truncate text-sm">
                                                    {row.data?.[key] || "-"}
                                                </TableCell>
                                            ))}
                                        {Object.keys(columnLabels).length > 5 && <TableCell>+{Object.keys(columnLabels).length - 5}</TableCell>}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                {/* Invalid Rows Tab */}
                {invalidRows.length > 0 && (
                    <TabsContent value="invalid" className="space-y-4">
                        <div className="space-y-3">
                            {invalidRows.map((row) => (
                                <div key={row.rowNumber} className="border border-red-200 rounded-lg bg-red-50">
                                    <button
                                        onClick={() => toggleRowExpand(row.rowNumber)}
                                        className="w-full p-4 flex items-center justify-between hover:bg-red-100 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 flex-1 text-left">
                                            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                                            <div>
                                                <div className="font-medium text-red-900">Row {row.rowNumber}</div>
                                                <div className="text-sm text-red-700">{row.errors.length} error(s)</div>
                                            </div>
                                        </div>
                                        {expandedRows.has(row.rowNumber) ? (
                                            <ChevronUp className="w-5 h-5 text-red-600" />
                                        ) : (
                                            <ChevronDown className="w-5 h-5 text-red-600" />
                                        )}
                                    </button>

                                    {expandedRows.has(row.rowNumber) && (
                                        <div className="border-t border-red-200 p-4 space-y-3">
                                            <div className="space-y-2">
                                                {row.errors.map((error, idx) => (
                                                    <div key={idx} className="bg-white border border-red-200 rounded p-3 space-y-2">
                                                        <div className="flex items-start gap-2">
                                                            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                                                            <div>
                                                                <p className="font-medium text-red-900">{error.columnLabel || error.columnKey}</p>
                                                                <p className="text-sm text-red-700">{error.message}</p>
                                                                {error.suggestion && (
                                                                    <p className="text-sm text-red-600 mt-1">💡 Suggestion: {error.suggestion}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Show preview of row data */}
                                            <div className="bg-white rounded p-3 border border-gray-200">
                                                <p className="text-sm font-medium text-gray-700 mb-2">Row Data Preview:</p>
                                                <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                                                    {Object.entries(row.data || {})
                                                        .slice(0, 5)
                                                        .map(([key, value]) => (
                                                            <div key={key} className="flex gap-2">
                                                                <span className="text-gray-600 font-medium min-w-24">{columnLabels[key] || key}:</span>
                                                                <span className="text-gray-900 truncate">{value || "(empty)"}</span>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                )}

                {/* Warnings Tab */}
                {validationResult.warnings.length > 0 && (
                    <TabsContent value="warnings" className="space-y-4">
                        <div className="space-y-3">
                            {validationResult.warnings.map((warning, idx) => (
                                <div key={idx} className="border border-yellow-200 rounded-lg bg-yellow-50 p-4 flex gap-3">
                                    <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <div className="font-medium text-yellow-900">
                                            Row {warning.rowNumber}, {warning.columnLabel || warning.columnKey}
                                        </div>
                                        <p className="text-sm text-yellow-700 mt-1">{warning.message}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                )}
            </Tabs>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end pt-4 border-t">
                <Button variant="outline" onClick={onCancel} disabled={isLoading}>
                    Cancel
                </Button>
                <Button
                    onClick={onConfirm}
                    disabled={!validationResult.isValid || isLoading}
                    className={validationResult.isValid ? "bg-green-600 hover:bg-green-700" : ""}
                >
                    {isLoading ? "Importing..." : confirmButtonLabel}
                </Button>
            </div>

            {/* Status Message */}
            {!validationResult.isValid && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium text-red-900">Cannot import with errors</p>
                        <p className="text-sm text-red-700">Please fix the validation errors above before proceeding</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImportPreview;
