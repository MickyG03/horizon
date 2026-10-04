import type { CSSProperties } from "react";

import styles from "./LED.module.css";

type LEDProps = {
  color: string;
  pulse?: boolean;
  size?: number;
  label?: string;
};

/* A small indicator lamp. Lit colour glows; `pulse` breathes for in-flight states. */
export function LED({ color, pulse, size = 8, label }: LEDProps) {
  const style = { "--led-color": color, "--led-size": `${size}px` } as CSSProperties;
  return (
    <span
      className={styles.led}
      data-pulse={pulse || undefined}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
