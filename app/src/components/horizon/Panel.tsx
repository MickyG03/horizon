import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

import styles from "./Panel.module.css";

type PanelProps = ComponentPropsWithoutRef<"section"> & {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  dense?: boolean;
  /* Stagger index for the entrance animation. */
  index?: number;
};

/* The basic surface everything sits on: a glass slab with a lit top edge. */
export function Panel({
  title,
  eyebrow,
  actions,
  dense,
  index,
  className,
  style,
  children,
  ...rest
}: PanelProps) {
  const classes = ["surface", "rise", styles.panel, dense ? styles.dense : "", className ?? ""]
    .join(" ")
    .trim();
  return (
    <section className={classes} style={{ "--i": index ?? 0, ...style } as CSSProperties} {...rest}>
      {(title || eyebrow || actions) && (
        <header className={styles.header}>
          <div className={styles.titles}>
            {eyebrow && <div className="t-overline">{eyebrow}</div>}
            {title && <h2 className={styles.title}>{title}</h2>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
