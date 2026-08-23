import { createHash } from "crypto";
import { CollectorLog, CollectorSourceConfig, CollectorSummary, SuspensionRecord } from "@/types";
import { COLLECTOR_SOURCES } from "@/data/sources";
import { normalizeAnnouncementSegments } from "./normalizer";
import { evaluateSuspensionLifecycle } from "./lifecycle";
import { appendCollectorLogs, upsertCollectedSuspensionRecord } from "./storage";
import { isSourceEligible, isSourceOperational } from "./sourcePolicy";
import { MediaCollectorAdapter } from "./sources/mediaAdapter";
import { SourceCollectorAdapter } from "./sources/types";

export interface CollectorEngineOptions {
  sources?: CollectorSourceConfig[];
  mediaAdapter?: SourceCollectorAdapter;
  now?: () => Date;
}

export class CollectorEngine {
  private readonly sources: CollectorSourceConfig[];
  private readonly mediaAdapter: SourceCollectorAdapter;
  private readonly now: () => Date;

  constructor(options: CollectorEngineOptions = {}) {
    this.sources = (options.sources || COLLECTOR_SOURCES).map((source) => ({ ...source }));
    this.mediaAdapter = options.mediaAdapter || new MediaCollectorAdapter();
    this.now = options.now || (() => new Date());
  }

  public getSources(): CollectorSourceConfig[] {
    return this.sources.map((source) => ({ ...source }));
  }

  public toggleSource(sourceId: string, enabled: boolean): boolean {
    const source = this.sources.find((candidate) => candidate.id === sourceId);
    if (!source) return false;
    if (enabled && !isSourceOperational(source)) {
      source.enabled = false;
      return false;
    }
    source.enabled = enabled;
    return true;
  }

  public async runSweep(): Promise<CollectorSummary> {
    const runStarted = this.now();
    const runId = `run-${runStarted.getTime()}`;
    const startedAt = runStarted.toISOString();
    const logs: CollectorLog[] = [];
    const eligibleSources = this.sources.filter(isSourceEligible);

    let sourcesSucceeded = 0;
    let sourcesFailed = 0;
    let announcementsDiscovered = 0;
    let announcementsValidated = 0;
    let announcementsPublished = 0;
    let announcementsRejected = 0;
    let announcementsHeld = 0;
    const sourceHealth: CollectorSummary["sourceHealth"] = [];

    const addLog = (
      level: CollectorLog["level"],
      sourceId: string,
      sourceName: string,
      message: string,
      details?: Record<string, unknown>
    ) => {
      const timestamp = this.now().toISOString();
      logs.push({
        id: `log-${timestamp}-${logs.length}`,
        runId,
        timestamp,
        level,
        sourceId,
        sourceName,
        message,
        details,
      });
    };

    addLog("info", "engine", "Collector Engine", `Starting Tier 3 collection sweep ${runId}.`);

    for (const source of this.sources) {
      if (!isSourceEligible(source)) {
        const reason = !isSourceOperational(source) ? `${source.operationalState}; Tier ${source.reliabilityTier} is not operational` : "disabled";
        addLog("info", source.id, source.name, `Skipped source (${reason}).`);
        continue;
      }

      try {
        addLog("info", source.id, source.name, `Polling live source: ${source.url}`);
        const discovery = await this.mediaAdapter.fetchAnnouncements(source);
        source.healthStatus = discovery.health;
        source.healthMessage = discovery.message;
        source.lastCheckedAt = this.now().toISOString();
        sourceHealth.push({
          sourceId: source.id,
          health: discovery.health,
          candidateCount: discovery.candidateCount,
          message: discovery.message,
        });
        if (discovery.health === "blocked" || discovery.health === "failed") {
          sourcesFailed++;
          source.lastStatus = "error";
          source.consecutiveFailures += 1;
          source.lastErrorMessage = discovery.message || `Source ${discovery.health}`;
          addLog("error", source.id, source.name, `Discovery ${discovery.health}: ${source.lastErrorMessage}`, {
            health: discovery.health,
            candidateCount: discovery.candidateCount,
          });
          continue;
        }

        const rawItems = discovery.items;
        announcementsDiscovered += rawItems.length;
        source.lastStatus = "success";
        source.lastErrorMessage = undefined;
        source.totalCollected += rawItems.length;
        source.consecutiveFailures = 0;
        sourcesSucceeded++;
        addLog(
          discovery.health === "reachable_no_candidates" ? "info" : "success",
          source.id,
          source.name,
          discovery.health === "reachable_no_candidates"
            ? discovery.message || "Discovery reachable with no recent candidates."
            : `Discovery healthy: ${discovery.candidateCount} candidate(s), ${rawItems.length} article(s) fetched.`,
          { health: discovery.health, candidateCount: discovery.candidateCount }
        );

        for (const item of rawItems) {
          const parsedStatements = normalizeAnnouncementSegments(item.rawText, {
            articleTitle: item.title,
            publishedAt: item.publishedAt,
            now: runStarted,
          });

          for (const parsed of parsedStatements) {
            if (!parsed.publishable) {
              if (parsed.scopeKind === "school") {
                announcementsHeld++;
                addLog("info", source.id, source.name, "Held school-specific announcement outside the live LGU pipeline.", {
                  schoolId: parsed.schoolId,
                  evidenceExcerpt: parsed.evidenceExcerpt,
                });
              } else {
                announcementsRejected++;
                addLog("warn", source.id, source.name, `Rejected statement: ${parsed.rejectionReason}.`, {
                  evidenceExcerpt: parsed.evidenceExcerpt,
                  articleUrl: item.canonicalUrl,
                });
              }
              continue;
            }

            announcementsValidated++;
            for (const lguId of parsed.matchedLguIds) {
              const collectedAt = this.now().toISOString();
              const recordHash = createHash("sha256")
                .update(`${source.id}|${item.canonicalUrl}|${parsed.evidenceExcerpt}|${lguId}`)
                .digest("hex")
                .slice(0, 20);
              const baseRecord: SuspensionRecord = {
                id: `tier3-${recordHash}`,
                lguId,
                status: parsed.status,
                affectedLevels: parsed.affectedLevels,
                schoolSector: parsed.schoolSector,
                effectiveDate: parsed.effectiveDate,
                startTime: parsed.startTime,
                endTime: parsed.endTime,
                isAllDay: parsed.isAllDay,
                reason: parsed.reason,
                announcementSummary: parsed.summary,
                fullAnnouncementText: item.rawText,
                source: {
                  id: source.id,
                  name: source.name,
                  organization: source.organization,
                  url: item.canonicalUrl,
                  type: "news-reputable",
                  reliabilityTier: 3,
                  verified: false,
                  publishedAt: item.publishedAt,
                  updatedAt: item.updatedAt,
                  articleTitle: item.title,
                  evidenceExcerpt: parsed.evidenceExcerpt,
                  evidenceFingerprint: item.evidenceFingerprint,
                },
                confidence: "medium",
                discoveredAt: collectedAt,
                publishedAt: item.publishedAt,
                lifecycleState: "validated",
                isActive: false,
                isUpcoming: false,
                isExpired: false,
                isDemo: false,
                parserOutcome: parsed.parserOutcome,
                collectorProvenance: {
                  pipeline: "tier3-media",
                  runId,
                  collectedAt,
                },
              };
              const lifecycle = evaluateSuspensionLifecycle(baseRecord);
              const finalRecord: SuspensionRecord = {
                ...baseRecord,
                lifecycleState: lifecycle.state,
                isActive: lifecycle.isActive,
                isUpcoming: lifecycle.isUpcoming,
                isExpired: lifecycle.isExpired,
              };
              const result = await upsertCollectedSuspensionRecord(finalRecord);
              if (result.action === "held") {
                announcementsHeld++;
                addLog("warn", source.id, source.name, `Held conflicting statement for ${lguId.toUpperCase()}.`, {
                  reason: result.reason,
                  articleUrl: item.canonicalUrl,
                });
                continue;
              }
              announcementsPublished++;
              addLog("success", source.id, source.name, `${result.action} Tier 3 record for ${lguId.toUpperCase()} (${finalRecord.effectiveDate}).`, {
                recordId: result.record.id,
                confidence: result.record.confidence,
                articleUrl: item.canonicalUrl,
              });
            }
          }
        }
      } catch (error: unknown) {
        sourcesFailed++;
        source.lastCheckedAt = this.now().toISOString();
        source.lastStatus = "error";
        source.healthStatus = "failed";
        source.healthMessage = error instanceof Error ? error.message : String(error);
        source.consecutiveFailures += 1;
        source.lastErrorMessage = error instanceof Error ? error.message : String(error);
        sourceHealth.push({
          sourceId: source.id,
          health: "failed",
          candidateCount: 0,
          message: source.lastErrorMessage,
        });
        addLog("error", source.id, source.name, `Live source failed: ${source.lastErrorMessage}`);
      }
    }

    const completedAt = this.now().toISOString();
    addLog(
      sourcesFailed > 0 ? "warn" : "success",
      "engine",
      "Collector Engine",
      `Sweep complete: ${announcementsPublished} published, ${announcementsHeld} held, ${announcementsRejected} rejected.`
    );
    await appendCollectorLogs(logs);

    return {
      runId,
      startedAt,
      completedAt,
      sourcesConfigured: this.sources.length,
      sourcesEligible: eligibleSources.length,
      sourcesSkipped: this.sources.length - eligibleSources.length,
      sourcesProcessed: eligibleSources.length,
      sourcesSucceeded,
      sourcesFailed,
      announcementsDiscovered,
      announcementsValidated,
      announcementsPublished,
      announcementsRejected,
      announcementsHeld,
      sourceHealth,
      logs,
    };
  }
}

export const globalCollector = new CollectorEngine();
