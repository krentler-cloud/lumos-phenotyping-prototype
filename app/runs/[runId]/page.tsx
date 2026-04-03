import ProcessingStatus from "@/components/ProcessingStatus";

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <ProcessingStatus runId={runId} />;
}
