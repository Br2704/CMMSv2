const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'frontend', 'src', 'pages', 'WorkOrders.tsx');
let c = fs.readFileSync(filePath, 'utf8');

// Normalize line endings
c = c.replace(/\r\n/g, '\n');

// Replace openManualVerification to load assets when dialog opens
const oldOpenManual = `  const openManualVerification = () => {
    setIsQrVerifyOpen(false);
    setQrMismatchMessage("");
    setVerificationMethod("MANUAL_ENTRY");
    setVerifiedAssetId(null);
    setManualMachineCode("");
    setIsManualVerifyOpen(true);
  };`;

const newOpenManual = `  const openManualVerification = () => {
    setIsQrVerifyOpen(false);
    setQrMismatchMessage("");
    setVerificationMethod("MANUAL_ENTRY");
    setVerifiedAssetId(null);
    setManualMachineCode("");
    setIsManualVerifyOpen(true);
    // Load assets for machine search
    listAssets({ page: 1, limit: 500, includeInactive: false })
      .then((response) => {
        const assets = (response.data || []).filter((a: any) => a.isActive !== false);
        setManualMachineSearchResults(
          assets.map((a: any) => ({
            value: a.code || a.id,
            label: \`\${a.code} - \${a.name}\`,
          }))
        );
      })
      .catch(() => setManualMachineSearchResults([]));
  };`;

if (c.includes(oldOpenManual)) {
  c = c.replace(oldOpenManual, newOpenManual);
  console.log('openManualVerification updated successfully');
} else {
  console.log('ERROR: Could not find openManualVerification');
}

// Also update the SearchableSelect in the manual dialog to show results immediately
// Check what the manual verification dialog looks like now
const dialogIdx = c.indexOf('SearchableSelect');
if (dialogIdx >= 0) {
  const afterIdx = c.indexOf('Manual Machine Verification');
  if (afterIdx >= 0) {
    console.log('Found SearchableSelect and Manual Machine Verification');
  }
}

// Write back with Windows line endings
c = c.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, c, 'utf8');
console.log('File written successfully');
