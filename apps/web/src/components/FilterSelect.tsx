"use client";

import { useState } from "react";
import { ListBox, Select } from "@heroui/react";

export type FilterSelectOption = { id: string; label: string };

type FilterSelectProps = {
  "aria-label": string;
  className?: string;
  options: FilterSelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  id?: string;
  required?: boolean;
  placeholder?: string;
  isDisabled?: boolean;
};

/** Single-choice HeroUI Select with checkmark on the active item. */
export function FilterSelect({
  "aria-label": ariaLabel,
  className,
  options,
  value: valueProp,
  defaultValue = "",
  onChange,
  name,
  id,
  required,
  placeholder,
  isDisabled,
}: FilterSelectProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const value = valueProp ?? uncontrolled;
  const setValue = (next: string) => {
    if (valueProp === undefined) setUncontrolled(next);
    onChange?.(next);
  };

  return (
    <>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <Select
        id={id}
        aria-label={ariaLabel}
        className={className}
        isDisabled={isDisabled}
        placeholder={placeholder}
        selectedKey={value || null}
        variant="secondary"
        onSelectionChange={(key) => {
          if (key != null) setValue(String(key));
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {options.map((option) => (
              <ListBox.Item key={option.id || "__empty"} id={option.id} textValue={option.label}>
                {option.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </>
  );
}
