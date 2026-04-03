import { redirect } from "next/navigation";

// Runs are started from the study page — redirect there
export default function NewRunPage() {
  redirect("/");
}
