import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { resolveQrToken } from "@/api/qr";

export default function QrScanResolver() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      navigate("/work-orders", { replace: true });
      return;
    }

    void resolveQrToken(token)
      .then((response) => {
        const assetId = response.data.asset?.id;
        if (!assetId) throw new Error("Machine not found in QR token");
        navigate(`/machine/${assetId}?from=qr`, { replace: true });
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Invalid machine QR");
        navigate("/work-orders", { replace: true });
      });
  }, [navigate, token]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Resolving machine QR...
      </div>
    </div>
  );
}
