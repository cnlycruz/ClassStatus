import { CollectorSourceConfig, SourceCitation, SourceHealthStatus } from "@/types";

export interface RawAnnouncementItem {
  rawText: string;
  sourceUrl: string;
  sourceName: string;
  organization: string;
  reliabilityTier: 1 | 2 | 3;
  sourceType: SourceCitation["type"];
  publishedAt: string;
  updatedAt?: string;
  title: string;
  canonicalUrl: string;
  evidenceFingerprint: string;
  discoveryPublishedAt?: string;
  discoverySummary?: string;
}

export interface SourceDiscoveryResult {
  health: SourceHealthStatus;
  items: RawAnnouncementItem[];
  candidateCount: number;
  message?: string;
}

export interface SourceCollectorAdapter {
  fetchAnnouncements(config: CollectorSourceConfig): Promise<SourceDiscoveryResult>;
}
