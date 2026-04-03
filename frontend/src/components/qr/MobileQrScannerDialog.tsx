import { useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MobileQrScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onDecoded: (value: string) => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

type ScannerStatus = "idle" | "mounting" | "requesting_permission" | "starting" | "ready";

async function waitForScannerElement(elementId: string, isDisposed: () => boolean) {
  const startedAt = Date.now();

  while (!isDisposed()) {
    const element = document.getElementById(elementId);
    if (element) return;
    if (Date.now() - startedAt > 2000) break;
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  throw new Error("Camera view is still loading. Please try again.");
}

async function requestCameraAccess() {
  if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    throw new Error("Camera access needs HTTPS or localhost in the browser.");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support camera access.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: "environment" } },
  });

  stream.getTracks().forEach((track) => track.stop());
}

function getScannerErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (message.includes("Permission denied") || message.includes("NotAllowedError")) {
    return "Camera permission was denied. Allow camera access in your browser and try again.";
  }
  if (message.includes("NotFoundError") || message.includes("Requested device not found")) {
    return "No camera was found on this device.";
  }
  if (message.includes("NotReadableError")) {
    return "The camera is already in use by another app or browser tab.";
  }
  if (message.includes("HTTPS or localhost")) {
    return message;
  }
  if (message.includes("still loading")) {
    return message;
  }

  return "Unable to access the camera right now. Check browser permission and try again.";
}

async function disposeScanner(scanner: Html5Qrcode | null) {
  if (!scanner) return;

  await scanner.stop().catch(() => undefined);
  try {
    scanner.clear();
  } catch {
    // Ignore cleanup failures when the scanner container is already gone.
  }
}

export function MobileQrScannerDialog({
  open,
  onOpenChange,
  title = "Scan QR",
  description = "Point your camera at the machine QR code",
  onDecoded,
  secondaryActionLabel,
  onSecondaryAction,
}: MobileQrScannerDialogProps) {
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [retryToken, setRetryToken] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const decodedRef = useRef(false);
  const onDecodedRef = useRef(onDecoded);
  const onOpenChangeRef = useRef(onOpenChange);
  const elementId = useMemo(() => `cmms-qr-scanner-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    onDecodedRef.current = onDecoded;
  }, [onDecoded]);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      decodedRef.current = false;
      setError("");
      setStatus("idle");
      return;
    }

    let disposed = false;
    decodedRef.current = false;
    setError("");
    setStatus("mounting");

    void (async () => {
      try {
        await waitForScannerElement(elementId, () => disposed);
        if (disposed) return;

        setStatus("requesting_permission");
        await requestCameraAccess();
        if (disposed) return;

        setStatus("starting");
        const scanner = new Html5Qrcode(elementId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: { ideal: "environment" } },
          { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
          (decodedText) => {
            if (decodedRef.current) return;
            decodedRef.current = true;
            onDecodedRef.current(decodedText);
            onOpenChangeRef.current(false);
          },
          () => {
            // Ignore frame-level decode errors.
          },
        );

        if (!disposed) {
          setStatus("ready");
        }
      } catch (startError: unknown) {
        if (disposed) return;
        setError(getScannerErrorMessage(startError));
        setStatus("idle");
        const active = scannerRef.current;
        scannerRef.current = null;
        await disposeScanner(active);
      }
    })();

    return () => {
      disposed = true;
      const active = scannerRef.current;
      scannerRef.current = null;
      void disposeScanner(active);
    };
  }, [elementId, open, retryToken]);

  const isStarting = status === "mounting" || status === "requesting_permission" || status === "starting";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Camera className="h-4 w-4" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div id={elementId} className="min-h-72 overflow-hidden rounded-xl border border-border bg-black/90" />
          {status === "mounting" ? <p className="text-xs text-muted-foreground">Preparing scanner view...</p> : null}
          {status === "requesting_permission" ? (
            <p className="text-xs text-muted-foreground">Allow camera access in your browser to scan QR codes on mobile.</p>
          ) : null}
          {status === "starting" ? <p className="text-xs text-muted-foreground">Starting camera...</p> : null}
          {status === "ready" ? <p className="text-xs text-muted-foreground">Camera is ready. Align the QR code inside the frame.</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {error ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setRetryToken((current) => current + 1)}>
              Retry Camera
            </Button>
          ) : null}
        </div>

        <DialogFooter>
          {secondaryActionLabel && onSecondaryAction ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onSecondaryAction}
              disabled={isStarting}
            >
              {secondaryActionLabel}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
