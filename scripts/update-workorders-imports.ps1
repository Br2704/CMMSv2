param(
    [string]$FilePath = "D:\br\cmmsv2\frontend\src\pages\WorkOrders.tsx"
)

Write-Output "Reading file: $FilePath"
$c = Get-Content $FilePath -Raw

# 1. Replace import line
$c = $c -replace "import { SpareUsageEditor, type SpareUsageDraft } from `"@/components/spares/SpareUsageEditor`";", "import { MaterialsUsageEditor, type MaterialDraft } from `"@/components/spares/MaterialsUsageEditor`";`r`nimport { SearchableSelect } from `"@/components/shared/SearchableSelect`";"

# 2. Replace type references
$c = $c -replace "closeSpareUsage\?: SpareUsageDraft\[\]", "closeSpareUsage?: MaterialDraft[]"
$c = $c -replace "closeSpareUsage\]: useState<SpareUsageDraft\[\]>", "closeSpareUsage]: useState<MaterialDraft[]>"
$c = $c -replace "buildSpareUsagePayload\(rows: SpareUsageDraft\[\]", "buildSpareUsagePayload(rows: MaterialDraft[]"
$c = $c -replace "function buildSpareUsagePayload\(rows: MaterialDraft\[\], availableSpares: SpareItem\[\]\) {", "function buildSpareUsagePayload(rows: MaterialDraft[], availableSpares: SpareItem[]) {`r`n  const consumableCategories = [`"OIL`", `"REFRIGERANT`", `"OTHER_CONSUMABLE`"];`r`n  const consumableRows = rows.filter((r) => consumableCategories.includes(r.category));"
$c = $c -replace "  return rows", "  const spareRows = rows.filter((r) => r.category === `"SPARE`" || !r.category);"

# Verify
if ($c.Contains("SearchableSelect")) {
    Write-Output "IMPORT: OK - SearchableSelect found"
} else {
    Write-Output "IMPORT: FAILED"
}

if ($c.Contains("MaterialDraft")) {
    Write-Output "TYPES: OK - MaterialDraft found"
} else {
    Write-Output "TYPES: FAILED"
}

Set-Content $FilePath $c -NoNewline
Write-Output "Done - file saved"
