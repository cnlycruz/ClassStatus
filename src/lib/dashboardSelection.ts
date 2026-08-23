import { ALL_LGU_IDS } from "@/data/lgus";
import type { LGUId } from "@/types";

export function getInitialDashboardSelection(lguId: string | null): LGUId | null {
  return lguId && ALL_LGU_IDS.includes(lguId as LGUId) ? (lguId as LGUId) : null;
}
