import type { Metadata } from "next";

import { EnvsView } from "@/components/envs/EnvsView";

export const metadata: Metadata = { title: "Environments" };

export default function EnvsPage() {
  return <EnvsView />;
}
