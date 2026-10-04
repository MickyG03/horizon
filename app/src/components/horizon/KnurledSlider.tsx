"use client";

import { Slider } from "radix-ui";

import styles from "./KnurledSlider.module.css";

type KnurledSliderProps = {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  display?: (value: number) => string;
};

/* A slider with a ridged thumb you can "grip". */
export function KnurledSlider({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  label,
  display,
}: KnurledSliderProps) {
  return (
    <div className={styles.wrap}>
      <span className={styles.label}>{label}</span>
      <Slider.Root
        className={styles.root}
        value={[value]}
        onValueChange={([v]) => onValueChange(v)}
        min={min}
        max={max}
        step={step}
        aria-label={label}
      >
        <Slider.Track className={styles.track}>
          <Slider.Range className={styles.range} />
        </Slider.Track>
        <Slider.Thumb className={styles.thumb} />
      </Slider.Root>
      <span className={`${styles.value} t-num`}>{display ? display(value) : value}</span>
    </div>
  );
}
