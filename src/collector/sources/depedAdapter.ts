import { CollectorSourceConfig } from "@/types";
import { SourceCollectorAdapter, SourceDiscoveryResult } from "./types";

/** Tier 1 adapter placeholder. Runtime policy prevents invocation. */
export class DepEdCollectorAdapter implements SourceCollectorAdapter {
  async fetchAnnouncements(_config: CollectorSourceConfig): Promise<SourceDiscoveryResult> {
    return { health: "failed", items: [], candidateCount: 0, message: "Tier 1 is under development" };
  }
}
