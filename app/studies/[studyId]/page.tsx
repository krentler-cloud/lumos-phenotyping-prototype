import { redirect } from "next/navigation";

export default async function StudyPage({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  redirect(`/studies/${studyId}/overview`);
}
