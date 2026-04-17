import { NextResponse } from "next/server";
import { registerHosCandidate } from "@/lib/data-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  await registerHosCandidate(body.candidate, {
    nextVisitAt: body.nextVisitAt,
    assignedUnitId: body.assignedUnitId,
    note: body.note,
    userId: body.userId,
  });
  return NextResponse.json({ ok: true });
}
