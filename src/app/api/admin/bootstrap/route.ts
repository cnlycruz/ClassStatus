import { globalCollector } from "@/collector/engine";
import { getCollectorLogs } from "@/collector/storage";
import { NCR_LGUS } from "@/data/lgus";
import { NCR_SCHOOLS } from "@/data/schools";
import { listAudit } from "@/lib/admin/audit";
import { reconcileExpiredRemovals } from "@/lib/admin/suspensions";
import { effectiveAdminState } from "@/utils/administrativeState";
import { evaluateSuspensionLifecycle } from "@/collector/lifecycle";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/requestSecurity";
import { suspensionStore } from "@/lib/storage";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await requireAdmin(); reconcileExpiredRemovals();
    const state = suspensionStore.readState();
    const records = state.records.filter((record) => effectiveAdminState(record) !== "removed" && !evaluateSuspensionLifecycle(record).isExpired);
    return Response.json({ session, sources: globalCollector.getSources().filter((source) => source.operationalState === "operational" && source.enabled), logs: getCollectorLogs(), records, audit: listAudit(50), auditTotal: state.audit.length, registries: { lgus: Object.values(NCR_LGUS).map(({ id, name }) => ({ id, name })), schools: NCR_SCHOOLS.map(({ id, name, campusName, lguId, sector, levelsOffered }) => ({ id, name, campusName, lguId, sector, levelsOffered })) } }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) { return adminErrorResponse(error); }
}
