"use client";

import { Boxes, GitCompare, Hammer, LayoutDashboard, ListChecks, Moon, Rocket, Search, Settings, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Kbd } from "@/components/primitives/Kbd";
import { useEnvs, useJobs } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

import styles from "./CommandPalette.module.css";

export const OPEN_PALETTE_EVENT = "horizon:palette";

type Item = { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void };

export function CommandPalette({ onNewRun }: { onNewRun: () => void }) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const { data: envs = [] } = useEnvs();
  const { data: jobs = [] } = useJobs({ limit: 20 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => router.push(href);
    const pages: Item[] = [
      { id: "new-run", group: "Actions", label: "New run", hint: "Launch an eval", icon: <Rocket size={14} />, run: onNewRun },
      { id: "new-env", group: "Actions", label: "New environment", hint: "Build from a template", icon: <Hammer size={14} />, run: go("/envs/new") },
      { id: "theme", group: "Actions", label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme", icon: theme === "dark" ? <Sun size={14} /> : <Moon size={14} />, run: toggle },
      { id: "/", group: "Pages", label: "Overview", icon: <LayoutDashboard size={14} />, run: go("/") },
      { id: "/jobs", group: "Pages", label: "Jobs", icon: <ListChecks size={14} />, run: go("/jobs") },
      { id: "/envs", group: "Pages", label: "Environments", icon: <Boxes size={14} />, run: go("/envs") },
      { id: "/compare", group: "Pages", label: "Compare", icon: <GitCompare size={14} />, run: go("/compare") },
      { id: "/settings", group: "Pages", label: "Settings", icon: <Settings size={14} />, run: go("/settings") },
    ];
    const envItems: Item[] = envs.map((e) => ({
      id: `env-${e.id}`,
      group: "Environments",
      label: e.name,
      hint: `${e.task_count} tasks`,
      icon: <Boxes size={14} />,
      run: go(`/envs/${e.id}`),
    }));
    const jobItems: Item[] = jobs.map((j) => ({
      id: `job-${j.id}`,
      group: "Recent jobs",
      label: j.name,
      hint: `${j.status} · ${j.model}`,
      icon: <ListChecks size={14} />,
      run: go(`/jobs/${j.id}`),
    }));
    return [...pages, ...envItems, ...jobItems];
  }, [envs, jobs, router, onNewRun, theme, toggle]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.group} ${i.label} ${i.hint ?? ""}`.toLowerCase().includes(q));
  }, [items, query]);

  const select = (item: Item) => {
    setOpen(false);
    setQuery("");
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && filtered[cursor]) {
      e.preventDefault();
      select(filtered[cursor]);
    }
  };

  let lastGroup = "";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={`surface ${styles.content}`} onKeyDown={onKeyDown} aria-label="Command palette">
          <Dialog.Title className="visually-hidden">Command palette</Dialog.Title>
          <Dialog.Description className="visually-hidden">
            Jump to a page, environment or job
          </Dialog.Description>
          <div className={styles.inputRow}>
            <Search size={16} className={styles.searchIcon} />
            <input
              autoFocus
              className={styles.input}
              placeholder="Jump to a page, environment or job…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
            />
            <Kbd>esc</Kbd>
          </div>
          <ul className={styles.list} role="listbox">
            {filtered.length === 0 && <li className={styles.empty}>No matches.</li>}
            {filtered.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <li key={item.id}>
                  {header && <div className={styles.group}>{header}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === cursor}
                    className={styles.item}
                    data-active={i === cursor || undefined}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => select(item)}
                  >
                    <span className={styles.icon}>{item.icon}</span>
                    <span className={styles.label}>{item.label}</span>
                    {item.hint && <span className={styles.hint}>{item.hint}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function openPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}
