import { NextResponse } from "next/server";
import { syncHosCandidatesToRegistry } from "@/lib/data-service";
import type { CandidateDxGroup, CandidateFilterMode } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const candidateMode: CandidateFilterMode =
    body.candidateMode === "missing_any_z" ||
    body.candidateMode === "missing_both_z" ||
    body.candidateMode === "z_done_but_visit_incomplete"
      ? body.candidateMode
      : "all";
  const dxGroup: CandidateDxGroup = [
    "all",
    "cancer",
    "stroke-neuro",
    "ckd",
    "copd",
    "hiv",
    "liver",
    "heart",
    "palliative-z",
    "other",
  ].includes(body.dxGroup)
    ? body.dxGroup
    : "all";
  const result = await syncHosCandidatesToRegistry({
    visitDate: body.visitDate,
    clinic: body.clinic,
    candidateMode,
    dxGroup,
    userId: body.userId,
    note: body.note,
  });
  return NextResponse.json(result);
}
