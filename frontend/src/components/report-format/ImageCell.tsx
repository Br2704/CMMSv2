import { useState } from "react";
import { ImageIcon } from "lucide-react";

export function ImageCell({ src, alt = "" }: { src: string; alt?: string }) {
  const [hasError, setHasError] = useState(false);
  if (hasError) {
    return (
      <div className="flex items-center gap-1">
        <ImageIcon className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-[8px] text-muted-foreground truncate block max-w-[100px]">{src}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="h-6 w-6 object-contain rounded"
      onError={() => setHasError(true)}
    />
  );
}
