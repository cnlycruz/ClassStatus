import { globalCollector } from "@/collector/engine";
import { getCollectorFreshness, getCollectorLogs } from "@/collector/storage";
import { deriveCollectorHealth } from "@/collector/health";
import { NCR_LGUS } from "@/data/lgus";
import { NCR_SCHOOLS } from "@/data/schools";
import { listAudit } from "@/lib/admin/audit";
import { reconcileExpiredRemovals } from "@/lib/admin/suspensions";
import { effectiveAdminState } from "@/utils/administrativeState";
import { evaluateSuspensionLifecycle } from "@/collector/lifecycle";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/requestSecurity";
import { suspensionStore } from "@/lib/storage";
import { listManualBroadcastHistory } from "@/lib/notifications/storage";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await requireAdmin(); await reconcileExpiredRemovals();
    const state = await suspensionStore.readState();
    const records = state.records.filter((record) => effectiveAdminState(record) !== "removed" && !evaluateSuspensionLifecycle(record).isExpired);
    const sources = globalCollector.getSources().filter((source) => source.operationalState === "operational" && source.enabled);
    const [logs, freshness, manualNotifications] = await Promise.all([
      getCollectorLogs(),
      getCollectorFreshness().catch(() => ({ lastSuccessfulCheckAt: null })),
      listManualBroadcastHistory(10).catch(() => []),
    ]);
    return Response.json({ session, sources, health: deriveCollectorHealth(sources, logs, freshness), logs, records, audit: await listAudit(50), auditTotal: state.audit.length, manualNotifications, registries: { lgus: Object.values(NCR_LGUS).map(({ id, name }) => ({ id, name })), schools: NCR_SCHOOLS.map(({ id, name, campusName, lguId, sector, levelsOffered }) => ({ id, name, campusName, lguId, sector, levelsOffered })) } }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) { return adminErrorResponse(error); }
}
