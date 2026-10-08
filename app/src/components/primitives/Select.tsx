"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as RadixSelect } from "radix-ui";
import type { ReactNode } from "react";

import styles from "./Select.module.css";

export type SelectOption = {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
};

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  size?: "sm" | "md";
  /* Fixed trigger width; by default it hugs its content. */
  width?: number | string;
  id?: string;
  "aria-label"?: string;
};

// Radix reserves "" for "no value", so empty-string options travel under a sentinel.
const EMPTY = "__empty__";
const encode = (v: string) => (v === "" ? EMPTY : v);
const decode = (v: string) => (v === EMPTY ? "" : v);

/* A compact pill trigger and a floating glass list. Keyboard, typeahead and screen-reader
   behaviour come from Radix Select. */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Select",
  size = "md",
  width,
  id,
  ...rest
}: SelectProps) {
  return (
    <RadixSelect.Root value={encode(value)} onValueChange={(v) => onChange(decode(v))}>
      <RadixSelect.Trigger
        id={id}
        className={`${styles.trigger} ${styles[size]}`}
        style={width !== undefined ? { width } : undefined}
        aria-label={rest["aria-label"]}
      >
        <span className={styles.value}>
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon className={styles.chevron}>
          <ChevronDown size={14} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          className={`surface ${styles.content}`}
          position="popper"
          sideOffset={6}
          collisionPadding={12}
        >
          <RadixSelect.Viewport className={styles.viewport}>
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={encode(o.value)}
                disabled={o.disabled}
                className={styles.item}
              >
                <span className={styles.itemText}>
                  <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                  {o.hint && <span className={styles.hint}>{o.hint}</span>}
                </span>
                <RadixSelect.ItemIndicator className={styles.check}>
                  <Check size={14} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
