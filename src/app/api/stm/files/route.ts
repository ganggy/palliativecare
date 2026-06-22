import { NextResponse } from "next/server";
import { listImportFiles, type ImportSource } from "@/lib/stm-file-import";

export const runtime = "nodejs";

function asSource(value: string | null): ImportSource {
  return value?.toUpperCase() === "REP" ? "REP" : "STM";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = asSource(searchParams.get("source"));
    const limitRaw = Number.parseInt(searchParams.get("limit") ?? "200", 10);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 200;
    const files = await listImportFiles(source, limit);
    return NextResponse.json({ source, files });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ไม่สามารถโหลดรายชื่อไฟล์ได้";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
