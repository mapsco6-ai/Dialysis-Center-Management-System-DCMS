"use client";

import { ListBox, Select } from "@heroui/react";

export type FilterSelectOption = { id: string; label: string };

/** Single-choice filter styled like HeroUI Select (checkmark on active item). */
export function FilterSelect({
  "aria-label": ariaLabel,
  className,
  options,
  value,
  onChange,
}: {
  "aria-label": string;
  className?: string;
  options: FilterSelectOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      aria-label={ariaLabel}
      className={className}
      selectedKey={value}
      variant="secondary"
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key));
      }}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
