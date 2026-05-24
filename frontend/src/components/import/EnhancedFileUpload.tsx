/**
 * Enhanced File Upload Component
 * Modern drag-and-drop uploader with file validation
 */

import React, { useRef, useState } from "react";
import { Upload, FileUp, AlertCircle, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

export interface EnhancedFileUploadProps {
    onFileSelected: (file: File) => void;
    acceptedFormats?: string[];
    maxSizeMB?: number;
    isLoading?: boolean;
    error?: string;
    success?: boolean;
    successMessage?: string;
    uploadHint?: string;
    templateFileName?: string;
    onDownloadTemplate?: () => void;
}

export const EnhancedFileUpload: React.FC<EnhancedFileUploadProps> = ({
    onFileSelected,
    acceptedFormats = [".csv", ".xls", ".xlsx"],
    maxSizeMB = 10,
    isLoading = false,
    error,
    success,
    successMessage,
    uploadHint,
    templateFileName,
    onDownloadTemplate,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragActive, setIsDragActive] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [validationError, setValidationError] = useState<string>("");

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(e.type === "dragenter" || e.type === "dragover");
    };

    const validateFile = (file: File): string | null => {
        // Check file size
        if (file.size > maxSizeMB * 1024 * 1024) {
            return `File size must be under ${maxSizeMB}MB`;
        }

        // Check file type
        const fileName = file.name.toLowerCase();
        const hasValidExtension = acceptedFormats.some((format) => fileName.endsWith(format.toLowerCase()));
        if (!hasValidExtension) {
            return `Invalid file format. Accepted: ${acceptedFormats.join(", ")}`;
        }

        return null;
    };

    const handleDrop = (e: React.DragEvent) => {
        handleDrag(e);
        setIsDragActive(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    };

    const handleFile = (file: File) => {
        const validation = validateFile(file);
        if (validation) {
            setValidationError(validation);
            setSelectedFile(null);
            return;
        }

        setValidationError("");
        setSelectedFile(file);
        onFileSelected(file);
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const handleRemoveFile = () => {
        setSelectedFile(null);
        setValidationError("");
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    return (
        <div className="space-y-4">
            {/* Main Upload Area */}
            <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={handleClick}
                className={`relative border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer ${isDragActive
                        ? "border-blue-500 bg-blue-50"
                        : error || validationError
                            ? "border-red-300 bg-red-50"
                            : success
                                ? "border-green-300 bg-green-50"
                                : "border-gray-300 bg-gray-50 hover:border-gray-400"
                    }`}
            >
                <input id="file-upload" name="fileUpload" ref={fileInputRef} type="file" onChange={handleInputChange} className="hidden" accept={acceptedFormats.join(",")} />

                <div className="flex flex-col items-center justify-center gap-3">
                    {isLoading ? (
                        <Upload className="w-12 h-12 text-blue-500 " />
                    ) : success ? (
                        <CheckCircle className="w-12 h-12 text-green-500" />
                    ) : error || validationError ? (
                        <AlertCircle className="w-12 h-12 text-red-500" />
                    ) : (
                        <>
                            <Upload className="w-12 h-12 text-gray-400" />
                            <FileUp className="w-6 h-6 text-gray-400 absolute top-4 right-4" />
                        </>
                    )}

                    <div className="text-center">
                        <p className="text-lg font-semibold text-gray-700">
                            {isLoading ? "Uploading..." : success ? "File uploaded successfully" : "Drop your CSV or Excel file here"}
                        </p>
                        <p className="text-sm text-gray-500">or click to browse</p>
                    </div>

                    {!isLoading && !success && (
                        <p className="text-xs text-gray-500">
                            Accepted formats: {acceptedFormats.join(", ")} (max {maxSizeMB}MB)
                        </p>
                    )}
                </div>
            </div>

            {/* File Selected Display */}
            {selectedFile && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1">
                            <FileUp className="w-5 h-5 text-blue-600" />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-blue-900 truncate">{selectedFile.name}</p>
                                <p className="text-sm text-blue-700">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                            </div>
                        </div>
                        {!isLoading && (
                            <Button variant="ghost" size="sm" onClick={handleRemoveFile} className="text-blue-600 hover:text-blue-700">
                                <X className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Error Display */}
            {(error || validationError) && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error || validationError}</AlertDescription>
                </Alert>
            )}

            {/* Success Display */}
            {success && successMessage && (
                <Alert variant="default" className="bg-green-50 border-green-200 text-green-800">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription>{successMessage}</AlertDescription>
                </Alert>
            )}

            {/* Help Text */}
            {uploadHint && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded p-3">💡 {uploadHint}</p>
            )}

            {/* Download Template Button */}
            {onDownloadTemplate && templateFileName && (
                <Button
                    variant="outline"
                    onClick={onDownloadTemplate}
                    className="w-full"
                    disabled={isLoading}
                >
                    <Upload className="w-4 h-4 mr-2" />
                    Download {templateFileName} Template
                </Button>
            )}
        </div>
    );
};

export default EnhancedFileUpload;
