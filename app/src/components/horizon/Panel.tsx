import type { ComponentPropsWithoutRef, ReactNode } from "react";

import styles from "./Panel.module.css";

type PanelProps = ComponentPropsWithoutRef<"section"> & {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  dense?: boolean;
};

/* The basic surface everything sits on: a slab with a lit top edge. */
export function Panel({ title, eyebrow, actions, dense, className, children, ...rest }: PanelProps) {
  const classes = [styles.panel, dense ? styles.dense : "", className ?? ""].join(" ").trim();
  return (
    <section className={classes} {...rest}>
      {(title || eyebrow || actions) && (
        <header className={styles.header}>
          <div>
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
