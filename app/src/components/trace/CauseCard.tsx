"use client";

import { EyeOff, Eye } from "lucide-react";

import { LED } from "@/components/horizon/LED";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { useSetRunExcluded } from "@/lib/queries";
import { KIND_LABEL, causeOf, runColor } from "@/lib/triage";
import type { Run } from "@/types/api";

import styles from "./CauseCard.module.css";

/* The plain-English verdict: what happened, whose fault it was, and whether it counts. */
export function CauseCard({ run }: { run: Run }) {
  const cause = causeOf(run);
  const setExcluded = useSetRunExcluded();
  const live = run.status === "running" || run.status === "pending";

  if (live) {
    return (
      <div className={`surface rise ${styles.card}`} data-kind="running">
        <LED color="var(--status-running)" pulse size={10} />
        <div>
          <div className={styles.title}>Running</div>
          <p className={styles.summary}>Steps arrive below as the agent works.</p>
        </div>
      </div>
    );
  }

  if (!cause) return null;
  const color = runColor(run);
  const counts = (cause.kind === "ok" || cause.kind === "agent") && !run.excluded;

  return (
    <div className={`surface rise ${styles.card}`} data-kind={cause.kind}>
      <LED color={color} size={10} />
      <div className={styles.text}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{cause.label}</span>
          <Badge color={color} variant="outline" size="sm">
            {KIND_LABEL[cause.kind]}
          </Badge>
          {run.excluded && (
            <Badge color="var(--fg-faint)" variant="outline" size="sm">
              excluded manually
            </Badge>
          )}
        </div>
        <p className={styles.summary}>
          {cause.summary}{" "}
          {counts
            ? "This run counts toward the valid reward."
            : "This run is set aside from the valid reward; it still appears in the raw score."}
        </p>
        {run.error && <pre className={styles.error}>{run.error}</pre>}
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon={run.excluded ? <Eye size={13} /> : <EyeOff size={13} />}
        loading={setExcluded.isPending}
        onClick={() => setExcluded.mutate({ id: run.id, excluded: !run.excluded })}
        title={run.excluded ? "Count this run again" : "Exclude from aggregate scores"}
      >
        {run.excluded ? "Include" : "Exclude"}
      </Button>
    </div>
  );
}
