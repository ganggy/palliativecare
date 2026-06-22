import { NextResponse } from "next/server";
import { searchHosPatients } from "@/lib/data-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(50, Math.max(1, Math.trunc(limitRaw)))
    : 20;

  if (!q.trim()) {
    return NextResponse.json([]);
  }

  const rows = await searchHosPatients(q, limit);
  return NextResponse.json(rows);
}
