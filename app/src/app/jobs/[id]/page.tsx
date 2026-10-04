import { JobView } from "@/components/jobs/JobView";

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  return <JobView id={id} />;
}
