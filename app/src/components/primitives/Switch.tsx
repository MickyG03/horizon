import type { ReactNode } from "react";

import styles from "./Switch.module.css";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
};

/* A physical switch: recessed track that fills with ink when on, raised thumb that slides. */
export function Switch({ checked, onChange, label, hint, disabled }: SwitchProps) {
  return (
    <div className={styles.row} data-disabled={disabled || undefined}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={styles.track}
        data-on={checked || undefined}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.thumb} />
        <span className="visually-hidden">{label}</span>
      </button>
      <span className={styles.text} onClick={() => !disabled && onChange(!checked)}>
        <span className={styles.label}>{label}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </span>
    </div>
  );
}
