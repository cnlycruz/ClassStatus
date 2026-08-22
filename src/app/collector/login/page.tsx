import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export default async function CollectorLoginPage() {
  if (await getAdminSession({ touch: false })) redirect("/collector");
  return <LoginForm />;
}
