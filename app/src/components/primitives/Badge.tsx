import type { CSSProperties, ReactNode } from "react";

import styles from "./Badge.module.css";

type BadgeProps = {
  children: ReactNode;
  /* Any CSS colour; usually a token like var(--cause-infra). */
  color?: string;
  variant?: "soft" | "outline" | "solid";
  size?: "sm" | "md";
  mono?: boolean;
  title?: string;
};

export function Badge({ children, color, variant = "soft", size = "md", mono, title }: BadgeProps) {
  const style = color ? ({ "--badge-color": color } as CSSProperties) : undefined;
  const classes = [styles.badge, styles[variant], styles[size], mono ? styles.mono : ""].join(" ");
  return (
    <span className={classes} style={style} title={title}>
      {children}
    </span>
  );
}
