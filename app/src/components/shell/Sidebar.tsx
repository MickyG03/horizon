"use client";

import { Boxes, GitCompare, LayoutDashboard, ListChecks, Plus, Search, Settings } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Kbd } from "@/components/primitives/Kbd";
import { useHealth } from "@/lib/queries";

import { openPalette } from "./CommandPalette";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./Sidebar.module.css";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: ListChecks },
  { href: "/envs", label: "Environments", icon: Boxes },
  { href: "/compare", label: "Compare", icon: GitCompare },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar({ onNewRun }: { onNewRun: () => void }) {
  const pathname = usePathname();
  const health = useHealth();
  const online = health.isSuccess;

  return (
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand} aria-label="Horizon home">
        <span className={styles.wordmark}>Horizon</span>
      </Link>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onNewRun}>
          <Plus size={14} strokeWidth={2.2} aria-hidden />
          <span>New run</span>
        </button>
        <button type="button" className={styles.search} onClick={openPalette} aria-label="Search">
          <Search size={14} aria-hidden />
          <span className={styles.searchLabel}>Search</span>
          <span className={styles.kbd}>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>

      <nav className={styles.nav} aria-label="Primary">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={styles.item}
              data-active={active || undefined}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className={styles.pill}
                  transition={{ type: "spring", stiffness: 900, damping: 60, mass: 0.6 }}
                >
                  <span className={styles.lamp} />
                </motion.span>
              )}
              <Icon size={16} strokeWidth={1.9} aria-hidden className={styles.icon} />
              <span className={styles.label}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={styles.footer}>
        <ThemeToggle />
        <span className={styles.meta} data-online={online || undefined}>
          <span className={styles.dot} />
          {online ? `api · hud ${health.data?.hud}` : "api offline"}
        </span>
      </div>
    </aside>
  );
}
