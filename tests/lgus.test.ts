import { describe, expect, it } from "vitest";
import { ALL_LGU_IDS, NCR_LGUS } from "@/data/lgus";
import type { LGUId } from "@/types";

const EXPECTED_MAYORS_2025_2028 = {
  caloocan: "Along Malapitan",
  "las-pinas": "April Aguilar",
  makati: "Nancy Binay",
  malabon: "Jeannie Sandoval",
  mandaluyong: "Menchie Abalos",
  manila: "Isko Moreno Domagoso",
  marikina: "Maan Teodoro",
  muntinlupa: "Ruffy Biazon",
  navotas: "John Rey Tiangco",
  paranaque: "Edwin Olivarez",
  pasay: "Emi Calixto-Rubiano",
  pasig: "Vico Sotto",
  pateros: "Gerald German",
  "quezon-city": "Joy Belmonte",
  "san-juan": "Francis Zamora",
  taguig: "Lani Cayetano",
  valenzuela: "Wes Gatchalian",
} satisfies Record<LGUId, string>;

describe("NCR LGU metadata", () => {
  it("lists the current mayors for all 17 LGUs for the 2025–2028 term", () => {
    expect(ALL_LGU_IDS).toHaveLength(17);
    expect(
      Object.fromEntries(ALL_LGU_IDS.map((id) => [id, NCR_LGUS[id].mayor])),
    ).toEqual(EXPECTED_MAYORS_2025_2028);
  });
});
