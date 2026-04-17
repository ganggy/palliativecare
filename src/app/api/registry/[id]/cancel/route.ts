import { NextResponse } from "next/server";
import { cancelRegistration } from "@/lib/data-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();
  await cancelRegistration(Number(id), body.reason ?? "ยกเลิกการลงทะเบียน");
  return NextResponse.json({ ok: true });
}
