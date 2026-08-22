import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { AdminConsoleClient } from "./AdminConsoleClient";

export const dynamic = "force-dynamic";
export default async function CollectorPage() {
  const session = await getAdminSession();
  if (!session) redirect("/collector/login");
  return <AdminConsoleClient />;
}
