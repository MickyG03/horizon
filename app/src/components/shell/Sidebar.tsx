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
        <HorizonMark />
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
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
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

/* A sun resting on a horizon line. */
function HorizonMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <defs>
        <clipPath id="horizon-mark-clip">
          <rect x="0" y="0" width="24" height="14" />
        </clipPath>
      </defs>
      <circle cx="12" cy="14" r="6.5" fill="currentColor" clipPath="url(#horizon-mark-clip)" />
      <line x1="2" y1="14.5" x2="22" y2="14.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="18" x2="19" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="1" opacity="0.25" />
    </svg>
  );
}
