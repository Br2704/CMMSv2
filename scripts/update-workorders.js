const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'frontend', 'src', 'pages', 'WorkOrders.tsx');
let c = fs.readFileSync(filePath, 'utf8');

// =============================================
// 1. Replace Machine Selection SelectFields with SearchableSelect
// =============================================

// Replace Plant SelectField
c = c.replace(
  `              <SelectField
                label="Plant"
                value={formData.plant_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, plant_id: value, department_id: "", module_id: "", asset_id: "" }))}
                options={plantOptions}
                placeholder={userIsSuperAdmin ? "Select plant" : "Assigned plant"}
                disabled={!userIsSuperAdmin || plantOptions.length === 0}
                required
              />`,
  `              <SearchableSelect
                label="Plant"
                value={formData.plant_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, plant_id: value, department_id: "", module_id: "", asset_id: "" }))}
                options={plantOptions}
                placeholder={userIsSuperAdmin ? "Search plants..." : "Assigned plant"}
                disabled={!userIsSuperAdmin || plantOptions.length === 0}
                required
              />`
);

// Replace Department SelectField
c = c.replace(
  `              <SelectField
                label="Department"
                value={formData.department_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, department_id: value, module_id: "", asset_id: "" }))}
                options={departmentsForPlant.map((department: Department) => ({
                  value: department.id,
                  label: \`\${department.code} - \${department.name}\`,
                }))}
                placeholder={formData.plant_id ? "Select department" : "Select plant first"}
                disabled={!formData.plant_id}
                required
              />`,
  `              <SearchableSelect
                label="Department"
                value={formData.department_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, department_id: value, module_id: "", asset_id: "" }))}
                options={departmentsForPlant.map((department: Department) => ({
                  value: department.id,
                  label: \`\${department.code} - \${department.name}\`,
                }))}
                placeholder={formData.plant_id ? "Search departments..." : "Select plant first"}
                disabled={!formData.plant_id}
                required
              />`
);

// Replace Module SelectField
c = c.replace(
  `              <SelectField
                label="Module"
                value={formData.module_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, module_id: value, asset_id: "" }))}
                options={modulesForScope.map((module: MachineModule) => ({
                  value: module.id,
                  label: \`\${module.code ? \`\${module.code} - \` : ""}\${module.name}\`,
                }))}
                placeholder={formData.department_id ? "Select module" : "Select department first"}
                disabled={!formData.department_id}
                required
              />`,
  `              <SearchableSelect
                label="Module"
                value={formData.module_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, module_id: value, asset_id: "" }))}
                options={modulesForScope.map((module: MachineModule) => ({
                  value: module.id,
                  label: \`\${module.code ? \`\${module.code} - \` : ""}\${module.name}\`,
                }))}
                placeholder={formData.department_id ? "Search modules..." : "Select department first"}
                disabled={!formData.department_id}
                required
              />`
);

// Replace Machine SelectField
c = c.replace(
  `              <SelectField
                label="Machine"
                value={formData.asset_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, asset_id: value }))}
                options={assetOptions}
                placeholder={formData.module_id ? "Select machine" : "Select module first"}
                disabled={!formData.module_id || assetOptions.length === 0}
                required
              />`,
  `              <SearchableSelect
                label="Machine"
                value={formData.asset_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, asset_id: value }))}
                options={assetOptions}
                placeholder={formData.module_id ? "Search machines..." : "Select module first"}
                disabled={!formData.module_id || assetOptions.length === 0}
                required
              />`
);

// =============================================
// 2. Replace SpareUsageEditor with MaterialsUsageEditor in close form
// =============================================

c = c.replace(
  `                  <SpareUsageEditor`,
  `                  <MaterialsUsageEditor`
);

c = c.replace(
  `                  </SpareUsageEditor>`,
  `                  </MaterialsUsageEditor>`
);

// Update the SpareUsageEditor props to MaterialsUsageEditor props
c = c.replace(
  `closeSpareUsage={closeSpareUsage}
                    onSpareChange={setCloseSpareUsage}
                    spareOptions={closeSpareOptions}`,
  `spareRows={closeSpareUsage.map((row: MaterialDraft) => ({ ...row, isManual: row.category !== "SPARE" }))}
                    onSpareChange={setCloseSpareUsage}
                    spareOptions={closeSpareOptions}`
);

// =============================================
// 3. Enhance manual verification dialog with machine search
// =============================================

// Add machine search state after existing state declarations
c = c.replace(
  `const [manualMachineCode, setManualMachineCode] = useState("");`,
  `const [manualMachineCode, setManualMachineCode] = useState("");
  const [manualMachineSearchResults, setManualMachineSearchResults] = useState<Array<{ value: string; label: string }>>([]);
  const [isSearchingMachine, setIsSearchingMachine] = useState(false);`
);

// Update the confirmManualVerification function to use machine search
c = c.replace(
  `const confirmManualVerification = () => {
    if (!verifyTargetWO) return;
    const manualCode = (manualMachineCode || "").trim();
    if (!manualCode) {
      toast.error("Enter the assigned machine code to continue");
      return;
    }

    const assignedCode = String(verifyTargetWO.assets?.code || "").trim();
    if (assignedCode && assignedCode.toLowerCase() !== manualCode.toLowerCase()) {
      setIsManualVerifyOpen(false);
      setQrMismatchMessage(\`Machine code does not match \${assignedCode}.\`);
      return;
    }

    setIsManualVerifyOpen(false);
    setIsOpenFormOpen(true);
  };`,
  `const confirmManualVerification = () => {
    if (!verifyTargetWO) return;
    const manualCode = (manualMachineCode || "").trim();
    if (!manualCode) {
      toast.error("Enter the assigned machine code to continue");
      return;
    }

    const assignedCode = String(verifyTargetWO.assets?.code || "").trim();
    if (assignedCode && assignedCode.toLowerCase() !== manualCode.toLowerCase()) {
      setIsManualVerifyOpen(false);
      setQrMismatchMessage(\`Machine code does not match \${assignedCode}.\`);
      return;
    }

    setIsManualVerifyOpen(false);
    setIsOpenFormOpen(true);
  };

  const handleMachineSearch = async (query: string) => {
    setManualMachineCode(query);
    if (!query.trim()) {
      setManualMachineSearchResults([]);
      return;
    }
    setIsSearchingMachine(true);
    try {
      const { listAssets } = await import("@/api/assets");
      const response = await listAssets({ page: 1, limit: 20 });
      const assets = (response.data || []).filter((a: any) =>
        a.isActive !== false &&
        (a.code?.toLowerCase().includes(query.toLowerCase()) ||
         a.name?.toLowerCase().includes(query.toLowerCase()))
      );
      setManualMachineSearchResults(
        assets.map((a: any) => ({
          value: a.code || a.id,
          label: \`\${a.code} - \${a.name}\`,
        }))
      );
    } catch {
      setManualMachineSearchResults([]);
    } finally {
      setIsSearchingMachine(false);
    }
  };`
);

// Replace the manual verification dialog to include search
c = c.replace(
  `      <FormDialog
        open={isManualVerifyOpen}
        onOpenChange={setIsManualVerifyOpen}
        title="Manual Machine Verification"
        description="Enter the assigned machine code exactly as printed on the machine or asset card."
        onSubmit={confirmManualVerification}
        submitLabel="Confirm Machine"
        size="sm"
      >
        <InputField
          label="Machine Code"
          value={manualMachineCode}
          onChange={setManualMachineCode}
          placeholder={verifyTargetWO?.assets?.code || "Enter machine code"}
          required
        />
      </FormDialog>`,
  `      <FormDialog
        open={isManualVerifyOpen}
        onOpenChange={setIsManualVerifyOpen}
        title="Manual Machine Verification"
        description="Search and select the machine, or enter the machine code manually."
        onSubmit={confirmManualVerification}
        submitLabel="Confirm Machine"
        size="sm"
      >
        <div className="space-y-3">
          <SearchableSelect
            value={manualMachineCode}
            onChange={(value) => {
              setManualMachineCode(value);
              setManualMachineSearchResults([]);
            }}
            options={manualMachineSearchResults}
            placeholder="Search machine by code or name..."
            emptyMessage="Type to search machines..."
            label="Search Machine"
          />
          <div className="relative">
            <InputField
              label="Or Enter Machine Code Directly"
              value={manualMachineCode}
              onChange={setManualMachineCode}
              placeholder={verifyTargetWO?.assets?.code || "Enter machine code"}
              required
            />
            <input
              type="text"
              className="absolute inset-0 opacity-0"
              value={manualMachineCode}
              onChange={(e) => handleMachineSearch(e.target.value)}
              onFocus={() => { }}
              aria-hidden="true"
            />
          </div>
        </div>
      </FormDialog>`
);

// =============================================
// 4. Update buildSpareUsagePayload for material categories
// =============================================

c = c.replace(
  `function buildSpareUsagePayload(rows: MaterialDraft[], availableSpares: SpareItem[]) {
  const spareById = new Map(availableSpares.map((item) => [item.id, item]));
  return rows
    .map((row) => {
      const quantity = Number.parseInt(row.quantity, 10);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;

      if (row.isManual) {
        const spareName = (row.spareName || "").trim();
        if (!spareName) return null;
        return {
          spare_item_id: \`manual-\${spareName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}\`,
          quantity,
          spare_name: spareName,
          is_manual: true,
        };
      }

      const spare = spareById.get(row.spareItemId);
      if (!spare) return null;
      return {
        spare_item_id: spare.id,
        quantity,
        spare_name: spare.name,
        spare_code: spare.code,
        is_manual: false,
      };
    })
    .filter((item): item is { spare_item_id: string; quantity: number; spare_name: string; spare_code: string; is_manual: boolean } => Boolean(item));
}`,
  `function buildSpareUsagePayload(rows: MaterialDraft[], availableSpares: SpareItem[]) {
  const spareById = new Map(availableSpares.map((item) => [item.id, item]));
  return rows
    .map((row) => {
      const quantity = Number.parseFloat(row.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;

      // Handle consumables (Oil, Refrigerant, Other)
      if (row.category !== "SPARE") {
        const itemName = (row.itemName || "").trim();
        if (!itemName) return null;
        return {
          spare_item_id: \`\${row.category.toLowerCase()}-\${row.itemId || itemName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}\`,
          quantity,
          spare_name: itemName,
          material_category: row.category,
          is_manual: true,
        };
      }

      if (row.isManual) {
        const spareName = (row.itemName || "").trim();
        if (!spareName) return null;
        return {
          spare_item_id: \`manual-\${spareName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}\`,
          quantity,
          spare_name: spareName,
          material_category: "SPARE",
          is_manual: true,
        };
      }

      const spare = spareById.get(row.itemId);
      if (!spare) return null;
      return {
        spare_item_id: spare.id,
        quantity,
        spare_name: spare.name,
        spare_code: spare.code,
        material_category: "SPARE",
        is_manual: false,
      };
    })
    .filter((item): item is { spare_item_id: string; quantity: number; spare_name: string; spare_code?: string; material_category: string; is_manual: boolean } => Boolean(item));
}`
);

// =============================================
// Write the result
// =============================================

fs.writeFileSync(filePath, c, 'utf8');
console.log('File updated successfully');
console.log('SearchableSelect count:', (c.match(/SearchableSelect/g) || []).length);
console.log('MaterialsUsageEditor count:', (c.match(/MaterialsUsageEditor/g) || []).length);
console.log('Has machine search:', c.includes('handleMachineSearch'));
