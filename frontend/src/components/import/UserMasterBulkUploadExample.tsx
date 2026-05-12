/**
 * Example Implementation: Enhanced Bulk Upload for User Management Master
 * 
 * This file demonstrates how to integrate the new bulk import system
 * into an existing master page. Use this as a template for other modules.
 */

// ============================================================================
// IMPORTS
// ============================================================================

import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// New imports for enhanced bulk upload
import { BulkImportValidator } from "@/lib/bulk-import-validator";
import { createUserBulkUploadConfig } from "@/lib/bulk-upload-configs";
import { downloadEnhancedCsvTemplate } from "@/lib/bulk-import-templates";
import useBulkImport from "@/hooks/useBulkImport";
import EnhancedFileUpload from "@/components/import/EnhancedFileUpload";
import ImportPreview from "@/components/import/ImportPreview";
import ImportProgress from "@/components/import/ImportProgress";
import ImportSummary from "@/components/import/ImportSummary";

// ============================================================================
// COMPONENT: UserMasterBulkUploadDialog
// ============================================================================

interface UserMasterBulkUploadDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: () => void;

    // Data needed for template generation
    roles: Array<{ value: string; label: string }>;
    plants: Array<{ value: string; label: string }>;
    departments: string[];
    passwordPolicy: string;

    // Existing API functions
    createUser: (data: any) => Promise<any>;
    fetchUsersData: () => Promise<void>;
}

export const UserMasterBulkUploadDialog: React.FC<UserMasterBulkUploadDialogProps> = ({
    isOpen,
    onClose,
    onImportComplete,
    roles,
    plants,
    departments,
    passwordPolicy,
    createUser,
    fetchUsersData,
}) => {
    // State management
    const [uploadTab, setUploadTab] = useState<"upload" | "preview" | "progress" | "results">("upload");
    const [downloadingTemplate, setDownloadingTemplate] = useState(false);

    // Get configuration
    const config = createUserBulkUploadConfig({
        roles,
        plants,
        departments,
        passwordPolicy,
    });

    // Initialize bulk import hook
    const {
        state,
        handleFileSelected,
        validateContent,
        executeImport,
        reset,
        exportErrorsAsCSV,
    } = useBulkImport({
        schema: config.columns,
        validator: new BulkImportValidator(),
        onImportRow: async (rowData, rowNumber) => {
            // Map CSV data to API payload
            const userData = {
                email: rowData.email,
                password: rowData.password,
                userCode: rowData.user_code,
                fullName: rowData.full_name,
                phone: rowData.phone || null,
                profileImageUrl: null,
                plantId: plants.find((p) => p.label === rowData.plant)?.value || null,
                department: rowData.department || null,
                roles: [rowData.role],
                isActive: rowData.is_active !== "false" && rowData.is_active !== "inactive" && rowData.is_active !== "no",
            };

            // Call existing API
            await createUser(userData);
        },
    });

    // Handle template download
    const handleDownloadTemplate = useCallback(async () => {
        try {
            setDownloadingTemplate(true);
            downloadEnhancedCsvTemplate(config);
            toast.success("Template downloaded");
        } catch (error: any) {
            toast.error("Failed to download template");
            console.error("Template download error:", error);
        } finally {
            setDownloadingTemplate(false);
        }
    }, [config]);

    // Handle validate and preview
    const handleValidateAndPreview = useCallback(async () => {
        try {
            const result = await validateContent();
            if (result && result.isValid) {
                setUploadTab("preview");
                toast.success("Validation passed - review and confirm");
            } else if (result) {
                setUploadTab("preview");
                toast.warning(`Validation found ${result.errors.length} error(s)`);
            }
        } catch (error: any) {
            toast.error("Validation failed: " + error.message);
        }
    }, [validateContent]);

    // Handle import confirmation
    const handleImportConfirm = useCallback(async () => {
        try {
            setUploadTab("progress");
            const result = await executeImport();

            setTimeout(() => {
                setUploadTab("results");

                if (result.successCount > 0) {
                    toast.success(`Successfully imported ${result.successCount} user(s)`);
                }

                if (result.failureCount > 0) {
                    toast.error(`${result.failureCount} user(s) failed to import`);
                }

                // Refresh user list
                fetchUsersData();
            }, 500);
        } catch (error: any) {
            toast.error("Import failed: " + error.message);
            setUploadTab("preview");
        }
    }, [executeImport, fetchUsersData]);

    // Handle close dialog
    const handleClose = useCallback(() => {
        reset();
        setUploadTab("upload");
        onClose();
    }, [reset, onClose]);

    // Handle import complete
    const handleComplete = useCallback(() => {
        onImportComplete();
        handleClose();
    }, [onImportComplete, handleClose]);

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl">Bulk User Upload</DialogTitle>
                </DialogHeader>

                <Tabs value={uploadTab} onValueChange={setUploadTab as any} className="w-full">
                    {/* ==================== TAB 1: UPLOAD ==================== */}
                    <TabsContent value="upload">
                        <div className="space-y-4">
                            <EnhancedFileUpload
                                onFileSelected={handleFileSelected}
                                acceptedFormats={[".csv", ".xls", ".xlsx"]}
                                maxSizeMB={10}
                                isLoading={state.isValidating}
                                error={
                                    state.importErrors.length > 0 && state.importErrors[0]?.message
                                        ? state.importErrors[0].message
                                        : undefined
                                }
                                success={state.validationResult?.isValid}
                                successMessage={
                                    state.validationResult?.isValid
                                        ? `${state.validationResult.validRows} valid rows found`
                                        : undefined
                                }
                                uploadHint="Download a template first to see all required fields and allowed values. The template includes helper rows with examples and reference data."
                                templateFileName="user_bulk_upload"
                                onDownloadTemplate={handleDownloadTemplate}
                            />

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-900">
                                    <strong>Tip:</strong> The template file includes:
                                </p>
                                <ul className="text-sm text-blue-800 list-disc list-inside mt-2 space-y-1">
                                    <li>Column descriptions and examples</li>
                                    <li>Helper rows with validation rules</li>
                                    <li>Reference section with allowed values</li>
                                    <li>Quick reference for roles and plants</li>
                                </ul>
                            </div>

                            {state.fileContent && (
                                <Button
                                    onClick={handleValidateAndPreview}
                                    disabled={state.isValidating}
                                    className="w-full h-12 text-base"
                                >
                                    {state.isValidating ? "Validating..." : "Validate & Preview"}
                                </Button>
                            )}

                            <div className="space-y-2 text-sm text-gray-600 bg-gray-50 p-4 rounded">
                                <p className="font-semibold">How it works:</p>
                                <ol className="list-decimal list-inside space-y-1">
                                    <li>Click "Download Template" to get the sample file</li>
                                    <li>Fill in your data (required fields marked with *)</li>
                                    <li>Upload the file here</li>
                                    <li>Review the preview before confirming</li>
                                    <li>Monitor progress as users are imported</li>
                                </ol>
                            </div>
                        </div>
                    </TabsContent>

                    {/* ==================== TAB 2: PREVIEW ==================== */}
                    {state.validationResult && (
                        <TabsContent value="preview">
                            <ImportPreview
                                validationResult={state.validationResult}
                                columnLabels={{
                                    user_code: "User Code",
                                    full_name: "Full Name",
                                    email: "Email",
                                    password: "Password",
                                    role: "Role",
                                    plant: "Plant",
                                    department: "Department",
                                    phone: "Phone",
                                    is_active: "Status",
                                }}
                                onConfirm={handleImportConfirm}
                                onCancel={() => setUploadTab("upload")}
                                isLoading={state.isImporting}
                                confirmButtonLabel="Proceed with Import"
                            />
                        </TabsContent>
                    )}

                    {/* ==================== TAB 3: PROGRESS ==================== */}
                    {state.isImporting && (
                        <TabsContent value="progress">
                            <ImportProgress
                                currentRow={state.importProgress.currentRow}
                                totalRows={state.importProgress.totalRows}
                                processedCount={
                                    state.importProgress.successCount + state.importProgress.failureCount
                                }
                                successCount={state.importProgress.successCount}
                                failureCount={state.importProgress.failureCount}
                                isProcessing={state.isImporting}
                                speed={
                                    state.importProgress.currentRow /
                                    Math.max(1, (Date.now() - (performance.now() as any)) / 1000)
                                }
                            />
                        </TabsContent>
                    )}

                    {/* ==================== TAB 4: RESULTS ==================== */}
                    {!state.isImporting && state.importProgress.totalRows > 0 && (
                        <TabsContent value="results">
                            <ImportSummary
                                successCount={state.importProgress.successCount}
                                failureCount={state.importProgress.failureCount}
                                warningCount={state.importWarnings.length}
                                totalCount={state.importProgress.totalRows}
                                errors={state.importErrors}
                                warnings={state.importWarnings}
                                successMessage={`Successfully imported ${state.importProgress.successCount} user(s)`}
                                onDownloadErrorReport={exportErrorsAsCSV}
                                onRetry={() => {
                                    reset();
                                    setUploadTab("upload");
                                }}
                                onClose={handleComplete}
                                validationResult={state.validationResult || undefined}
                            />
                        </TabsContent>
                    )}

                    {/* ==================== TAB LIST ==================== */}
                    <TabsList className="w-full mt-4">
                        <TabsTrigger value="upload" className="flex-1">
                            1. Upload
                        </TabsTrigger>
                        {state.validationResult && (
                            <TabsTrigger value="preview" className="flex-1">
                                2. Preview
                            </TabsTrigger>
                        )}
                        {state.isImporting && (
                            <TabsTrigger value="progress" className="flex-1">
                                3. Progress
                            </TabsTrigger>
                        )}
                        {!state.isImporting && state.importProgress.totalRows > 0 && (
                            <TabsTrigger value="results" className="flex-1">
                                4. Results
                            </TabsTrigger>
                        )}
                    </TabsList>
                </Tabs>

                {/* Summary Info */}
                {state.validationResult && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
                        <p className="text-gray-700">
                            <span className="font-semibold">Validation Status:</span>{" "}
                            {state.validationResult.isValid
                                ? "✓ All rows are valid"
                                : `✗ ${state.validationResult.invalidRows} row(s) have errors`}
                        </p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

// ============================================================================
// USAGE IN MASTER PAGE
// ============================================================================

/*
In your UsersMaster.tsx component:

const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);

// ... in render:

<UserMasterBulkUploadDialog
  isOpen={showBulkUploadModal}
  onClose={() => setShowBulkUploadModal(false)}
  onImportComplete={() => {
    // Refresh data, show success message, etc.
  }}
  roles={allRoles}
  plants={plantsOptions}
  departments={departments.map((d) => d.name)}
  passwordPolicy={PASSWORD_POLICY_MESSAGE}
  createUser={createUser}
  fetchUsersData={fetchUsersData}
/>

// Add button to open dialog
<Button onClick={() => setShowBulkUploadModal(true)}>
  Bulk Upload Users
</Button>
*/

export default UserMasterBulkUploadDialog;
