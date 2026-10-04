import { RunView } from "@/components/trace/RunView";

export default async function RunPage({ params }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  return <RunView id={id} />;
}
