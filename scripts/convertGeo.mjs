import fs from "fs";

// Source: faeldon/philippines-json-maps (MIT), pinned for reproducible output.
// See THIRD_PARTY_NOTICES.md for the required copyright and license notice.
const upstreamRevision = "8eeead560246863c8c820c31ca6fbca81a279477";
const upstreamBaseUrl =
  `https://raw.githubusercontent.com/faeldon/philippines-json-maps/${upstreamRevision}/2023/geojson/provdists/hires`;
const ncrDistricts = ["1303900000", "1307400000", "1307500000", "1307600000"];

async function main() {
  const results = await Promise.all(
    ncrDistricts.map((d) =>
      fetch(
        `${upstreamBaseUrl}/municities-provdist-${d}.0.1.json`
      ).then((r) => {
        if (!r.ok) throw new Error(`Unable to fetch NCR geometry (${r.status} ${r.statusText})`);
        return r.json();
      })
    )
  );

  const allFeatures = results.flatMap((r) => r.features);

  const minLon = 120.9065588090001;
  const maxLon = 121.13503641400007;
  const minLat = 14.351729568000051;
  const maxLat = 14.785291728000058;

  const width = 800;
  const height = 1000;
  const padding = 50;

  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;

  const scaleX = (width - 2 * padding) / lonSpan;
  const scaleY = (height - 2 * padding) / latSpan;
  const scale = Math.min(scaleX, scaleY);

  const actualWidth = lonSpan * scale;
  const actualHeight = latSpan * scale;
  const offsetX = (width - actualWidth) / 2;
  const offsetY = (height - actualHeight) / 2;

  function project(lon, lat) {
    const x = offsetX + (lon - minLon) * scale;
    const y = height - (offsetY + (lat - minLat) * scale); // Invert Y for SVG
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  }

  function ringToPath(ring) {
    return (
      ring
        .map((pt, i) => {
          const [x, y] = project(pt[0], pt[1]);
          return (i === 0 ? "M " : "L ") + x + " " + y;
        })
        .join(" ") + " Z"
    );
  }

  function computeCentroid(coords) {
    let sumX = 0,
      sumY = 0,
      count = 0;
    function walk(c) {
      if (typeof c[0] === "number") {
        const [x, y] = project(c[0], c[1]);
        sumX += x;
        sumY += y;
        count++;
      } else {
        c.forEach(walk);
      }
    }
    walk(coords);
    return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
  }

  const lguMapping = {
    "City of Manila": { id: "manila", name: "City of Manila" },
    "City of Mandaluyong": { id: "mandaluyong", name: "Mandaluyong" },
    "City of Marikina": { id: "marikina", name: "Marikina" },
    "City of Pasig": { id: "pasig", name: "Pasig" },
    "Quezon City": { id: "quezon-city", name: "Quezon City" },
    "City of San Juan": { id: "san-juan", name: "San Juan" },
    "City of Caloocan": { id: "caloocan", name: "Caloocan" },
    "City of Malabon": { id: "malabon", name: "Malabon" },
    "City of Navotas": { id: "navotas", name: "Navotas" },
    "City of Valenzuela": { id: "valenzuela", name: "Valenzuela" },
    "City of Las Piñas": { id: "las-pinas", name: "Las Piñas" },
    "City of Makati": { id: "makati", name: "Makati" },
    "City of Muntinlupa": { id: "muntinlupa", name: "Muntinlupa" },
    "City of Parañaque": { id: "paranaque", name: "Parañaque" },
    "Pasay City": { id: "pasay", name: "Pasay" },
    "City of Taguig": { id: "taguig", name: "Taguig" },
    Pateros: { id: "pateros", name: "Pateros" },
  };

  const geoPaths = [];

  for (const f of allFeatures) {
    const rawName = f.properties.adm3_en;
    const meta = lguMapping[rawName];
    if (!meta) continue;

    if (meta.id === "caloocan") {
      const poly1 = f.geometry.coordinates[0];
      const poly2 = f.geometry.coordinates[1];

      const c1 = computeCentroid(poly1);
      const c2 = computeCentroid(poly2);

      // In inverted SVG space, North has smaller Y (higher on screen)
      const northPoly = c1.y < c2.y ? poly1 : poly2;
      const southPoly = c1.y < c2.y ? poly2 : poly1;
      const northC = c1.y < c2.y ? c1 : c2;
      const southC = c1.y < c2.y ? c2 : c1;

      geoPaths.push({
        id: "caloocan-north",
        lguId: "caloocan",
        name: "Caloocan (North)",
        subArea: "North",
        d: ringToPath(northPoly[0]),
        labelX: northC.x,
        labelY: northC.y,
        badgeX: northC.x,
        badgeY: northC.y - 18,
      });

      geoPaths.push({
        id: "caloocan-south",
        lguId: "caloocan",
        name: "Caloocan (South)",
        subArea: "South",
        d: ringToPath(southPoly[0]),
        labelX: southC.x,
        labelY: southC.y,
        badgeX: southC.x,
        badgeY: southC.y - 18,
      });
    } else if (f.geometry.type === "MultiPolygon") {
      const paths = f.geometry.coordinates.map((p) => ringToPath(p[0])).join(" ");
      const centroid = computeCentroid(f.geometry.coordinates);
      geoPaths.push({
        id: meta.id,
        lguId: meta.id,
        name: meta.name,
        d: paths,
        labelX: centroid.x,
        labelY: centroid.y,
        badgeX: centroid.x,
        badgeY: centroid.y - 18,
      });
    } else {
      const d = ringToPath(f.geometry.coordinates[0]);
      const centroid = computeCentroid(f.geometry.coordinates);
      geoPaths.push({
        id: meta.id,
        lguId: meta.id,
        name: meta.name,
        d: d,
        labelX: centroid.x,
        labelY: centroid.y,
        badgeX: centroid.x,
        badgeY: centroid.y - 18,
      });
    }
  }

  // Label coordinate adjustments for small/compact municipalities so labels are clear and never overlap
  const labelOverrides = {
    pateros: { labelX: 472, labelY: 530, badgeX: 472, badgeY: 512 },
    "san-juan": { labelX: 375, labelY: 410, badgeX: 375, badgeY: 392 },
    mandaluyong: { labelX: 385, labelY: 460, badgeX: 385, badgeY: 442 },
    navotas: { labelX: 200, labelY: 290, badgeX: 200, badgeY: 272 },
    malabon: { labelX: 245, labelY: 250, badgeX: 245, badgeY: 232 },
    "caloocan-south": { labelX: 275, labelY: 315, badgeX: 275, badgeY: 297 },
    "caloocan-north": { labelX: 420, labelY: 130, badgeX: 420, badgeY: 110 },
    manila: { labelX: 240, labelY: 420, badgeX: 240, badgeY: 395 },
    makati: { labelX: 360, labelY: 525, badgeX: 360, badgeY: 505 },
    pasay: { labelX: 270, labelY: 520, badgeX: 270, badgeY: 495 },
    pasig: { labelX: 525, labelY: 485, badgeX: 525, badgeY: 465 },
    "quezon-city": { labelX: 460, labelY: 280, badgeX: 460, badgeY: 255 },
    marikina: { labelX: 600, labelY: 360, badgeX: 600, badgeY: 338 },
    valenzuela: { labelX: 290, labelY: 175, badgeX: 290, badgeY: 152 },
    taguig: { labelX: 485, labelY: 625, badgeX: 485, badgeY: 600 },
    paranaque: { labelX: 310, labelY: 650, badgeX: 310, badgeY: 625 },
    "las-pinas": { labelX: 245, labelY: 740, badgeX: 245, badgeY: 715 },
    muntinlupa: { labelX: 365, labelY: 800, badgeX: 365, badgeY: 775 },
  };

  geoPaths.forEach((p) => {
    if (labelOverrides[p.id]) {
      Object.assign(p, labelOverrides[p.id]);
    }
  });

  const tsContent = `import { LGUId } from "@/types";

export interface GeoPathItem {
  id: string;
  lguId: LGUId;
  name: string;
  subArea?: "North" | "South";
  d: string;
  labelX: number;
  labelY: number;
  badgeX: number;
  badgeY: number;
}

/**
 * Derived from faeldon/philippines-json-maps at revision ${upstreamRevision} (MIT).
 * Four NCR district GeoJSON files are projected into the 800x1000 SVG coordinate
 * space and rounded to one decimal place. Caloocan's two polygons remain visually
 * separate while sharing the logical LGUId "caloocan". See THIRD_PARTY_NOTICES.md.
 */
export const NCR_GEO_PATHS: GeoPathItem[] = ${JSON.stringify(geoPaths, null, 2)};
`;

  fs.writeFileSync("src/data/ncrGeoData.ts", tsContent, "utf-8");
  console.log("Successfully generated real geographic SVG boundaries in src/data/ncrGeoData.ts!");
}

main().catch(console.error);
