import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  required?: boolean;
  label?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search and select...",
  emptyMessage = "No results found.",
  disabled = false,
  className,
  triggerClassName,
  required = false,
  label,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedLabel = useMemo(() => {
    const opt = options.find((o) => o.value === value);
    return opt?.label || "";
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q),
    );
  }, [options, searchQuery]);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="text-xs font-medium text-muted-foreground">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild disabled={disabled}>            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className={cn(
                "w-full h-10 justify-between bg-card/70 border-border/60 text-sm font-normal",
                !value && "text-muted-foreground",
                triggerClassName,
              )}
            >
            {value ? (
              <span className="truncate">{selectedLabel}</span>
            ) : (
              <span className="text-muted-foreground truncate">
                {placeholder}
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[200px] p-0"
          align="start"
          onCloseAutoFocus={(e) => {
            // Prevent Radix from restoring focus to trigger when inside a modal
            // dialog with aria-hidden on the app container. Focus will naturally
            // go back to the trigger button on next tab, avoiding the
            // "Blocked aria-hidden on an element because its descendant retained focus" error.
            e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
          }}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={placeholder}
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="h-11"
            />
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={(currentValue) => {
                      onChange(currentValue === value ? "" : currentValue);
                      setOpen(false);
                      setSearchQuery("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
