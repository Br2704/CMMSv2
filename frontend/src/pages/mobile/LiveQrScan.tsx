import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseQrContent } from "@/mobile/qr";
import { resolveQrMachineCode, resolveQrToken } from "@/api/qr";
import { MobileQrScannerDialog } from "@/components/qr/MobileQrScannerDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function LiveQrScan() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  const handleDecoded = async (value: string) => {
    const parsed = parseQrContent(value);

    if (parsed.machineCode) {
      try {
        const resolved = await resolveQrMachineCode(parsed.machineCode, parsed.token);
        const assetId = resolved.data.asset?.id;
        if (!assetId) throw new Error("Machine not found");
        navigate(`/machine/${assetId}`);
        return;
      } catch {
        // Fall back to token resolution below.
      }
    }

    if (parsed.machineId) {
      navigate(`/machine/${parsed.machineId}`);
      return;
    }

    if (!parsed.token) {
      toast.error("Invalid machine QR. Try again.");
      setOpen(true);
      return;
    }

    try {
      const response = await resolveQrToken(parsed.token);
      const assetId = response.data.asset?.id;
      if (!assetId) throw new Error("Machine not found");
      navigate(`/machine/${assetId}`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Unable to resolve machine QR");
      setOpen(true);
    }
  };

  return (
    <div className="p-3 sm:p-4">
      <Card>
        <CardHeader>
          <CardTitle>Machine QR Scanner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Use this camera scanner to open machine quick access and technician workflows.</p>
          <Button onClick={() => setOpen(true)}>Open Scanner</Button>
        </CardContent>
      </Card>

      <MobileQrScannerDialog
        open={open}
        onOpenChange={setOpen}
        title="Scan Machine QR"
        description="Align QR within frame to continue"
        onDecoded={handleDecoded}
      />
    </div>
  );
}
