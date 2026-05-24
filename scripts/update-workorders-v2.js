const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'frontend', 'src', 'pages', 'WorkOrders.tsx');
let c = fs.readFileSync(filePath, 'utf8');

// =============================================
// 1. Fix duplicate manualMachineSearchResults declarations (lines 600-601)
// =============================================
c = c.replace(
  /const \[manualMachineSearchResults, setManualMachineSearchResults\] = useState<Array<\{ value: string; label: string \}\>>\(\[\]\);\s*\n\s*const \[isSearchingMachine, setIsSearchingMachine\] = useState\(false\);\s*\n\s*const \[manualMachineSearchResults, setManualMachineSearchResults\] = useState<Array<\{ value: string; label: string \}\>>\(\[\]\);/,
  `const [manualMachineSearchResults, setManualMachineSearchResults] = useState<Array<{ value: string; label: string }>>([]);
  const [isSearchingMachine, setIsSearchingMachine] = useState(false);`
);

// =============================================
// 2. Fix SpareUsageDraft -> MaterialDraft in useState
// =============================================
c = c.replace(
  /useState<SpareUsageDraft\[\]>/,
  'useState<MaterialDraft[]>'
);

// =============================================
// 3. Replace Machine Selection SelectFields with SearchableSelect
// =============================================

// Plant field
c = c.replace(
  /<SelectField\s*\n\s*label="Plant"\s*\n\s*value=\{formData\.plant_id\}\s*\n\s*onChange=\{\(value\) => setFormData\(\(prev\) => \(\{ \.\.\.prev, plant_id: value, department_id: "", module_id: "", asset_id: "" \}\)\)\}\s*\n\s*options=\{plantOptions\}\s*\n\s*placeholder=\{userIsSuperAdmin \? "Select plant" : "Assigned plant"\}\s*\n\s*disabled=\{!userIsSuperAdmin \|\| plantOptions\.length === 0\}\s*\n\s*required\s*\n\s*\/>/,
  `<SearchableSelect
                label="Plant"
                value={formData.plant_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, plant_id: value, department_id: "", module_id: "", asset_id: "" }))}
                options={plantOptions}
                placeholder={userIsSuperAdmin ? "Search plants..." : "Assigned plant"}
                disabled={!userIsSuperAdmin || plantOptions.length === 0}
                required
              />`
);

// Department field
c = c.replace(
  /<SelectField\s*\n\s*label="Department"\s*\n\s*value=\{formData\.department_id\}\s*\n\s*onChange=\{\(value\) => setFormData\(\(prev\) => \(\{ \.\.\.prev, department_id: value, module_id: "", asset_id: "" \}\)\)\}\s*\n\s*options=\{departmentsForPlant\.map\(\(department: Department\) => \(\{\s*\n\s*value: department\.id,\s*\n\s*label: `\$\{department\.code\} - \$\{department\.name\}`,\s*\n\s*\}\)\)\}\s*\n\s*placeholder=\{formData\.plant_id \? "Select department" : "Select plant first"\}\s*\n\s*disabled=\{!formData\.plant_id\}\s*\n\s*required\s*\n\s*\/>/,
  `<SearchableSelect
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

// Module field
c = c.replace(
  /<SelectField\s*\n\s*label="Module"\s*\n\s*value=\{formData\.module_id\}\s*\n\s*onChange=\{\(value\) => setFormData\(\(prev\) => \(\{ \.\.\.prev, module_id: value, asset_id: "" \}\)\)\}\s*\n\s*options=\{modulesForScope\.map\(\(module: MachineModule\) => \(\{\s*\n\s*value: module\.id,\s*\n\s*label: `\$\{module\.code \? `\$\{module\.code\} - ` : ""\}\$\{module\.name\}`,\s*\n\s*\}\)\)\}\s*\n\s*placeholder=\{formData\.department_id \? "Select module" : "Select department first"\}\s*\n\s*disabled=\{!formData\.department_id\}\s*\n\s*required\s*\n\s*\/>/,
  `<SearchableSelect
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

// Machine field
c = c.replace(
  /<SelectField\s*\n\s*label="Machine"\s*\n\s*value=\{formData\.asset_id\}\s*\n\s*onChange=\{\(value\) => setFormData\(\(prev\) => \(\{ \.\.\.prev, asset_id: value \}\)\)\}\s*\n\s*options=\{assetOptions\}\s*\n\s*placeholder=\{formData\.module_id \? "Select machine" : "Select module first"\}\s*\n\s*disabled=\{!formData\.module_id \|\| assetOptions\.length === 0\}\s*\n\s*required\s*\n\s*\/>/,
  `<SearchableSelect
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
// 4. Fix MaterialsUsageEditor props (rows -> spareRows, onChange -> onSpareChange, options -> spareOptions)
// =============================================
c = c.replace(
  /rows=\{closeSpareUsage\}\s*\n\s*onChange=\{setCloseSpareUsage\}\s*\n\s*options=\{closeSpareOptions\}\s*\n\s*allowManualEntry/,
  `spareRows={closeSpareUsage}\n                    onSpareChange={setCloseSpareUsage}\n                    spareOptions={closeSpareOptions}`
);

// =============================================
// 5. Replace Manual Machine Verification dialog with enhanced version
// =============================================
c = c.replace(
  `<FormDialog\n        open={isManualVerifyOpen}\n        onOpenChange={setIsManualVerifyOpen}\n        title="Manual Machine Verification"\n        description="Enter the assigned machine code exactly as printed on the machine or asset card."\n        onSubmit={confirmManualVerification}\n        submitLabel="Confirm Machine"\n        size="sm"\n      >\n        <InputField\n          label="Machine Code"\n          value={manualMachineCode}\n          onChange={setManualMachineCode}\n          placeholder={verifyTargetWO?.assets?.code || "Enter machine code"}\n          required\n        />\n      </FormDialog>`,
  `<FormDialog\n        open={isManualVerifyOpen}\n        onOpenChange={setIsManualVerifyOpen}\n        title="Manual Machine Verification"\n        description="Search and select the machine, or enter the machine code manually."\n        onSubmit={confirmManualVerification}\n        submitLabel="Confirm Machine"\n        size="sm"\n      >\n        <div className="space-y-3">\n          <SearchableSelect\n            value={manualMachineCode}\n            onChange={(value) => {\n              setManualMachineCode(value);\n              setManualMachineSearchResults([]);\n            }}\n            options={manualMachineSearchResults}\n            placeholder="Search machine by code or name..."\n            emptyMessage="Type to search machines..."\n            label="Machine Search"\n          />\n          <p className="text-xs text-muted-foreground text-center">— OR —</p>\n          <InputField\n            label="Machine Code Direct Entry"\n            value={manualMachineCode}\n            onChange={setManualMachineCode}\n            placeholder={verifyTargetWO?.assets?.code || "Enter machine code"}\n            required\n          />\n          {manualMachineSearchResults.length > 0 && (\n            <div className="max-h-32 overflow-y-auto rounded-lg border border-border/70 bg-background p-1">\n              {manualMachineSearchResults.map((result) => (\n                <button\n                  key={result.value}\n                  type="button"\n                  className="w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors"\n                  onClick={() => {\n                    setManualMachineCode(result.value);\n                    setManualMachineSearchResults([]);\n                  }}\n                >\n                  {result.label}\n                </button>\n              ))}\n            </div>\n          )}\n        </div>\n      </FormDialog>`
);

// =============================================
// 6. Add handleMachineSearch function right before the handleCloseWithDetails function
// =============================================
c = c.replace(
  /const handleCloseWithDetails = async/,
  `const handleMachineSearch = async (query: string) => {
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
  };

  const handleCloseWithDetails = async`
);

// =============================================
// Write the result
// =============================================
fs.writeFileSync(filePath, c, 'utf8');
console.log('File updated successfully');

// Verify counts
console.log('SearchableSelect usage:', (c.match(/<SearchableSelect/g) || []).length);
console.log('MaterialsUsageEditor usage:', (c.match(/<MaterialsUsageEditor/g) || []).length);
console.log('SpareUsageDraft remaining:', (c.match(/SpareUsageDraft/g) || []).length);
console.log('Has handleMachineSearch:', c.includes('handleMachineSearch'));
