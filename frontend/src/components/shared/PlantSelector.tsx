import { useEffect, useState } from "react";
import { usePlants } from "@/hooks/use-db";
import { useAuthStore, isSuperAdmin } from "@/store/auth.store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/shared/FormField";
import { Factory } from "lucide-react";

interface PlantSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (plantId: string) => void;
  title?: string;
}

export function PlantSelector({ open, onOpenChange, onSelect, title }: PlantSelectorProps) {
  const { data: plants = [] } = usePlants();
  const [selectedPlantId, setSelectedPlantId] = useState("");

  const activePlants = plants.filter((p: any) => p.is_active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-primary" />
            {title || "Select Plant"}
          </DialogTitle>
          <DialogDescription>
            As a SuperAdmin, you must select a plant to associate this data with. This ensures proper data isolation between plants.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <SelectField
            label="Plant"
            value={selectedPlantId}
            onChange={setSelectedPlantId}
            options={activePlants.map((p: any) => ({
              value: p.id,
              label: `${p.plant_code} — ${p.plant_name}`,
            }))}
            placeholder="Choose a plant..."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!selectedPlantId}
            onClick={() => {
              onSelect(selectedPlantId);
              onOpenChange(false);
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook that returns the plant_id to use for inserts.
 * For SuperAdmin without activePlantId, it returns null and a flag to prompt selection.
 * For regular users, it returns their profile plant_id.
 */
export function usePlantIdForInsert() {
  const { user, activePlantId } = useAuthStore();
  const isSA = isSuperAdmin(user);

  if (isSA) {
    // SuperAdmin must explicitly pick a plant
    return {
      plantId: activePlantId || null,
      needsPlantSelection: !activePlantId,
      isSuperAdmin: true,
    };
  }

  return {
    plantId: user?.plantId || null,
    needsPlantSelection: false,
    isSuperAdmin: false,
  };
}
