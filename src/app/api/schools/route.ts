import { NextRequest, NextResponse } from "next/server";
import { NCR_SCHOOLS } from "@/data/schools";
import { NCR_LGUS } from "@/data/lgus";
import { getSuspensions } from "@/collector/storage";
import { deriveSchoolStatus } from "@/collector/lifecycle";
import { projectPublicSuspension } from "@/lib/admin/publicProjection";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim().toLowerCase();
  const lguFilter = searchParams.get("lgu");

  const records = await getSuspensions();

  const enrichedSchools = NCR_SCHOOLS.map((school) => {
    const lguInfo = NCR_LGUS[school.lguId];
    const derived = deriveSchoolStatus(school, records);

    return {
      ...school,
      lguName: lguInfo?.name || school.lguId,
      status: derived.status,
      primaryRecord: derived.primaryRecord ? projectPublicSuspension(derived.primaryRecord) : undefined,
      hasUpcoming: derived.hasUpcoming,
      upcomingRecord: derived.upcomingRecord ? projectPublicSuspension(derived.upcomingRecord) : undefined,
    };
  });

  let results = enrichedSchools;

  if (lguFilter) {
    results = results.filter((s) => s.lguId === lguFilter);
  }

  if (query) {
    results = results.filter((s) => {
      const matchName = s.name.toLowerCase().includes(query);
      const matchAcronym = s.acronym.toLowerCase().includes(query);
      const matchCampus = s.campusName?.toLowerCase().includes(query) || false;
      const matchAddress = s.address.toLowerCase().includes(query);
      const matchLgu = s.lguName.toLowerCase().includes(query);
      const matchAlias = s.aliases.some((alias) => alias.toLowerCase().includes(query));

      return matchName || matchAcronym || matchCampus || matchAddress || matchLgu || matchAlias;
    });
  }

  return NextResponse.json({
    count: results.length,
    schools: results,
  });
}
