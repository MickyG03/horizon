import type { ComponentPropsWithoutRef, ReactNode } from "react";

import styles from "./Field.module.css";

type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
};

export function Field({ label, hint, error, htmlFor, children }: FieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        hint && <div className={styles.hint}>{hint}</div>
      )}
    </div>
  );
}

export function Input(props: ComponentPropsWithoutRef<"input">) {
  return <input {...props} className={`${styles.control} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentPropsWithoutRef<"select">) {
  return (
    <div className={styles.selectWrap}>
      <select {...props} className={`${styles.control} ${styles.select} ${props.className ?? ""}`} />
    </div>
  );
}

export function Textarea(props: ComponentPropsWithoutRef<"textarea">) {
  return (
    <textarea {...props} className={`${styles.control} ${styles.textarea} ${props.className ?? ""}`} />
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}
