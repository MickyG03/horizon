import { GitCompare } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/primitives/EmptyState";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Compare" };

export default function ComparePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <PageHeader
        eyebrow="Compare"
        title="Models, side by side"
        description="Pick finished jobs on the same environment and see pass rates per task."
      />
      <EmptyState
        icon={<GitCompare size={20} />}
        title="Coming next"
        description="Comparison lands once the training-signal analytics are in: per-task pass rates across jobs, cost and time."
      />
    </div>
  );
}
