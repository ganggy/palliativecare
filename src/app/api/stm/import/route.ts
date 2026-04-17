import { NextResponse } from "next/server";
import { saveStmImport } from "@/lib/data-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  await saveStmImport(body);
  return NextResponse.json({ ok: true });
}
