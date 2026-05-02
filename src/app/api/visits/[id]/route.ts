import { NextResponse } from "next/server";
import { updateVisit } from "@/lib/data-service";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json();
  await updateVisit(Number(id), {
    actorUserId: body.actorUserId,
    visitDate: body.visitDate,
    authenCode: body.authenCode,
    symptoms: body.symptoms,
    note: body.note,
    checklist: body.checklist,
    clinical: body.clinical,
  });
  return NextResponse.json({ ok: true });
}
