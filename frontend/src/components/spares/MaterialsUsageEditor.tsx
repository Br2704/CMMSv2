import { useState } from "react";
import { MinusCircle, Plus, Droplets, Wind, Box } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export type MaterialDraft = {
  /** Spare item ID or consumable type prefix */
  itemId: string;
  itemName: string;
  quantity: string;
  /** "SPARE" | "OIL" | "REFRIGERANT" | "OTHER_CONSUMABLE" */
  category: MaterialCategory;
  isManual?: boolean;
};

export type MaterialCategory =
  | "SPARE"
  | "OIL"
  | "REFRIGERANT"
  | "OTHER_CONSUMABLE";

type SpareOption = {
  value: string;
  label: string;
};

interface MaterialsUsageEditorProps {
  spareRows: MaterialDraft[];
  onSpareChange: (rows: MaterialDraft[]) => void;
  spareOptions: SpareOption[];
  disabled?: boolean;
  title?: string;
  description?: string;
}

const CONSUMABLE_TYPES: {
  category: MaterialCategory;
  label: string;
  icon: typeof Droplets;
  presetItems: { name: string }[];
}[] = [
  {
    category: "OIL",
    label: "Oils & Lubricants",
    icon: Droplets,
    presetItems: [
      { name: "Hydraulic Oil 68" },
      { name: "Gear Oil 220" },
      { name: "Spindle Oil 10" },
      { name: "Grease EP2" },
      { name: "Cutting Oil" },
      { name: "Transformer Oil" },
      { name: "Compressor Oil" },
      { name: "Way Oil 68" },
      { name: "Slide Way Oil" },
      { name: "Other Oil" },
    ],
  },
  {
    category: "REFRIGERANT",
    label: "Refrigerant Gases",
    icon: Wind,
    presetItems: [
      { name: "R134a Refrigerant" },
      { name: "R404a Refrigerant" },
      { name: "R410a Refrigerant" },
      { name: "R407c Refrigerant" },
      { name: "R22 Refrigerant" },
      { name: "R32 Refrigerant" },
      { name: "R290 Refrigerant" },
      { name: "R600a Refrigerant" },
      { name: "R717 (Ammonia)" },
      { name: "Other Refrigerant" },
    ],
  },
  {
    category: "OTHER_CONSUMABLE",
    label: "Other Consumables",
    icon: Box,
    presetItems: [
      { name: "Thread Lock (Loctite)" },
      { name: "Silicone Sealant" },
      { name: "Gasket Compound" },
      { name: "Anti-Seize Compound" },
      { name: "Electrical Tape" },
      { name: "PTFE Tape" },
      { name: "Contact Cleaner" },
      { name: "WD-40 / Lubricant Spray" },
      { name: "Welding Rod / Electrode" },
      { name: "Filter Element" },
      { name: "Belt Dressing" },
      { name: "Other Consumable" },
    ],
  },
];

const EMPTY_MATERIAL_ROW: MaterialDraft = {
  itemId: "",
  itemName: "",
  quantity: "1",
  category: "SPARE",
  isManual: false,
};

function MaterialRow({
  row,
  index,
  onChange,
  onRemove,
  spareOptions,
  disabled,
}: {
  row: MaterialDraft;
  index: number;
  onChange: (next: Partial<MaterialDraft>) => void;
  onRemove: () => void;
  spareOptions: SpareOption[];
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 rounded-xl border border-border/70 bg-background/80 p-3 md:grid-cols-[minmax(0,1fr)_120px_48px]">
      <div className="space-y-1.5">
        {row.category === "SPARE" ? (
          <>
            <Label className="text-xs font-medium">Spare Item</Label>
            <Select
              value={row.itemId || undefined}
              onValueChange={(value) => {
                const opt = spareOptions.find((o) => o.value === value);
                onChange({
                  itemId: value,
                  itemName: opt?.label || value,
                  isManual: false,
                });
              }}
              disabled={disabled}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select spare item" />
              </SelectTrigger>
              <SelectContent>
                {spareOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : (
          <>
            <Label className="text-xs font-medium">Item</Label>
            <Select
              value={row.itemName || undefined}
              onValueChange={(value) => {
                const preset = CONSUMABLE_TYPES.find((t) =>
                  t.category === row.category,
                )?.presetItems.find((p) => p.name === value);
                onChange({
                  itemId: `${row.category.toLowerCase()}-${value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")}`,
                  itemName: value,
                  isManual: true,
                });
              }}
              disabled={disabled}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select item type" />
              </SelectTrigger>
              <SelectContent>
                {CONSUMABLE_TYPES.find((t) => t.category === row.category)
                  ?.presetItems.map((item) => (
                    <SelectItem key={item.name} value={item.name}>
                      {item.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Qty</Label>
        <Input
          type="number"
          min="0.5"
          step="0.5"
          value={row.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
          disabled={disabled}
          className="h-9"
        />
      </div>

      <div className="flex items-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          className="h-9 w-9"
        >
          <MinusCircle className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function MaterialsUsageEditor({
  spareRows,
  onSpareChange,
  spareOptions,
  disabled = false,
  title = "Materials & Consumables Used",
  description = "Record spare parts, oils, refrigerants, and other consumables used during this maintenance task.",
}: MaterialsUsageEditorProps) {
  const [activeTab, setActiveTab] = useState<MaterialCategory>("SPARE");

  const activeRows = spareRows.filter((r) => r.category === activeTab);

  const updateRow = (index: number, next: Partial<MaterialDraft>) => {
    const actualIndex = spareRows.findIndex(
      (r, i) =>
        r.category === activeTab &&
        spareRows.filter((sr) => sr.category === activeTab)[index] === r,
    );
    if (actualIndex === -1) return;
    const updated = [...spareRows];
    updated[actualIndex] = { ...updated[actualIndex], ...next };
    onSpareChange(updated);
  };

  const removeRow = (index: number) => {
    const actualIndex = spareRows.findIndex(
      (r, i) =>
        r.category === activeTab &&
        spareRows.filter((sr) => sr.category === activeTab)[index] === r,
    );
    if (actualIndex === -1) return;
    onSpareChange(spareRows.filter((_, i) => i !== actualIndex));
  };

  const addRow = () => {
    const preset =
      activeTab !== "SPARE"
        ? CONSUMABLE_TYPES.find((t) => t.category === activeTab)
            ?.presetItems[0]
        : null;
    onSpareChange([
      ...spareRows,
      {
        itemId: preset
          ? `${activeTab.toLowerCase()}-${preset.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")}`
          : "",
        itemName: preset?.name || "",
        quantity: "1",
        category: activeTab,
        isManual: activeTab !== "SPARE",
      },
    ]);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/15 p-4">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as MaterialCategory)}
      >
        <TabsList className="w-full flex-wrap h-auto gap-1">
          <TabsTrigger value="SPARE" className="text-xs flex-1">
            <span className="mr-1">🔧</span> Spare Parts
          </TabsTrigger>
          <TabsTrigger value="OIL" className="text-xs flex-1">
            <Droplets className="h-3.5 w-3.5 mr-1" /> Oils
          </TabsTrigger>
          <TabsTrigger value="REFRIGERANT" className="text-xs flex-1">
            <Wind className="h-3.5 w-3.5 mr-1" /> Gases
          </TabsTrigger>
          <TabsTrigger value="OTHER_CONSUMABLE" className="text-xs flex-1">
            <Box className="h-3.5 w-3.5 mr-1" /> Other
          </TabsTrigger>
        </TabsList>

        <TabsContent value="SPARE" className="mt-3 space-y-2">
          {spareOptions.length === 0 && activeRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
              No spare items available for this machine or plant scope.
            </div>
          ) : activeRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
              No spare parts selected. Click below to add.
            </div>
          ) : (
            activeRows.map((row, idx) => (
              <MaterialRow
                key={`spare-${idx}`}
                row={row}
                index={idx}
                onChange={(next) => updateRow(idx, next)}
                onRemove={() => removeRow(idx)}
                spareOptions={spareOptions}
                disabled={disabled}
              />
            ))
          )}
        </TabsContent>

        {CONSUMABLE_TYPES.filter((t) => t.category !== "SPARE").map(
          (consumableType) => (
            <TabsContent
              key={consumableType.category}
              value={consumableType.category}
              className="mt-3 space-y-2"
            >
              {activeRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
                  No {consumableType.label.toLowerCase()} added. Click below to
                  add.
                </div>
              ) : (
                activeRows.map((row, idx) => (
                  <MaterialRow
                    key={`${consumableType.category}-${idx}`}
                    row={row}
                    index={idx}
                    onChange={(next) => updateRow(idx, next)}
                    onRemove={() => removeRow(idx)}
                    spareOptions={spareOptions}
                    disabled={disabled}
                  />
                ))
              )}
            </TabsContent>
          ),
        )}
      </Tabs>

      <Button
        type="button"
        variant="outline"
        onClick={addRow}
        disabled={disabled}
        className="gap-2"
      >
        <Plus className="h-4 w-4" />
        Add{" "}
        {activeTab === "SPARE"
          ? "Spare Item"
          : activeTab === "OIL"
            ? "Oil / Lubricant"
            : activeTab === "REFRIGERANT"
              ? "Refrigerant Gas"
              : "Consumable"}
      </Button>
    </div>
  );
}
