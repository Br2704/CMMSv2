const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'frontend', 'src', 'pages', 'PreventiveMaintenance.tsx');
let c = fs.readFileSync(filePath, 'utf8');

// 1. Replace import
c = c.replace(
  /import \{ SpareUsageEditor, type SpareUsageDraft \} from "@\/components\/spares\/SpareUsageEditor";/,
  `import { MaterialsUsageEditor, type MaterialDraft } from "@/components/spares/MaterialsUsageEditor";`
);
console.log('1. Import replaced:', c.includes('MaterialsUsageEditor'));

// 2. Replace buildSpareUsagePayload function signature
c = c.replace(
  /function buildSpareUsagePayload\(rows: SpareUsageDraft\[\], availableSpares: SpareItem\[\]\): SpareUsageItem\[\] \{/,
  `function buildSpareUsagePayload(rows: MaterialDraft[], availableSpares: SpareItem[]): SpareUsageItem[] {`
);
console.log('2. buildSpareUsagePayload signature replaced');

// 3. Replace inside buildSpareUsagePayload: row.spareItemId -> row.itemId
c = c.replace(
  /if \(!row\.spareItemId \|\| !Number\.isFinite\(quantity\) \|\| quantity <= 0\) return null;/,
  `      if (!row.itemId || !Number.isFinite(quantity) || quantity <= 0) return null;`
);
c = c.replace(
  /const match = availableSpares\.find\(\(item\) => item\.id === row\.spareItemId\);/,
  `      const match = availableSpares.find((item) => item.id === row.itemId);`
);
c = c.replace(
  /spareItemId: match\.id,/,
  `        spareItemId: match.id,`
);
console.log('3. buildSpareUsagePayload body replaced');

// 4. Update draftSpareUsage useState
c = c.replace(
  /const \[draftSpareUsage, setDraftSpareUsage\] = useState<SpareUsageDraft\[\]>\(\[\]\);/,
  `const [draftSpareUsage, setDraftSpareUsage] = useState<MaterialDraft[]>([]);`
);
console.log('4. useState type replaced');

// 5. In openTaskDialog, update the mapping to MaterialDraft
c = c.replace(
  /setDraftSpareUsage\(\s*\(checklist\.spareUsage \|\| \[\]\)\.map\(\(item\) => \(\{\s*spareItemId: String\(item\.spareItemId \|\| ""\),\s*quantity: String\(item\.quantity \|\| ""\),\s*\}\)\),\s*\);/,
  `    setDraftSpareUsage(
      (checklist.spareUsage || []).map((item) => ({
        itemId: String(item.spareItemId || ""),
        itemName: "",
        quantity: String(item.quantity || ""),
        category: "SPARE" as const,
        isManual: false,
      })),
    );`
);
console.log('5. openTaskDialog mapping replaced');

// 6. Replace SpareUsageEditor JSX usage
c = c.replace(
  /<SpareUsageEditor rows=\{draftSpareUsage\} onChange=\{setDraftSpareUsage\} options=\{spareOptions\} \/>/,
  `<MaterialsUsageEditor spareRows={draftSpareUsage} onSpareChange={setDraftSpareUsage} spareOptions={spareOptions} />`
);
console.log('6. JSX usage replaced');

fs.writeFileSync(filePath, c, 'utf8');
console.log('Done!');
