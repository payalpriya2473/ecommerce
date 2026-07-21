"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface FilterMultiSelectOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterMultiSelectProps {
  label: string;
  placeholder: string;
  options: FilterMultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  singleSelect?: boolean;
  disableOptionFiltering?: boolean;
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function FilterMultiSelect({
  label,
  placeholder,
  options,
  values,
  onChange,
  singleSelect = false,
  disableOptionFiltering = false,
  searchValue,
  onSearchValueChange,
  className,
  disabled = false,
}: FilterMultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const selectedOptions = React.useMemo(
    () => options.filter((option) => values.includes(option.value)),
    [options, values],
  );

  const triggerLabel = React.useMemo(() => {
    if (selectedOptions.length === 0) return placeholder;
    if (options.length > 0 && selectedOptions.length === options.length) return placeholder;
    if (selectedOptions.length <= 2) return selectedOptions.map((option) => option.label).join(", ");
    return `${selectedOptions.length} selected`;
  }, [options.length, placeholder, selectedOptions]);

  const toggleValue = (value: string) => {
    if (singleSelect) {
      onChange(values.includes(value) ? [] : [value]);
      return;
    }

    onChange(
      values.includes(value)
        ? values.filter((currentValue) => currentValue !== value)
        : [...values, value],
    );
  };

  const clearValues = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onChange([]);
    onSearchValueChange?.("");
  };

  const hasSearchText = Boolean(searchValue?.trim());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={label}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 text-left text-sm ring-offset-background transition-colors",
            open && "border-accent ring-2 ring-accent/20 ring-offset-0",
            !disabled && "cursor-pointer",
            disabled && "pointer-events-none cursor-not-allowed opacity-50",
            className,
          )}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen((currentOpen) => !currentOpen);
            }
          }}
        >
          <div className="min-w-0 flex-1">
            <p className="whitespace-nowrap text-sm font-medium text-foreground">{triggerLabel}</p>
          </div>
          <div className="ml-2.5 flex items-center gap-1.5 text-muted-foreground">
            {(values.length > 0 || hasSearchText) && (
              <span
                onClick={clearValues}
                className="rounded-full p-0.5 transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 shrink-0" />
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="min-w-[18rem] w-[var(--radix-popover-trigger-width)] rounded-md border border-border bg-popover p-0 shadow-lg"
      >
        <Command shouldFilter={!disableOptionFiltering}>
          <CommandInput
            placeholder={`Search ${label.toLowerCase()}`}
            className="h-9"
            value={searchValue}
            onValueChange={onSearchValueChange}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const checked = values.includes(option.value);

                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value} ${option.count ?? ""}`}
                    onSelect={() => toggleValue(option.value)}
                    className="gap-2 px-3 py-2 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-white"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-sm border border-border transition-colors",
                        checked && "border-accent bg-accent text-white",
                      )}
                    >
                      <Check className={cn("h-3 w-3", checked ? "opacity-100" : "opacity-0")} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{option.label}</span>
                    {typeof option.count === "number" && (
                      <Badge
                        variant="secondary"
                        className="ml-2 h-5 shrink-0 rounded-full px-2 text-[10px]"
                      >
                        {option.count}
                      </Badge>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
