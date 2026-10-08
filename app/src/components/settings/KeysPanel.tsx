"use client";

import { ExternalLink, Eye, EyeOff, KeyRound } from "lucide-react";
import { useState } from "react";

import { LED } from "@/components/horizon/LED";
import { Panel } from "@/components/horizon/Panel";
import { Button } from "@/components/primitives/Button";
import { ApiError } from "@/lib/api";
import { useKeys, useRemoveKey, useSaveKey } from "@/lib/queries";
import type { ProviderKey } from "@/types/api";

import styles from "./KeysPanel.module.css";

export function KeysPanel() {
  const { data: rows = [] } = useKeys();
  return (
    <Panel
      eyebrow="API keys"
      title="Model providers"
      actions={<KeyRound size={16} className={styles.headIcon} />}
    >
      <p className={styles.note}>
        Keys are saved to <code>~/.hud/.env</code>, the same file <code>hud set</code> writes, and
        take effect on the next run. Horizon only ever shows the last four characters.
      </p>
      <ul className={styles.list}>
        {rows.map((row) => (
          <KeyRow key={row.provider} row={row} />
        ))}
      </ul>
    </Panel>
  );
}

function KeyRow({ row }: { row: ProviderKey }) {
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [editing, setEditing] = useState(false);
  const save = useSaveKey();
  const remove = useRemoveKey();
  const error =
    save.error instanceof ApiError ? String(save.error.detail) : save.error ? String(save.error) : null;
  const showInput = editing || !row.set;

  const submit = async () => {
    if (!value.trim()) return;
    await save.mutateAsync({ provider: row.provider, value: value.trim() });
    setValue("");
    setEditing(false);
    setReveal(false);
  };

  return (
    <li className={styles.row}>
      <div className={styles.who}>
        <LED color={row.set ? "var(--status-success)" : "var(--status-idle)"} size={7} />
        <div className={styles.whoText}>
          <span className={styles.label}>{row.label}</span>
          <a href={row.url} target="_blank" rel="noreferrer" className={styles.link}>
            {row.env} <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {showInput ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className={styles.inputWrap}>
            <input
              className={styles.input}
              type={reveal ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`Paste your ${row.label} key`}
              autoComplete="off"
              spellCheck={false}
              aria-label={`${row.label} API key`}
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
          <Button type="submit" variant="primary" size="sm" loading={save.isPending} disabled={!value.trim()}>
            Save
          </Button>
          {row.set && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </form>
      ) : (
        <div className={styles.saved}>
          <code className={styles.hint}>•••• {row.hint?.replace("…", "")}</code>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Replace
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={remove.isPending}
            onClick={() => {
              if (window.confirm(`Remove the ${row.label} key from ~/.hud/.env?`)) {
                remove.mutate(row.provider);
              }
            }}
          >
            Remove
          </Button>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </li>
  );
}
