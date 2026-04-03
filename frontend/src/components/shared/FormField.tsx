import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppSwitch } from "@/components/ui/app-switch";

interface BaseFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  id?: string;
  name?: string;
}

interface InputFieldProps extends BaseFieldProps {
  type?: "text" | "email" | "number" | "tel" | "date" | "password" | "time" | "url";
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function InputField({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  error,
  hint,
  disabled,
  className,
  id,
  name,
}: InputFieldProps) {
  const generatedId = useId().replace(/:/g, "");
  const normalizedLabel = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const fieldId = id ?? `${normalizedLabel || "input"}-${generatedId}`;
  const fieldName = name ?? (normalizedLabel || `input-${generatedId}`);
  const hasLabel = label.trim().length > 0;
  return (
    <div className={cn(hasLabel ? "space-y-2" : "space-y-0", className)}>
      {hasLabel ? (
        <Label htmlFor={fieldId} className="flex items-center gap-1 text-sm font-medium">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      ) : null}
      <Input
        id={fieldId}
        name={fieldName}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn("h-10 w-full", error && "border-destructive")}
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface TextareaFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

export function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  required,
  error,
  hint,
  disabled,
  className,
  id,
  name,
}: TextareaFieldProps) {
  const generatedId = useId().replace(/:/g, "");
  const normalizedLabel = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const fieldId = id ?? `${normalizedLabel || "textarea"}-${generatedId}`;
  const fieldName = name ?? (normalizedLabel || `textarea-${generatedId}`);
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={fieldId} className="flex items-center gap-1 text-sm font-medium">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <Textarea
        id={fieldId}
        name={fieldName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={cn("w-full", error && "border-destructive")}
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface SelectFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select...",
  required,
  error,
  hint,
  disabled,
  className,
  id,
  name,
}: SelectFieldProps) {
  const generatedId = useId().replace(/:/g, "");
  const normalizedLabel = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const fieldId = id ?? `${normalizedLabel || "select"}-${generatedId}`;
  const fieldName = name ?? (normalizedLabel || `select-${generatedId}`);
  const hasLabel = label.trim().length > 0;
  const inlineFieldClass = !hasLabel ? "w-full sm:w-[160px] min-w-[140px] flex-shrink-0" : "";
  return (
    <div className={cn(hasLabel ? "space-y-2" : "space-y-0", inlineFieldClass, className)}>
      {hasLabel ? (
        <Label htmlFor={fieldId} className="flex items-center gap-1 text-sm font-medium">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      ) : null}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={fieldId} name={fieldName} className={cn("h-10 w-full", error && "border-destructive")}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface SwitchFieldProps extends BaseFieldProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
}

export function SwitchField({
  label,
  checked,
  onChange,
  description,
  disabled,
  className,
}: SwitchFieldProps) {
  return (
    <AppSwitch
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      label={label}
      description={description}
      wrapperClassName={className}
    />
  );
}
