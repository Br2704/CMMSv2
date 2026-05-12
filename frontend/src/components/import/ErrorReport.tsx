/**
 * Error Report Component
 * Displays and exports detailed import errors
 */

import React, { useMemo } from "react";
import { Download, Filter, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ValidationError } from "@/lib/bulk-import-validator";

export interface ErrorReportProps {
    errors: ValidationError[];
    onExport?: (format: "csv" | "json") => void;
    filterByRow?: number;
    filterByColumn?: string;
}

export const ErrorReport: React.FC<ErrorReportProps> = ({
    errors,
    onExport,
    filterByRow,
    filterByColumn,
}) => {
    const [searchTerm, setSearchTerm] = React.useState("");
    const [selectedType, setSelectedType] = React.useState<"all" | "error" | "warning">("all");

    // Filter errors based on search and type
    const filteredErrors = useMemo(() => {
        return errors.filter((error) => {
            // Filter by type
            if (selectedType !== "all" && error.type !== selectedType) return false;

            // Filter by search term
            if (searchTerm) {
                const search = searchTerm.toLowerCase();
                return (
                    error.message.toLowerCase().includes(search) ||
                    error.columnKey.toLowerCase().includes(search) ||
                    error.columnLabel?.toLowerCase().includes(search) ||
                    error.rowNumber.toString().includes(search)
                );
            }

            // Filter by row if specified
            if (filterByRow && error.rowNumber !== filterByRow) return false;

            // Filter by column if specified
            if (filterByColumn && error.columnKey !== filterByColumn) return false;

            return true;
        });
    }, [errors, searchTerm, selectedType, filterByRow, filterByColumn]);

    // Group errors by type
    const groupedByType = useMemo(() => {
        const groups: Record<string, ValidationError[]> = {
            error: [],
            warning: [],
        };

        filteredErrors.forEach((error) => {
            if (error.type === "error") {
                groups.error.push(error);
            } else {
                groups.warning.push(error);
            }
        });

        return groups;
    }, [filteredErrors]);

    // Export errors as CSV
    const exportAsCSV = () => {
        const headers = ["Row", "Column", "Type", "Message", "Suggestion"];
        const rows = filteredErrors.map((error) => [
            error.rowNumber.toString(),
            error.columnLabel || error.columnKey,
            error.type,
            error.message,
            error.suggestion || "",
        ]);

        const csv = [
            headers.map((h) => `"${h}"`).join(","),
            ...rows.map((row) =>
                row
                    .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
                    .join(",")
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

        onExport?.("csv");
    };

    // Export errors as JSON
    const exportAsJSON = () => {
        const data = {
            exportDate: new Date().toISOString(),
            totalErrors: filteredErrors.length,
            errors: filteredErrors.map((error) => ({
                row: error.rowNumber,
                column: error.columnKey,
                columnLabel: error.columnLabel,
                type: error.type,
                message: error.message,
                suggestion: error.suggestion,
            })),
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `import-errors-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        onExport?.("json");
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h3 className="font-semibold text-gray-900">Import Errors</h3>
                    <p className="text-sm text-gray-600">
                        {filteredErrors.length} of {errors.length} error{errors.length !== 1 ? "s" : ""}
                    </p>
                </div>

                {/* Export Buttons */}
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={exportAsCSV}
                        disabled={filteredErrors.length === 0}
                        className="gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Export CSV
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={exportAsJSON}
                        disabled={filteredErrors.length === 0}
                        className="gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Export JSON
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="grid gap-4">
                    {/* Search */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 block mb-2">Search</label>
                        <Input
                            placeholder="Search by message, column, or row..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-9"
                        />
                    </div>

                    {/* Type Filter */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 block mb-2">Filter by Type</label>
                        <div className="flex gap-2">
                            {(["all", "error", "warning"] as const).map((type) => (
                                <Button
                                    key={type}
                                    variant={selectedType === type ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setSelectedType(type)}
                                    className={`capitalize ${selectedType === type
                                            ? type === "error"
                                                ? "bg-red-600"
                                                : type === "warning"
                                                    ? "bg-yellow-600"
                                                    : ""
                                            : ""
                                        }`}
                                >
                                    {type}
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Error Table */}
            {filteredErrors.length > 0 ? (
                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50">
                                <TableHead className="w-20">Row</TableHead>
                                <TableHead>Column</TableHead>
                                <TableHead className="w-24">Type</TableHead>
                                <TableHead>Message</TableHead>
                                <TableHead>Suggestion</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredErrors.map((error, idx) => (
                                <TableRow
                                    key={idx}
                                    className={
                                        error.type === "error"
                                            ? "hover:bg-red-50 bg-red-50/30"
                                            : "hover:bg-yellow-50 bg-yellow-50/30"
                                    }
                                >
                                    <TableCell className="font-semibold text-gray-900">{error.rowNumber}</TableCell>
                                    <TableCell className="text-sm">
                                        <div>
                                            <p className="font-medium text-gray-900">{error.columnLabel || error.columnKey}</p>
                                            <p className="text-xs text-gray-500">{error.columnKey}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={error.type === "error" ? "destructive" : "secondary"}
                                            className="capitalize"
                                        >
                                            {error.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-gray-700">{error.message}</TableCell>
                                    <TableCell className="text-sm text-gray-600">
                                        {error.suggestion ? (
                                            <span className="text-blue-600">💡 {error.suggestion}</span>
                                        ) : (
                                            <span className="text-gray-400">—</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <div className="border border-gray-200 rounded-lg p-8 text-center">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                    <p className="text-gray-700 font-medium">No errors found</p>
                    <p className="text-sm text-gray-600">All records passed validation</p>
                </div>
            )}

            {/* Statistics */}
            {filteredErrors.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-xs text-red-600 font-medium">Critical Errors</p>
                        <p className="text-2xl font-bold text-red-900">{groupedByType.error.length}</p>
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-xs text-yellow-600 font-medium">Warnings</p>
                        <p className="text-2xl font-bold text-yellow-900">{groupedByType.warning.length}</p>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-xs text-blue-600 font-medium">Affected Rows</p>
                        <p className="text-2xl font-bold text-blue-900">
                            {new Set(filteredErrors.map((e) => e.rowNumber)).size}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ErrorReport;
