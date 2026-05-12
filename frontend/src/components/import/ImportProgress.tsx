/**
 * Import Progress Component
 * Shows real-time progress tracking during bulk import
 */

import React from "react";
import { Loader2, CheckCircle, AlertCircle, Pause, Play } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface ImportProgressItem {
    id: string;
    label: string;
    status: "pending" | "processing" | "completed" | "error";
    message?: string;
    errorMessage?: string;
}

export interface ImportProgressProps {
    currentRow: number;
    totalRows: number;
    processedCount: number;
    successCount: number;
    failureCount: number;
    isProcessing: boolean;
    isPaused?: boolean;
    speed?: number;
    estimatedTimeRemaining?: number;
    items?: ImportProgressItem[];
    onPause?: () => void;
    onResume?: () => void;
    onCancel?: () => void;
}

export const ImportProgress: React.FC<ImportProgressProps> = ({
    currentRow,
    totalRows,
    processedCount,
    successCount,
    failureCount,
    isProcessing,
    isPaused = false,
    speed = 0,
    estimatedTimeRemaining,
    items = [],
    onPause,
    onResume,
    onCancel,
}) => {
    const progressPercent = totalRows > 0 ? Math.round((currentRow / totalRows) * 100) : 0;
    const isComplete = currentRow >= totalRows && !isProcessing;

    const formatTime = (seconds: number): string => {
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}m ${secs}s`;
    };

    return (
        <div className="space-y-6">
            {/* Main Progress Bar */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 space-y-4">
                {/* Status Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {isComplete ? (
                            <CheckCircle className="w-6 h-6 text-green-600" />
                        ) : isProcessing || isPaused ? (
                            <Loader2 className={`w-6 h-6 text-blue-600 ${!isPaused ? "animate-spin" : ""}`} />
                        ) : (
                            <AlertCircle className="w-6 h-6 text-orange-600" />
                        )}
                        <div>
                            <p className="font-semibold text-gray-900">
                                {isComplete ? "Import Complete" : isPaused ? "Paused" : isProcessing ? "Importing..." : "Ready"}
                            </p>
                            <p className="text-sm text-gray-600">
                                Row {currentRow} of {totalRows}
                            </p>
                        </div>
                    </div>

                    {/* Control Buttons */}
                    <div className="flex gap-2">
                        {isProcessing && !isPaused && onPause && (
                            <Button variant="outline" size="sm" onClick={onPause} className="gap-2">
                                <Pause className="w-4 h-4" />
                                Pause
                            </Button>
                        )}
                        {isPaused && onResume && (
                            <Button variant="outline" size="sm" onClick={onResume} className="gap-2">
                                <Play className="w-4 h-4" />
                                Resume
                            </Button>
                        )}
                        {(isProcessing || isPaused) && onCancel && (
                            <Button variant="outline" size="sm" onClick={onCancel} className="gap-2 text-red-600 hover:text-red-700">
                                Cancel
                            </Button>
                        )}
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Progress</span>
                        <span className="font-semibold text-gray-900">{progressPercent}%</span>
                    </div>
                    <Progress value={progressPercent} className="h-3" />
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                    <div className="bg-white rounded border border-gray-200 p-3">
                        <p className="text-xs text-gray-600 font-medium">Processed</p>
                        <p className="text-lg font-bold text-gray-900">{processedCount}</p>
                    </div>

                    <div className="bg-white rounded border border-green-200 p-3">
                        <p className="text-xs text-green-600 font-medium">Successful</p>
                        <p className="text-lg font-bold text-green-700">{successCount}</p>
                    </div>

                    <div className={`bg-white rounded border p-3 ${failureCount > 0 ? "border-red-200" : "border-gray-200"}`}>
                        <p className={`text-xs font-medium ${failureCount > 0 ? "text-red-600" : "text-gray-600"}`}>Failed</p>
                        <p className={`text-lg font-bold ${failureCount > 0 ? "text-red-700" : "text-gray-900"}`}>{failureCount}</p>
                    </div>

                    <div className="bg-white rounded border border-gray-200 p-3">
                        <p className="text-xs text-gray-600 font-medium">Speed</p>
                        <p className="text-lg font-bold text-gray-900">{speed.toFixed(1)} row/s</p>
                    </div>
                </div>

                {/* Estimated Time */}
                {estimatedTimeRemaining !== undefined && estimatedTimeRemaining > 0 && !isComplete && (
                    <div className="bg-blue-100 border border-blue-300 rounded p-3 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        <p className="text-sm text-blue-900">
                            Estimated time remaining: <span className="font-semibold">{formatTime(Math.ceil(estimatedTimeRemaining))}</span>
                        </p>
                    </div>
                )}
            </div>

            {/* Items List (if provided) */}
            {items.length > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Detailed Progress:</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {items.map((item) => (
                            <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded border border-gray-200">
                                {item.status === "processing" && (
                                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0 mt-0.5" />
                                )}
                                {item.status === "completed" && (
                                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                )}
                                {item.status === "error" && (
                                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                )}
                                {item.status === "pending" && (
                                    <div className="w-5 h-5 border-2 border-gray-300 rounded-full flex-shrink-0 mt-0.5" />
                                )}

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-gray-900">{item.label}</p>
                                        <Badge
                                            variant={
                                                item.status === "completed"
                                                    ? "outline"
                                                    : item.status === "error"
                                                        ? "destructive"
                                                        : "secondary"
                                            }
                                        >
                                            {item.status}
                                        </Badge>
                                    </div>
                                    {item.message && <p className="text-sm text-gray-600 mt-1">{item.message}</p>}
                                    {item.errorMessage && <p className="text-sm text-red-600 mt-1">Error: {item.errorMessage}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Speed and Performance Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 mb-2">Import Performance:</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                        <p className="text-blue-700">Speed: <span className="font-semibold">{speed.toFixed(2)} rows/sec</span></p>
                    </div>
                    <div>
                        <p className="text-blue-700">Success Rate: <span className="font-semibold">{successCount + failureCount > 0 ? Math.round((successCount / (successCount + failureCount)) * 100) : 0}%</span></p>
                    </div>
                    {estimatedTimeRemaining !== undefined && (
                        <div>
                            <p className="text-blue-700">Elapsed: <span className="font-semibold">{formatTime(Math.ceil(currentRow / (speed || 1)))}</span></p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportProgress;
