import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createElement } from "react";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getSuspensions } from "@/collector/storage";
import { NcrShareCard } from "@/lib/share/NcrShareCard";
import {
  NCR_SHARE_IMAGE_SIZE,
  parseNcrShareDate,
  prepareNcrShareCardData,
} from "@/lib/share/ncrShareCardData";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadShareAssets(): Promise<{ logoDataUrl: string; interRegular: ArrayBuffer; interBold: ArrayBuffer }> {
  const [logo, interRegular, interBold] = await Promise.all([
    readFile(join(process.cwd(), "public", "NEWLOGODARK.png")),
    readFile(join(process.cwd(), "public", "fonts", "Inter-Regular.ttf")),
    readFile(join(process.cwd(), "public", "fonts", "Inter-Bold.ttf")),
  ]);
  return {
    logoDataUrl: `data:image/png;base64,${logo.toString("base64")}`,
    interRegular: interRegular.buffer.slice(interRegular.byteOffset, interRegular.byteOffset + interRegular.byteLength) as ArrayBuffer,
    interBold: interBold.buffer.slice(interBold.byteOffset, interBold.byteOffset + interBold.byteLength) as ArrayBuffer,
  };
}

export async function GET(request: NextRequest) {
  const now = new Date();
  const effectiveDate = parseNcrShareDate(request.nextUrl.searchParams.get("date"), now);
  if (!effectiveDate) {
    return Response.json(
      { error: "Invalid date. Use YYYY-MM-DD." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const [records, assets] = await Promise.all([getSuspensions(), loadShareAssets()]);
    const data = prepareNcrShareCardData(records, {
      effectiveDate,
      now,
    });

    return new ImageResponse(createElement(NcrShareCard, { data, logoDataUrl: assets.logoDataUrl }), {
      ...NCR_SHARE_IMAGE_SIZE,
      fonts: [
        { name: "Inter", data: assets.interRegular, style: "normal", weight: 400 },
        { name: "Inter", data: assets.interBold, style: "normal", weight: 700 },
      ],
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="class-status-ncr-${effectiveDate}.png"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "The NCR share card is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
