import styles from "./HorizonBackdrop.module.css";

/* The backdrop every glass panel sits over: three soft fields of colour that drift very slowly.
   Pure radial gradients, no blur filters, so it costs almost nothing to paint. */
export function HorizonBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden>
      <div className={`${styles.blob} ${styles.one}`} />
      <div className={`${styles.blob} ${styles.two}`} />
      <div className={`${styles.blob} ${styles.three}`} />
    </div>
  );
}
