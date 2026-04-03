export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const XYLO_STUDY_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

export default async function DashboardPage() {
  // On Railway the proxy password gate already authenticated the user.
  // Only enforce Supabase auth locally where PROTO_PASSWORD is not set.
  if (!process.env.PROTO_PASSWORD) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/auth");
  }

  // Redirect to the active study
  redirect(`/studies/${XYLO_STUDY_ID}`);
}
