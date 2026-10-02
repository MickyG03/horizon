"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/lib/theme";

import styles from "./ThemeToggle.module.css";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button type="button" className={styles.toggle} onClick={toggle} aria-label={label} title={label}>
      <span className={styles.track} data-theme={theme}>
        <span className={styles.thumb}>
          {theme === "dark" ? (
            <Moon size={12} strokeWidth={2.2} aria-hidden />
          ) : (
            <Sun size={12} strokeWidth={2.2} aria-hidden />
          )}
        </span>
      </span>
    </button>
  );
}
