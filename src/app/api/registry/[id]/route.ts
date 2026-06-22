import { NextResponse } from "next/server";
import { savePatientPatch } from "@/lib/data-service";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();
  await savePatientPatch(Number(id), body);
  return NextResponse.json({ ok: true });
}
