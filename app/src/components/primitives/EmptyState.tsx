import type { ReactNode } from "react";

import { Mosaic } from "@/components/horizon/Mosaic";

import styles from "./EmptyState.module.css";

type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <div className={styles.mosaic}>
        <Mosaic shape="band" tone="cool" cell={4} gap={3} intensity={0.35} />
      </div>
      {icon && <div className={styles.icon}>{icon}</div>}
      <div className={styles.title}>{title}</div>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
