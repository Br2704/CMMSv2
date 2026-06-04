import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Command as CommandPrimitive } from "cmdk";

export interface SearchableComboboxProps<T> {
  label?: string;
  value?: string;
  onChange: (value: string) => void;
  onSelectObject?: (item: T | null) => void;
  fetchFn: (params: { page: number; limit: number; search?: string }) => Promise<{ data: T[]; total: number }>;
  labelExtractor: (item: T) => string;
  valueExtractor: (item: T) => string;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  hint?: string;
}

export function SearchableCombobox<T>({
  label,
  value,
  onChange,
  onSelectObject,
  fetchFn,
  labelExtractor,
  valueExtractor,
  placeholder = "Search...",
  emptyMessage = "No results found.",
  className,
  disabled = false,
  required = false,
  error,
  hint,
}: SearchableComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<{ label: string; value: string; data: T }[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedOption, setSelectedOption] = React.useState<{ label: string; value: string; data: T } | null>(null);

  // Debounce fetching
  React.useEffect(() => {
    let active = true;
    const fetchOptions = async () => {
      if (disabled) return;
      setLoading(true);
      try {
        const res = await fetchFn({ page: 1, limit: 50, search: query });
        if (!active) return;
        const formatted = res.data.map((item) => ({
          label: labelExtractor(item),
          value: valueExtractor(item),
          data: item,
        }));
        setOptions(formatted);

        // If we have a value but no selectedOption yet, try to find it in the fetched options
        if (value && !selectedOption) {
          const matched = formatted.find(opt => opt.value === value);
          if (matched) {
            setSelectedOption(matched);
            setQuery(matched.label);
          }
        }
      } catch (error) {
        console.error("Failed to fetch options:", error);
      } finally {
        if (active) setLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchOptions, 300);
    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [query, disabled, fetchFn, labelExtractor, valueExtractor, value]); // removed selectedOption to avoid loops

  // Sync external value changes
  React.useEffect(() => {
    if (!value) {
      setSelectedOption(null);
      setQuery("");
    } else {
      const matched = options.find((opt) => opt.value === value);
      if (matched && matched !== selectedOption) {
        setSelectedOption(matched);
        setQuery(matched.label);
      }
    }
  }, [value, options]);

  const hasLabel = Boolean(label);
  const fieldId = React.useId();

  return (
    <div className={cn(hasLabel ? "space-y-2" : "", "relative w-full", className)}>
      {hasLabel ? (
        <Label htmlFor={fieldId} className="flex items-center gap-1 text-sm font-medium">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      ) : null}

      <Command 
        shouldFilter={false} 
        className={cn(
          "overflow-visible bg-transparent", 
          error ? "border-destructive" : ""
        )}
      >
        <div 
          className={cn(
            "flex items-center border rounded-md px-3 bg-background",
            disabled ? "opacity-50 cursor-not-allowed bg-muted" : "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
            error ? "border-destructive" : "border-input"
          )}
          cmdk-input-wrapper=""
        >
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <CommandPrimitive.Input
            id={fieldId}
            value={query}
            onValueChange={(val) => {
              setQuery(val);
              if (selectedOption && val !== selectedOption.label) {
                // User started typing something new, clear selection
                setSelectedOption(null);
                onChange("");
                if (onSelectObject) onSelectObject(null);
              }
              if (!open) setOpen(true);
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="flex h-10 w-full min-w-0 rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-0 focus:ring-0"
            onFocus={() => {
              if (!disabled) setOpen(true);
            }}
            onBlur={() => {
              // Delay hiding to allow click events on items to fire
              setTimeout(() => {
                setOpen(false);
                // On blur, if no valid selection but query exists, optionally revert to selected
                if (!selectedOption && value) {
                  const matched = options.find(o => o.value === value);
                  if (matched) {
                    setQuery(matched.label);
                    setSelectedOption(matched);
                  } else {
                    setQuery("");
                  }
                } else if (selectedOption) {
                  setQuery(selectedOption.label);
                }
              }, 200);
            }}
          />
          {selectedOption && !disabled && (
             <button
              type="button"
              className="ml-2 hover:bg-muted p-1 rounded-full text-muted-foreground transition-colors"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedOption(null);
                setQuery("");
                onChange("");
                if (onSelectObject) onSelectObject(null);
                setOpen(true);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {open && (
          <div className="relative">
            <div className="absolute top-1 z-50 w-full rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95">
              <CommandList className="max-h-60 overflow-y-auto">
                {loading && options.length === 0 && (
                  <div className="p-4 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!loading && options.length === 0 && (
                  <CommandEmpty>{emptyMessage}</CommandEmpty>
                )}
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => {
                        setQuery(option.label);
                        setSelectedOption(option);
                        onChange(option.value);
                        if (onSelectObject) onSelectObject(option.data);
                        setOpen(false);
                      }}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === option.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </div>
          </div>
        )}
      </Command>
      
      {hint && !error && <p className="text-[0.8rem] text-muted-foreground">{hint}</p>}
      {error && <p className="text-[0.8rem] font-medium text-destructive">{error}</p>}
    </div>
  );
}
