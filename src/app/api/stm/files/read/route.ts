import path from "node:path";
import { NextResponse } from "next/server";
import { getAppSnapshot } from "@/lib/data-service";
import {
  inferClaimMonthFromFileName,
  parseImportFile,
} from "@/lib/stm-file-import";

export const runtime = "nodejs";

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[\s._\-\/()]+/g, "");
}

function resolveUnitId(
  unitRef: string | undefined,
  units: Array<{ id: string; code: string; shortName: string; name: string }>,
) {
  if (!unitRef) return null;
  const normalizedRef = normalizeToken(unitRef);
  if (!normalizedRef) return null;
  const exact = units.find(
    (unit) =>
      normalizeToken(unit.id) === normalizedRef ||
      normalizeToken(unit.code) === normalizedRef ||
      normalizeToken(unit.shortName) === normalizedRef ||
      normalizeToken(unit.name) === normalizedRef,
  );
  if (exact) return exact.id;

  const fuzzy = units.find(
    (unit) =>
      normalizeToken(unit.shortName).includes(normalizedRef) ||
      normalizedRef.includes(normalizeToken(unit.shortName)) ||
      normalizeToken(unit.name).includes(normalizedRef) ||
      normalizedRef.includes(normalizeToken(unit.name)),
  );
  return fuzzy?.id ?? null;
}

function normalizeClaimMonth(value: string | undefined, fallback: string) {
  if (!value?.trim()) return fallback;
  const raw = value.trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}`;
  return fallback;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fullPath = String(body.fullPath ?? "").trim();
    const userId = String(body.userId ?? "").trim();
    if (!fullPath) {
      return NextResponse.json(
        { error: "กรุณาระบุ fullPath ของไฟล์" },
        { status: 400 },
      );
    }

    const parsedRows = await parseImportFile(fullPath);
    if (!parsedRows.length) {
      return NextResponse.json(
        { error: "ไม่พบข้อมูลที่นำเข้าได้จากไฟล์นี้" },
        { status: 400 },
      );
    }

    const snapshot = await getAppSnapshot();
    const units = snapshot.units.filter((unit) => unit.kind !== "hospital");
    const user = snapshot.users.find((item) => item.id === userId);
    const patientUnitByHn = new Map(
      snapshot.patients.map((patient) => [patient.hn, patient.assignedUnitId]),
    );
    const fallbackClaimMonth =
      inferClaimMonthFromFileName(path.basename(fullPath)) ??
      snapshot.currentDate.slice(0, 7);
    const fallbackUnitId =
      (user && units.some((item) => item.id === user.unitId)
        ? user.unitId
        : null) ??
      units[0]?.id ??
      "";

    const rows = parsedRows
      .map((row) => {
        const resolvedUnitId =
          resolveUnitId(row.unitRef, units) ??
          patientUnitByHn.get(row.hn) ??
          fallbackUnitId;
        return {
          hn: row.hn,
          patientName: row.patientName,
          amount: row.amount,
          unitId: resolvedUnitId,
          claimMonth: normalizeClaimMonth(row.claimMonth, fallbackClaimMonth),
          note: row.note,
        };
      })
      .filter((row) => row.hn && row.unitId && Number.isFinite(row.amount));

    if (!rows.length) {
      return NextResponse.json(
        { error: "ไฟล์อ่านได้ แต่ไม่สามารถระบุหน่วยรับผิดชอบให้รายการใดได้" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      fileName: path.basename(fullPath),
      fullPath,
      inferredClaimMonth: fallbackClaimMonth,
      totalRows: rows.length,
      rows,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ไม่สามารถอ่านไฟล์นำเข้าได้";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
