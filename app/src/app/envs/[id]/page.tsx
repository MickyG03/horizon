import { EnvView } from "@/components/envs/EnvView";

export default async function EnvPage({ params }: PageProps<"/envs/[id]">) {
  const { id } = await params;
  return <EnvView id={id} />;
}
