/**
 * Import Summary Component
 * Shows final import results and allows downloading error reports
 */

import React, { useState } from "react";
import { CheckCircle, AlertCircle, Download, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkImportValidationResult, ValidationError } from "@/lib/bulk-import-validator";

export interface ImportSummaryProps {
    successCount: number;
    failureCount: number;
    warningCount: number;
    totalCount: number;
    errors?: ValidationError[];
    warnings?: ValidationError[];
    successMessage?: string;
    onDownloadErrorReport?: () => void;
    onRetry?: () => void;
    onClose?: () => void;
    validationResult?: BulkImportValidationResult;
}

export const ImportSummary: React.FC<ImportSummaryProps> = ({
    successCount,
    failureCount,
    warningCount,
    totalCount,
    errors = [],
    warnings = [],
    successMessage = "Data imported successfully",
    onDownloadErrorReport,
    onRetry,
    onClose,
    validationResult,
}) => {
    const [copied, setCopied] = useState(false);
    const isSuccess = failureCount === 0;
    const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

    const handleCopyErrors = async () => {
        const errorText = errors
            .map((e) => `Row ${e.rowNumber}, ${e.columnLabel || e.columnKey}: ${e.message}`)
            .join("\n");
        await navigator.clipboard.writeText(errorText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-6">
            {/* Status Header */}
            <div className={`rounded-lg border-2 p-6 ${isSuccess ? "bg-green-50 border-green-300" : "bg-orange-50 border-orange-300"}`}>
                <div className="flex items-center gap-4">
                    {isSuccess ? (
                        <CheckCircle className="w-12 h-12 text-green-600 flex-shrink-0" />
                    ) : (
                        <AlertCircle className="w-12 h-12 text-orange-600 flex-shrink-0" />
                    )}

                    <div className="flex-1">
                        <h2 className={`text-2xl font-bold ${isSuccess ? "text-green-900" : "text-orange-900"}`}>
                            {isSuccess ? "Import Completed Successfully" : "Import Completed with Issues"}
                        </h2>
                        <p className={`text-sm ${isSuccess ? "text-green-700" : "text-orange-700"}`}>
                            {successMessage}
                        </p>
                    </div>
                </div>
            </div>

            {/* Statistics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-600 font-medium">Total Records</p>
                    <p className="text-3xl font-bold text-blue-900">{totalCount}</p>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-600 font-medium">Successful</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-bold text-green-900">{successCount}</p>
                        <p className="text-sm text-green-700">({successRate}%)</p>
                    </div>
                </div>

                {failureCount > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-sm text-red-600 font-medium">Failed</p>
                        <p className="text-3xl font-bold text-red-900">{failureCount}</p>
                    </div>
                )}

                {warningCount > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-sm text-yellow-600 font-medium">Warnings</p>
                        <p className="text-3xl font-bold text-yellow-900">{warningCount}</p>
                    </div>
                )}
            </div>

            {/* Tabs for Details */}
            {(errors.length > 0 || warnings.length > 0) && (
                <Tabs defaultValue={errors.length > 0 ? "errors" : "warnings"} className="w-full">
                    <TabsList>
                        {errors.length > 0 && (
                            <TabsTrigger value="errors">
                                <AlertCircle className="w-4 h-4 mr-2 text-red-600" />
                                Errors ({errors.length})
                            </TabsTrigger>
                        )}
                        {warnings.length > 0 && (
                            <TabsTrigger value="warnings">
                                <AlertCircle className="w-4 h-4 mr-2 text-yellow-600" />
                                Warnings ({warnings.length})
                            </TabsTrigger>
                        )}
                    </TabsList>

                    {/* Errors Tab */}
                    {errors.length > 0 && (
                        <TabsContent value="errors" className="space-y-3 mt-4">
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {errors.slice(0, 20).map((error, idx) => (
                                    <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                                        <div className="flex items-start gap-2">
                                            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="font-medium text-red-900">Row {error.rowNumber}</p>
                                                    <Badge variant="secondary" className="text-xs">
                                                        {error.columnLabel || error.columnKey}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-red-700 mt-1">{error.message}</p>
                                                {error.suggestion && (
                                                    <p className="text-sm text-red-600 mt-1">💡 {error.suggestion}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {errors.length > 20 && (
                                <p className="text-sm text-gray-600 text-center py-2">
                                    ... and {errors.length - 20} more errors (download full report below)
                                </p>
                            )}
                        </TabsContent>
                    )}

                    {/* Warnings Tab */}
                    {warnings.length > 0 && (
                        <TabsContent value="warnings" className="space-y-3 mt-4">
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {warnings.slice(0, 20).map((warning, idx) => (
                                    <div key={idx} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                        <div className="flex items-start gap-2">
                                            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="font-medium text-yellow-900">Row {warning.rowNumber}</p>
                                                    <Badge variant="secondary" className="text-xs">
                                                        {warning.columnLabel || warning.columnKey}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-yellow-700 mt-1">{warning.message}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {warnings.length > 20 && (
                                <p className="text-sm text-gray-600 text-center py-2">
                                    ... and {warnings.length - 20} more warnings
                                </p>
                            )}
                        </TabsContent>
                    )}
                </Tabs>
            )}

            {/* Success Message */}
            {isSuccess && successCount > 0 && (
                <Alert className="bg-green-50 border-green-200 text-green-800">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription>
                        All {successCount} record{successCount !== 1 ? "s" : ""} imported successfully!
                    </AlertDescription>
                </Alert>
            )}

            {/* Download Error Report Section */}
            {failureCount > 0 && (
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 space-y-3">
                    <p className="font-medium text-red-900">Failed Records Details</p>
                    <p className="text-sm text-red-700">
                        {failureCount} record{failureCount !== 1 ? "s" : ""} could not be imported. Download the error report for detailed information on each failure.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                        {onDownloadErrorReport && (
                            <Button
                                variant="outline"
                                onClick={onDownloadErrorReport}
                                className="gap-2 border-red-300 text-red-600 hover:text-red-700"
                            >
                                <Download className="w-4 h-4" />
                                Download Error Report (CSV)
                            </Button>
                        )}
                        {errors.length > 0 && (
                            <Button
                                variant="outline"
                                onClick={handleCopyErrors}
                                className="gap-2"
                            >
                                <Copy className="w-4 h-4" />
                                {copied ? "Copied!" : "Copy Errors"}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Validation Summary Report */}
            {validationResult && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="font-medium text-gray-900 mb-3">Validation Summary</p>
                    <div className="text-sm space-y-2 font-mono text-gray-700">
                        <p>Total Rows: {validationResult.totalRows}</p>
                        <p>Valid Rows: {validationResult.validRows}</p>
                        <p>Invalid Rows: {validationResult.invalidRows}</p>
                        <p>Total Errors: {validationResult.errors.length}</p>
                        <p>Total Warnings: {validationResult.warnings.length}</p>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-between pt-4 border-t">
                {onRetry && failureCount > 0 && (
                    <Button
                        variant="outline"
                        onClick={onRetry}
                        className="gap-2"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Retry Failed Records
                    </Button>
                )}

                <div className="flex gap-2 ml-auto">
                    {onClose && (
                        <Button
                            variant="outline"
                            onClick={onClose}
                        >
                            Close
                        </Button>
                    )}
                </div>
            </div>

            {/* Next Steps */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="font-medium text-blue-900 mb-2">Next Steps:</p>
                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                    {failureCount > 0 && <li>Review and fix failed records using the error report</li>}
                    {failureCount > 0 && <li>Retry the import with corrected data</li>}
                    {successCount > 0 && <li>Verify the imported data in the master list</li>}
                    <li>Monitor the system for any related alerts or issues</li>
                </ul>
            </div>
        </div>
    );
};

export default ImportSummary;
