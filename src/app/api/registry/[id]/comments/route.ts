import { NextResponse } from "next/server";
import { saveComment } from "@/lib/data-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();
  await saveComment(Number(id), body);
  return NextResponse.json({ ok: true });
}
