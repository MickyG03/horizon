import type { CSSProperties } from "react";

import styles from "./Skeleton.module.css";

export function Skeleton({ width, height = 14, radius, style }: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`shimmer ${styles.skeleton}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden
    />
  );
}

/* A page-shaped placeholder: header, a row of tiles, a couple of panels. */
export function PageSkeleton({ tiles = 4, panels = 2 }: { tiles?: number; panels?: number }) {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading">
      <div className={styles.header}>
        <Skeleton width={90} height={10} />
        <Skeleton width="42%" height={40} radius={8} />
        <Skeleton width="30%" height={12} />
      </div>
      {tiles > 0 && (
        <div className={styles.tiles}>
          {Array.from({ length: tiles }, (_, i) => (
            <div key={i} className={`surface ${styles.tile}`}>
              <Skeleton width={70} height={10} />
              <Skeleton width={90} height={36} radius={6} />
              <Skeleton width="70%" height={10} />
            </div>
          ))}
        </div>
      )}
      {Array.from({ length: panels }, (_, i) => (
        <div key={i} className={`surface ${styles.panel}`}>
          <Skeleton width={120} height={10} />
          <Skeleton width="35%" height={16} />
          <Skeleton width="100%" height={10} />
          <Skeleton width="92%" height={10} />
          <Skeleton width="80%" height={10} />
        </div>
      ))}
    </div>
  );
}
