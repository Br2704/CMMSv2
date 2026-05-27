import * as React from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"

export interface AsyncSelectProps<T> {
  label?: string
  value?: string
  onChange: (value: string) => void
  fetchFn: (params: { page: number; limit: number; search?: string }) => Promise<{ data: T[]; total: number }>
  labelExtractor: (item: T) => string
  valueExtractor: (item: T) => string
  placeholder?: string
  emptyMessage?: string
  className?: string
  disabled?: boolean
  required?: boolean
  error?: string
  hint?: string
}

export function AsyncSelect<T>({
  label,
  value,
  onChange,
  fetchFn,
  labelExtractor,
  valueExtractor,
  placeholder = "Select an option...",
  emptyMessage = "No results found.",
  className,
  disabled = false,
  required = false,
  error,
  hint,
}: AsyncSelectProps<T>) {
  const [open, setOpen] = React.useState(false)
  const [options, setOptions] = React.useState<{ label: string; value: string; data: T }[]>([])
  const [loading, setLoading] = React.useState(false)
  const [query, setQuery] = React.useState("")
  
  const generatedId = React.useId().replace(/:/g, "")
  const normalizedLabel = (label || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  const fieldId = `${normalizedLabel || "async-select"}-${generatedId}`
  const hasLabel = (label || "").trim().length > 0

  const fetchFnRef = React.useRef(fetchFn)
  const labelExtractorRef = React.useRef(labelExtractor)
  const valueExtractorRef = React.useRef(valueExtractor)

  React.useEffect(() => {
    fetchFnRef.current = fetchFn
    labelExtractorRef.current = labelExtractor
    valueExtractorRef.current = valueExtractor
  }, [fetchFn, labelExtractor, valueExtractor])

  React.useEffect(() => {
    let active = true

    if (!open && !value) {
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await fetchFnRef.current({ page: 1, limit: 50, search: query || undefined })
        if (active) {
          setOptions(
            results.data.map(item => ({
              label: labelExtractorRef.current(item),
              value: valueExtractorRef.current(item),
              data: item,
            }))
          )
        }
      } catch (err) {
        console.error("Error fetching options:", err)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }, 300)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, open, value])

  const selectedOption = React.useMemo(() => {
    return options.find((opt) => opt.value === value)
  }, [value, options])

  const inlineFieldClass = !hasLabel ? "w-full flex-shrink-0" : ""

  return (
    <div className={cn(hasLabel ? "space-y-2" : "space-y-0", inlineFieldClass, className)}>
      {hasLabel ? (
        <Label htmlFor={fieldId} className="flex items-center gap-1 text-sm font-medium">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={fieldId}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal h-10",
              !value && "text-muted-foreground",
              error && "border-destructive",
              className
            )}
          >
            <span className="truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Search..." 
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {loading && (
                <div className="p-4 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && options.length === 0 && (
                <CommandEmpty>{emptyMessage}</CommandEmpty>
              )}
              {!loading && (
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={(currentValue) => {
                        onChange(currentValue === value ? "" : option.value)
                        setOpen(false)
                      }}
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
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

