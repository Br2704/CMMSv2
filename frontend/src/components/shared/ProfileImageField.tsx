import { type ChangeEvent, useId, useRef } from "react";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ProfileImageFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  name: string;
  fallbackText: string;
  description?: string;
  className?: string;
}

export function ProfileImageField({
  label = "Profile Image",
  value,
  onChange,
  name,
  fallbackText,
  description = "Optional. Upload JPG, PNG, WEBP, GIF, or SVG under 2MB.",
  className,
}: ProfileImageFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Profile image must be under 2MB");
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Failed to read selected image"));
        reader.readAsDataURL(file);
      });
      onChange(dataUrl);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to upload profile image";
      toast.error(message);
    }
  };

  const initials = (fallbackText || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={cn("space-y-3 rounded-xl border border-border/70 bg-card/70 p-4", className)}>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="space-y-1">
        <Label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar className="h-20 w-20 rounded-2xl border border-border/70">
          {value ? <AvatarImage src={value} alt={name} className="object-cover" /> : null}
          <AvatarFallback className="rounded-2xl bg-primary/10 text-primary">
            {value ? <ImageIcon className="h-5 w-5" /> : initials || "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            {value ? "Change Image" : "Upload Image"}
          </Button>
          {value ? (
            <Button type="button" variant="ghost" className="gap-2 text-destructive" onClick={() => onChange("")}>
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
