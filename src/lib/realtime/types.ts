export type RealtimeNamespace = "preview" | "production";

export interface ClassStatusRealtimeConfig {
  url: string;
  publishableKey: string;
  namespace: RealtimeNamespace;
}

export interface PublicAnnouncement {
  id: string;
  message: string;
  createdAt: string;
  expiresAt: string;
}

export interface PublicTrafficMetrics {
  totalVisits: number;
  todayVisits: number;
  last15Minutes: number;
  activeNow: number;
  mostViewed: Array<{ id: string; count: number }>;
}
