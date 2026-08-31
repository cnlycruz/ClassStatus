import type { CSSProperties } from "react";
import { NCR_GEO_PATHS } from "@/data/ncrGeoData";
import { NCR_MAP_LABEL_PLACEMENTS } from "@/data/ncrMapPresentation";
import { STATUS_PRESENTATION } from "@/lib/statusPresentation";
import type { NcrShareCardData } from "./ncrShareCardData";

const panelStyle: CSSProperties = {
  display: "flex",
  border: "1px solid #1E293B",
  borderRadius: 16,
  background: "#0F172A",
};

const SHARE_MAP_VIEWBOX = { x: 130, y: 30, width: 540, height: 940 } as const;
const SHARE_MAP_SIZE = { width: 493, height: 858 } as const;

function CountStat({
  label,
  value,
  color,
  borderRight,
  borderBottom,
}: {
  label: string;
  value: number;
  color: string;
  borderRight?: boolean;
  borderBottom?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: 134,
        height: 98,
        padding: "14px 12px",
        flexDirection: "column",
        justifyContent: "space-between",
        ...(borderRight ? { borderRight: "1px solid #1E293B" } : {}),
        ...(borderBottom ? { borderBottom: "1px solid #1E293B" } : {}),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#CBD5E1", fontSize: 16, fontWeight: 700 }}>
        <span style={{ display: "flex", width: 10, height: 10, borderRadius: 999, background: color }} />
        {label}
      </div>
      <div style={{ display: "flex", color: "#F8FAFC", fontSize: 42, lineHeight: 0.9, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function ShareMap({ data }: { data: NcrShareCardData }) {
  const lgusById = new Map(data.lgus.map((lgu) => [lgu.id, lgu]));

  return (
    <div style={{ display: "flex", position: "relative", width: SHARE_MAP_SIZE.width, height: SHARE_MAP_SIZE.height }}>
      <svg
        width={SHARE_MAP_SIZE.width}
        height={SHARE_MAP_SIZE.height}
        viewBox={`${SHARE_MAP_VIEWBOX.x} ${SHARE_MAP_VIEWBOX.y} ${SHARE_MAP_VIEWBOX.width} ${SHARE_MAP_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0 }}
      >
        <g>
          {NCR_GEO_PATHS.map((path) => (
            <path
              key={path.id}
              d={path.d}
              fill={lgusById.get(path.lguId)?.color || STATUS_PRESENTATION["awaiting-information"].color}
              stroke="#020617"
              strokeWidth="2.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </g>
      </svg>
      {NCR_GEO_PATHS.map((path) => {
          const lgu = lgusById.get(path.lguId);
          const placement = NCR_MAP_LABEL_PLACEMENTS[path.id] || {
            x: path.labelX,
            y: path.labelY,
            fontSize: 14,
            textAnchor: "middle" as const,
          };
          const displayName = path.subArea ? `${lgu?.name || path.name} (${path.subArea})` : lgu?.name || path.name;
          const lines = placement.lines || [placement.text || displayName];
          const fontSize = Math.max(13, placement.fontSize * 1.02);
          const translateX = placement.textAnchor === "start" ? "0" : placement.textAnchor === "end" ? "-100%" : "-50%";

          return (
            <div
              key={`share-label-${path.id}`}
              style={{
                display: "flex",
                position: "absolute",
                left: `${((placement.x - SHARE_MAP_VIEWBOX.x) / SHARE_MAP_VIEWBOX.width) * 100}%`,
                top: `${((placement.y - SHARE_MAP_VIEWBOX.y) / SHARE_MAP_VIEWBOX.height) * 100}%`,
                transform: `translate(${translateX}, -50%)`,
                flexDirection: "column",
                alignItems: "center",
                color: "#FFFFFF",
                fontSize,
                lineHeight: 1.05,
                fontWeight: 800,
                textShadow: "0 1px 2px #020617, 0 0 4px #020617",
                whiteSpace: "nowrap",
              }}
            >
              {lines.map((line) => (
                <span key={`${path.id}-${line}`} style={{ display: "flex" }}>
                  {line}
                </span>
              ))}
            </div>
          );
        })}
    </div>
  );
}

export function NcrShareCard({ data, logoDataUrl }: { data: NcrShareCardData; logoDataUrl: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: 44,
        color: "#F8FAFC",
        background: "#020617",
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", height: 116, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoDataUrl} alt="" width="82" height="82" style={{ borderRadius: 18 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", fontSize: 50, lineHeight: 1, fontWeight: 900, letterSpacing: "-1.5px" }}>
              Class Status NCR
            </div>
            <div style={{ display: "flex", color: "#CBD5E1", fontSize: 23, fontWeight: 600 }}>
              Metro Manila Class Suspensions
            </div>
          </div>
        </div>
        <div style={{ ...panelStyle, width: 312, minHeight: 88, padding: "16px 20px", flexDirection: "column", justifyContent: "center", gap: 5, background: "#0F172A" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94A3B8", fontSize: 14, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>
            <span style={{ display: "flex", width: 8, height: 8, borderRadius: 999, background: "#60A5FA" }} />
            Effective date
          </div>
          <div style={{ display: "flex", color: "#F8FAFC", fontSize: 23, lineHeight: 1.22, fontWeight: 800 }}>
            {data.effectiveDateLabel}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", height: 880, marginTop: 16, gap: 18 }}>
        <div
          style={{
            ...panelStyle,
            position: "relative",
            width: 782,
            height: 880,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            background: "#0F172A",
          }}
        >
          <ShareMap data={data} />
          <div style={{ display: "flex", position: "absolute", top: 20, left: 22, right: 22, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", color: "#F8FAFC", fontSize: 20, fontWeight: 800 }}>NCR status map</div>
            <div style={{ display: "flex", color: "#94A3B8", fontSize: 16, fontWeight: 700 }}>17 LGUs</div>
          </div>
        </div>

        <div style={{ ...panelStyle, width: 312, height: 880, padding: "22px", flexDirection: "column", justifyContent: "space-between", background: "#0F172A" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 21, fontWeight: 800 }}>Current NCR status</div>
            <div style={{ display: "flex", flexWrap: "wrap", width: 268, marginTop: 16, borderTop: "1px solid #1E293B" }}>
              <CountStat label="Full" value={data.counts.full} color={STATUS_PRESENTATION["classes-suspended"].color} borderRight borderBottom />
              <CountStat label="Partial" value={data.counts.partial} color={STATUS_PRESENTATION["partial-suspension"].color} borderBottom />
              <CountStat label="Open" value={data.counts.open} color={STATUS_PRESENTATION["classes-continue"].color} borderRight />
              <CountStat label="Awaiting" value={data.counts.awaiting} color={STATUS_PRESENTATION["awaiting-information"].color} />
            </div>

            <div style={{ display: "flex", marginTop: 28, paddingTop: 24, borderTop: "1px solid #1E293B", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", fontSize: 19, fontWeight: 800 }}>Map legend</div>
              {data.legend.map((item) => (
                <div key={item.status} style={{ display: "flex", alignItems: "center", gap: 12, color: "#CBD5E1", fontSize: 16, fontWeight: 650 }}>
                  <span style={{ display: "flex", width: 15, height: 15, borderRadius: 4, background: item.color }} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", paddingTop: 22, borderTop: "1px solid #1E293B", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", color: "#94A3B8", fontSize: 14, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>As of</div>
            <div style={{ display: "flex", color: "#F8FAFC", fontSize: 18, lineHeight: 1.35, fontWeight: 700 }}>
              {data.asOfLabel}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", height: 100, alignItems: "center" }}>
        <div style={{ display: "flex", width: "100%", paddingTop: 18, borderTop: "1px solid #1E293B", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", maxWidth: 780, color: "#94A3B8", fontSize: 16, lineHeight: 1.35 }}>
            {data.sourceNote}
          </div>
          <div style={{ display: "flex", color: "#F8FAFC", fontSize: 19, fontWeight: 800 }}>{data.siteLabel}</div>
        </div>
      </div>
    </div>
  );
}
