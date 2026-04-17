import { NextResponse } from "next/server";
import { getHosPatientDetail } from "@/lib/data-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hn = url.searchParams.get("hn")?.trim() ?? "";
  if (!hn) {
    return NextResponse.json({ error: "hn is required" }, { status: 400 });
  }

  const detail = await getHosPatientDetail(hn);
  if (!detail) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}

