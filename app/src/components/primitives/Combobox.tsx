"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import styles from "./Select.module.css";

export type ComboboxItem = {
  value: string;
  label: string;
  sublabel?: string;
  meta?: ReactNode;
};

type ComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  /* Shown in the order given; callers sort (e.g. most recent first). */
  items: ComboboxItem[];
  placeholder?: string;
  searchPlaceholder?: string;
  pageSize?: number;
  size?: "sm" | "md";
  width?: number | string;
  /* An extra first entry that clears the selection, e.g. "Any environment". */
  clearLabel?: string;
  id?: string;
  "aria-label"?: string;
};

/* A small trigger that opens a searchable, paginated list. */
export function Combobox({
  value,
  onChange,
  items,
  placeholder = "Select",
  searchPlaceholder = "Search…",
  pageSize = 6,
  size = "md",
  width,
  clearLabel,
  id,
  ...rest
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find((i) => i.value === value);

  const all = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter((i) => `${i.label} ${i.sublabel ?? ""}`.toLowerCase().includes(q))
      : items;
    return clearLabel && !q ? [{ value: "", label: clearLabel }, ...list] : list;
  }, [items, query, clearLabel]);

  const pages = Math.max(1, Math.ceil(all.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = all.slice(current * pageSize, current * pageSize + pageSize);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (cursor < shown.length - 1) setCursor(cursor + 1);
      else if (current < pages - 1) {
        setPage(current + 1);
        setCursor(0);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cursor > 0) setCursor(cursor - 1);
      else if (current > 0) {
        setPage(current - 1);
        setCursor(pageSize - 1);
      }
    } else if (e.key === "Enter" && shown[cursor]) {
      e.preventDefault();
      choose(shown[cursor].value);
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery("");
          setPage(0);
          setCursor(0);
        }
      }}
    >
      <Popover.Trigger
        id={id}
        className={`${styles.trigger} ${styles[size]}`}
        style={width !== undefined ? { width } : undefined}
        aria-label={rest["aria-label"]}
        data-placeholder={selected || (clearLabel && value === "") ? undefined : ""}
      >
        <span className={styles.value}>
          {selected?.label ?? (value === "" && clearLabel ? clearLabel : placeholder)}
        </span>
        <span className={styles.chevron}>
          <ChevronDown size={14} />
        </span>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className={`surface ${styles.content}`}
          style={{ width: 300 }}
          sideOffset={6}
          align="start"
          collisionPadding={12}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          onKeyDown={onKeyDown}
        >
          <div className={styles.search}>
            <Search size={14} />
            <input
              ref={inputRef}
              value={query}
              placeholder={searchPlaceholder}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
                setCursor(0);
              }}
              aria-label={searchPlaceholder}
            />
          </div>

          {shown.length === 0 ? (
            <div className={styles.empty}>No matches</div>
          ) : (
            <ul className={styles.list} role="listbox">
              {shown.map((item, i) => (
                <li
                  key={item.value || "__clear"}
                  role="option"
                  aria-selected={item.value === value}
                  className={styles.item}
                  data-active={i === cursor || undefined}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(item.value)}
                >
                  <span className={styles.itemText}>
                    <span>{item.label}</span>
                    {item.sublabel && <span className={styles.hint}>{item.sublabel}</span>}
                  </span>
                  {item.value === value ? (
                    <Check size={14} className={styles.check} />
                  ) : (
                    item.meta && <span className={styles.meta}>{item.meta}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {pages > 1 && (
            <div className={styles.pager}>
              <span>
                {current * pageSize + 1}–{Math.min(all.length, (current + 1) * pageSize)} of{" "}
                {all.length}
              </span>
              <span className={styles.pagerButtons}>
                <button
                  type="button"
                  disabled={current === 0}
                  onClick={() => {
                    setPage(current - 1);
                    setCursor(0);
                  }}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  disabled={current >= pages - 1}
                  onClick={() => {
                    setPage(current + 1);
                    setCursor(0);
                  }}
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </span>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
