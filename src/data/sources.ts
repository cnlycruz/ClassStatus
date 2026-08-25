import { CollectorSourceConfig } from "@/types";

const underDevelopment = {
  operationalState: "under-development" as const,
  enabled: false,
  totalCollected: 0,
  consecutiveFailures: 0,
};

const operational = {
  operationalState: "operational" as const,
  enabled: true,
  totalCollected: 0,
  consecutiveFailures: 0,
};

export const OPERATIONAL_COLLECTOR_SOURCES: CollectorSourceConfig[] = [
  {
    id: "rappler-walang-pasok",
    name: "Rappler #WalangPasok Class Suspension Tracker",
    organization: "Rappler Philippines",
    url: "https://www.rappler.com/topic/class-suspensions/",
    type: "news-reputable",
    reliabilityTier: 3,
    checkIntervalMinutes: 1,
    ...operational,
  },
  {
    id: "gma-news-walang-pasok",
    name: "GMA Integrated News #WalangPasok Feed",
    organization: "GMA Network",
    url: "https://data.gmanetwork.com/gno/rss/serbisyopubliko/walangpasok/feed.xml",
    type: "news-reputable",
    reliabilityTier: 3,
    checkIntervalMinutes: 1,
    ...operational,
  },
];

const operationalSourceIds = new Set(OPERATIONAL_COLLECTOR_SOURCES.map((source) => source.id));

export function isCurrentOperationalSourceId(sourceId: string): boolean {
  return operationalSourceIds.has(sourceId);
}

export const COLLECTOR_SOURCES: CollectorSourceConfig[] = [
  // Tier 1 stays registered for future development, but is hard-disabled by policy.
  {
    id: "deped-ncr",
    name: "DepEd National Capital Region Advisory",
    organization: "Department of Education (DepEd)",
    url: "https://www.deped.gov.ph/category/advisories",
    type: "deped",
    reliabilityTier: 1,
    checkIntervalMinutes: 10,
    ...underDevelopment,
  },
  {
    id: "ched-ncr",
    name: "Commission on Higher Education (CHED) NCR",
    organization: "CHED NCR Regional Office",
    url: "https://ched.gov.ph/advisories",
    type: "ched",
    reliabilityTier: 1,
    checkIntervalMinutes: 15,
    ...underDevelopment,
  },
  {
    id: "pagasa-weather",
    name: "PAGASA Severe Weather & Rainfall Bulletin",
    organization: "DOST-PAGASA",
    url: "https://bagong.pagasa.dost.gov.ph/weather",
    type: "pagasa",
    reliabilityTier: 1,
    checkIntervalMinutes: 10,
    ...underDevelopment,
  },
  {
    id: "mmda-metrobase",
    name: "MMDA Metrobase Flood & Traffic Advisory",
    organization: "Metropolitan Manila Development Authority",
    url: "https://mmda.gov.ph/advisories",
    type: "ndrrmc-mmda",
    reliabilityTier: 1,
    checkIntervalMinutes: 10,
    ...underDevelopment,
  },
  ...[
    ["manila-pio", "City of Manila Public Information Office", "Manila PIO", "https://facebook.com/ManilaPIO"],
    ["qc-gov-pio", "Quezon City Government Press Office", "QC Government Public Information Office", "https://quezoncity.gov.ph/news-and-updates"],
    ["caloocan-pio", "Caloocan City Public Information Office", "Caloocan City Government", "https://caloocancity.gov.ph/announcements"],
    ["makati-pio", "MyMakati Official City Bulletin", "Makati City Government", "https://makati.gov.ph/announcements"],
    ["taguig-pio", "I Love Taguig Advisory Desk", "City Government of Taguig", "https://taguig.gov.ph/advisories"],
    ["pasig-pio", "Pasig City Public Information Office", "Pasig City Government", "https://pasigcity.gov.ph/news"],
  ].map(([id, name, organization, url]) => ({
    id,
    name,
    organization,
    url,
    type: "official-lgu" as const,
    reliabilityTier: 1 as const,
    checkIntervalMinutes: 5,
    ...underDevelopment,
  })),

  // Tier 2 has no configured source yet. Its disabled state is defined centrally.

  // Tier 3 is the only operational collector tier.
  ...OPERATIONAL_COLLECTOR_SOURCES,
];
