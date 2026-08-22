import { describe, it, expect } from "vitest";
import { NCR_SCHOOLS } from "../src/data/schools";
import { ALL_LGU_IDS } from "../src/data/lgus";

describe("NCR Schools & Universities Dataset", () => {
  it("includes all required major universities with verified aliases", () => {
    const acronyms = NCR_SCHOOLS.map((s) => s.acronym);

    expect(acronyms).toContain("UST");
    expect(acronyms).toContain("DLSU");
    expect(acronyms).toContain("PUP");
    expect(acronyms).toContain("UPD");
    expect(acronyms).toContain("ADMU");
    expect(acronyms).toContain("FEU");
    expect(acronyms).toContain("NU");
    expect(acronyms).toContain("UE");
    expect(acronyms).toContain("CEU");
    expect(acronyms).toContain("LPU");
    expect(acronyms).toContain("MAPUA");
    expect(acronyms).toContain("SBU");
    expect(acronyms).toContain("PLM");
  });

  it("maps every school to a valid NCR LGU id", () => {
    NCR_SCHOOLS.forEach((school) => {
      expect(ALL_LGU_IDS).toContain(school.lguId);
      expect(school.name).toBeDefined();
      expect(school.acronym).toBeDefined();
      expect(school.sector).toMatch(/^(public|private)$/);
      expect(school.levelsOffered.length).toBeGreaterThan(0);
    });
  });

  it("supports Caloocan multi-campus distribution", () => {
    const uccSchools = NCR_SCHOOLS.filter((s) => s.name.includes("Caloocan"));
    expect(uccSchools.length).toBeGreaterThanOrEqual(2);
    expect(uccSchools.some((s) => s.campusName?.includes("North"))).toBe(true);
    expect(uccSchools.some((s) => s.campusName?.includes("South"))).toBe(true);
  });
});
