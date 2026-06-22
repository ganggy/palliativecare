import { NextResponse } from "next/server";
import { getHosCandidateHistory } from "@/lib/data-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hn = url.searchParams.get("hn")?.trim() ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? "12");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(30, Math.max(1, Math.trunc(limitRaw)))
    : 12;

  if (!hn) {
    return NextResponse.json({ error: "hn is required" }, { status: 400 });
  }

  const history = await getHosCandidateHistory(hn, limit);
  return NextResponse.json(history);
}
