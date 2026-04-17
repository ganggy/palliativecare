import { NextResponse } from "next/server";
import { getHosProgressSummary } from "@/lib/data-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clinic = url.searchParams.get("clinic") ?? "all";
  const forceRefresh = (url.searchParams.get("forceRefresh") ?? "0") === "1";
  const maxCacheMinutesRaw = Number(url.searchParams.get("maxCacheMinutes") ?? "60");
  const maxCacheMinutes = Number.isFinite(maxCacheMinutesRaw)
    ? Math.min(720, Math.max(5, Math.trunc(maxCacheMinutesRaw)))
    : 60;

  const summary = await getHosProgressSummary({
    clinicShortName: clinic,
    forceRefresh,
    maxCacheMinutes,
  });
  return NextResponse.json(summary);
}

export async function POST(request: Request) {
  const body = await request.json();
  const summary = await getHosProgressSummary({
    userId: String(body.userId ?? ""),
    clinicShortName: String(body.clinic ?? "all"),
    forceRefresh: true,
    maxCacheMinutes: 5,
  });
  return NextResponse.json(summary);
}
