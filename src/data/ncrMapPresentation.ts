export type MapLabelPlacement = {
  x: number;
  y: number;
  fontSize: number;
  textAnchor: "start" | "middle" | "end";
  text?: string;
  lines?: string[];
};

// Visual interior anchors shared by the interactive and share-card maps.
// They are kept separate from the PSGC geometry so label refinement cannot
// alter the underlying LGU boundaries.
export const NCR_MAP_LABEL_PLACEMENTS: Record<string, MapLabelPlacement> = {
  manila: { x: 344, y: 449, fontSize: 16, textAnchor: "middle", text: "Manila" },
  mandaluyong: { x: 439, y: 476, fontSize: 12, textAnchor: "middle" },
  marikina: { x: 588, y: 323, fontSize: 16, textAnchor: "middle" },
  pasig: { x: 522, y: 493, fontSize: 16, textAnchor: "middle" },
  "quezon-city": { x: 468, y: 278, fontSize: 17, textAnchor: "middle" },
  "san-juan": { x: 422, y: 430, fontSize: 12, textAnchor: "middle" },
  "caloocan-north": { x: 456, y: 108, fontSize: 14, textAnchor: "middle", lines: ["Caloocan", "(North)"] },
  "caloocan-south": { x: 307, y: 332, fontSize: 11, textAnchor: "middle", lines: ["Caloocan", "(South)"] },
  malabon: { x: 258, y: 272, fontSize: 12, textAnchor: "middle" },
  navotas: { x: 185, y: 225, fontSize: 11, textAnchor: "middle" },
  valenzuela: { x: 317, y: 226, fontSize: 16, textAnchor: "middle" },
  "las-pinas": { x: 361, y: 780, fontSize: 14, textAnchor: "middle" },
  makati: { x: 411, y: 534, fontSize: 14, textAnchor: "middle" },
  muntinlupa: { x: 422, y: 869, fontSize: 14, textAnchor: "middle" },
  paranaque: { x: 403, y: 686, fontSize: 14, textAnchor: "middle" },
  pasay: { x: 390, y: 605, fontSize: 13, textAnchor: "middle" },
  taguig: { x: 470, y: 611, fontSize: 16, textAnchor: "middle" },
  pateros: { x: 503, y: 546, fontSize: 10, textAnchor: "middle" },
};
