import { NextResponse } from "next/server";
import { getHosCandidates } from "@/lib/data-service";
import type { CandidateDxGroup, CandidateFilterMode } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const visitDate = url.searchParams.get("visitDate") ?? undefined;
  const clinic = url.searchParams.get("clinic") ?? "all";
  const search = url.searchParams.get("search") ?? "";
  const modeParam = url.searchParams.get("mode") ?? "all";
  const dxGroupParam = url.searchParams.get("dxGroup") ?? "all";
  const mode: CandidateFilterMode =
    modeParam === "missing_any_z" ||
    modeParam === "missing_both_z" ||
    modeParam === "z_done_but_visit_incomplete"
      ? modeParam
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
  ].includes(dxGroupParam)
    ? (dxGroupParam as CandidateDxGroup)
    : "all";

  return NextResponse.json(
    await getHosCandidates(visitDate, clinic, search, mode, dxGroup),
  );
}
