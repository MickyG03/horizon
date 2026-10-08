import type { Metadata } from "next";
import { Suspense } from "react";

import { BuilderView } from "@/components/builder/BuilderView";

export const metadata: Metadata = { title: "New environment" };

export default function NewEnvPage() {
  return (
    <Suspense>
      <BuilderView />
    </Suspense>
  );
}
