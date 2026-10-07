import styles from "./HorizonBackdrop.module.css";

/* The scene behind every page: one continuous gradient from sky into ground with a warm glow at
   the horizon, a soft sun resting on a single lit line, and a flat field of fine gridlines that
   fades out toward the edges. Static CSS layers only: nothing here repaints while you scroll. */
export function HorizonBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden>
      <div className={styles.grid} />
      <div className={styles.sun} />
      <div className={styles.line} />
    </div>
  );
}
