"use client";

import { ExternalLink, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { LED } from "@/components/horizon/LED";
import type { TemplateSecret } from "@/types/api";

import styles from "./SecretInput.module.css";

/* One key a template wants. Already-present keys can be left blank; the value is never shown. */
export function SecretInput({
  secret: s,
  value,
  onChange,
}: {
  secret: TemplateSecret;
  value: string;
  onChange: (value: string) => void;
}) {
  const [reveal, setReveal] = useState(false);
  const id = `secret-${s.env}`;
  const lit = s.present || value.trim().length > 0;

  return (
    <div className={styles.secret}>
      <div className={styles.head}>
        <LED
          size={7}
          color={lit ? "var(--status-success)" : s.required ? "var(--status-warn)" : "var(--status-idle)"}
          label={lit ? "set" : "not set"}
        />
        <label htmlFor={id} className={styles.label}>
          {s.label}
        </label>
        <code className={styles.env}>{s.env}</code>
        {!s.required && <span className={styles.optional}>optional</span>}
        {s.url && (
          <a href={s.url} target="_blank" rel="noreferrer" className={styles.link}>
            get one <ExternalLink size={10} />
          </a>
        )}
      </div>
      <div className={styles.inputWrap}>
        <input
          id={id}
          className={styles.input}
          type={reveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={s.present ? "Already set on this machine; paste to replace" : `Paste your ${s.label} key`}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className={styles.reveal}
          onClick={() => setReveal((r) => !r)}
          aria-label={reveal ? "Hide key" : "Show key"}
        >
          {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      <div className={styles.purpose}>
        {s.purpose}{" "}
        {s.scope === "global"
          ? "Saved to ~/.hud/.env for every environment."
          : "Saved to this environment's .env only."}
      </div>
    </div>
  );
}
