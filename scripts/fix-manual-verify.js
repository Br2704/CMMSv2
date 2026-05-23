const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'frontend', 'src', 'pages', 'WorkOrders.tsx');
let c = fs.readFileSync(filePath, 'utf8');

// Convert \r\n to \n for uniform matching
c = c.replace(/\r\n/g, '\n');

// The old manual verification dialog text
const oldDialog = `      <FormDialog
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
      </FormDialog>`;

const newDialog = `      <FormDialog
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
            label="Machine Search"
          />
          <p className="text-xs text-muted-foreground text-center">— OR —</p>
          <InputField
            label="Machine Code Direct Entry"
            value={manualMachineCode}
            onChange={setManualMachineCode}
            placeholder={verifyTargetWO?.assets?.code || "Enter machine code"}
            required
          />
          {manualMachineSearchResults.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-lg border border-border/70 bg-background p-1">
              {manualMachineSearchResults.map((result) => (
                <button
                  key={result.value}
                  type="button"
                  className="w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors"
                  onClick={() => {
                    setManualMachineCode(result.value);
                    setManualMachineSearchResults([]);
                  }}
                >
                  {result.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </FormDialog>`;

if (c.includes(oldDialog)) {
  c = c.replace(oldDialog, newDialog);
  console.log('Manual verification dialog replaced successfully');
} else {
  console.log('ERROR: Could not find old dialog text');
  // Debug: find what's around that section
  const idx = c.indexOf('Manual Machine Verification');
  if (idx >= 0) {
    console.log('Found at index', idx);
    console.log('Context:', c.substring(idx - 50, idx + 500));
  } else {
    console.log('Not found at all');
  }
}

// Convert back from \n to \r\n for Windows
c = c.replace(/\n/g, '\r\n');

fs.writeFileSync(filePath, c, 'utf8');
console.log('File written successfully');
