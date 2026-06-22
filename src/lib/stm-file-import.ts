import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

export type ImportSource = "REP" | "STM";

export interface ImportFileEntry {
  source: ImportSource;
  name: string;
  fullPath: string;
  size: number;
  modifiedAt: string;
}

export interface ParsedImportRow {
  hn: string;
  patientName: string;
  amount: number;
  unitRef?: string;
  claimMonth?: string;
  note?: string;
}

const REP_IMPORT_DIR = process.env.REP_IMPORT_DIR ?? "C:\\TEMP\\REP";
const STM_IMPORT_DIR = process.env.STM_IMPORT_DIR ?? "C:\\TEMP\\STM";
const ALLOWED_EXTENSIONS = new Set([
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".rep",
  ".stm",
]);

function getRootBySource(source: ImportSource) {
  return source === "REP" ? REP_IMPORT_DIR : STM_IMPORT_DIR;
}

function isWithinDirectory(fullPath: string, rootPath: string) {
  const normalizedRoot = path.resolve(rootPath).toLowerCase();
  const normalizedPath = path.resolve(fullPath).toLowerCase();
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}${path.sep}`)
  );
}

function toIsoDate(input: Date) {
  return input.toISOString();
}

function normalizeThaiDigits(value: string) {
  const thaiDigits = "๐๑๒๓๔๕๖๗๘๙";
  return value.replace(/[๐-๙]/g, (digit) => `${thaiDigits.indexOf(digit)}`);
}

function normalizeHeader(value: string) {
  return normalizeThaiDigits(value)
    .toLowerCase()
    .replace(/[\s._\-\/()]+/g, "");
}

function firstNonEmpty(...values: Array<unknown>) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function parseAmount(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  const text = normalizeThaiDigits(String(input ?? "")).replace(/[,\s]/g, "");
  if (!text) return null;
  const numeric = Number.parseFloat(text.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function parseClaimMonthValue(raw: unknown): string | null {
  const value = normalizeThaiDigits(String(raw ?? "").trim());
  if (!value) return null;

  const compact = value.replace(/[^\d]/g, "");
  if (compact.length >= 6) {
    const yyyymm = compact.slice(0, 6);
    const yearRaw = Number.parseInt(yyyymm.slice(0, 4), 10);
    const month = Number.parseInt(yyyymm.slice(4, 6), 10);
    if (month >= 1 && month <= 12) {
      const year = yearRaw >= 2500 ? yearRaw - 543 : yearRaw;
      if (year >= 1900) return `${year}-${`${month}`.padStart(2, "0")}`;
    }
  }

  const monthYearMatch = value.match(/(\d{1,2})[\/\-](\d{4})/);
  if (monthYearMatch) {
    const month = Number.parseInt(monthYearMatch[1], 10);
    const yearRaw = Number.parseInt(monthYearMatch[2], 10);
    const year = yearRaw >= 2500 ? yearRaw - 543 : yearRaw;
    if (month >= 1 && month <= 12)
      return `${year}-${`${month}`.padStart(2, "0")}`;
  }

  return null;
}

export function inferClaimMonthFromFileName(fileName: string) {
  const normalized = normalizeThaiDigits(fileName);
  const match = normalized.match(/(\d{6})/);
  if (!match) return null;
  return parseClaimMonthValue(match[1]);
}

async function readWorkbookRows(
  fullPath: string,
): Promise<Array<Record<string, unknown>>> {
  const content = await fs.readFile(fullPath);
  const workbook = XLSX.read(content, {
    type: "buffer",
    raw: false,
    codepage: 874,
    dense: true,
    cellDates: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];

  const matrix = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });

  if (!matrix.length) return [];

  let headerIndex = 0;
  for (let index = 0; index < Math.min(20, matrix.length); index += 1) {
    const row = matrix[index] ?? [];
    const merged = row
      .map((item) => normalizeHeader(String(item ?? "")))
      .join("|");
    if (!merged) continue;
    if (
      merged.includes("hn") ||
      merged.includes("ชื่อ") ||
      merged.includes("amount") ||
      merged.includes("เงิน")
    ) {
      headerIndex = index;
      break;
    }
  }

  const headerRow = matrix[headerIndex] ?? [];
  const headers = headerRow.map((item, index) => {
    const text = String(item ?? "").trim();
    return text || `col_${index + 1}`;
  });
  const rows: Array<Record<string, unknown>> = [];

  for (
    let rowIndex = headerIndex + 1;
    rowIndex < matrix.length;
    rowIndex += 1
  ) {
    const row = matrix[rowIndex] ?? [];
    const record: Record<string, unknown> = {};
    let hasValue = false;
    for (let colIndex = 0; colIndex < headers.length; colIndex += 1) {
      const value = row[colIndex] ?? "";
      record[headers[colIndex]] = value;
      if (String(value).trim()) hasValue = true;
    }
    if (hasValue) rows.push(record);
  }

  return rows;
}

function pickByHeader(
  row: Record<string, unknown>,
  includes: string[],
  exact: string[] = [],
) {
  const entries = Object.entries(row).map(([key, value]) => ({
    key,
    normalized: normalizeHeader(key),
    value,
  }));

  for (const entry of entries) {
    if (exact.some((token) => entry.normalized === token)) {
      return entry.value;
    }
  }

  for (const entry of entries) {
    if (includes.some((token) => entry.normalized.includes(token))) {
      return entry.value;
    }
  }

  return undefined;
}

function parseRow(row: Record<string, unknown>): ParsedImportRow | null {
  const hnRaw =
    pickByHeader(row, ["hn", "hospno", "hnno", "เลขhn", "nohn"], ["hn"]) ??
    row.HN ??
    row.hn;
  const nameRaw =
    pickByHeader(row, ["patientname", "ptname", "fullname", "ชื่อ", "name"]) ??
    row.NAME;
  const amountRaw =
    pickByHeader(row, [
      "amount",
      "total",
      "pay",
      "net",
      "เงิน",
      "ชดเชย",
      "บาท",
    ]) ?? row.AMOUNT;
  const unitRaw = pickByHeader(row, [
    "unit",
    "pcu",
    "hcode",
    "hospcode",
    "หน่วย",
  ]);
  const claimMonthRaw = pickByHeader(row, [
    "claimmonth",
    "month",
    "period",
    "งวด",
    "เดือน",
  ]);
  const noteRaw = pickByHeader(row, ["note", "remark", "comment", "หมายเหตุ"]);

  const hn = normalizeThaiDigits(firstNonEmpty(hnRaw)).replace(/\s+/g, "");
  const patientName = firstNonEmpty(nameRaw);
  const amount = parseAmount(amountRaw);
  const unitRef = firstNonEmpty(unitRaw);
  const claimMonth = parseClaimMonthValue(claimMonthRaw) ?? undefined;
  const note = firstNonEmpty(noteRaw) || undefined;

  if (!hn || amount === null) return null;
  return {
    hn,
    patientName: patientName || hn,
    amount,
    unitRef: unitRef || undefined,
    claimMonth,
    note,
  };
}

export async function listImportFiles(
  source: ImportSource,
  limit = 200,
): Promise<ImportFileEntry[]> {
  const rootDir = getRootBySource(source);
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: ImportFileEntry[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;
    const fullPath = path.join(rootDir, entry.name);
    const stat = await fs.stat(fullPath);
    files.push({
      source,
      name: entry.name,
      fullPath,
      size: stat.size,
      modifiedAt: toIsoDate(stat.mtime),
    });
  }

  files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return files.slice(0, Math.max(1, Math.min(limit, 1000)));
}

export async function parseImportFile(
  fullPath: string,
): Promise<ParsedImportRow[]> {
  const ext = path.extname(fullPath).toLowerCase();
  const inRep = isWithinDirectory(fullPath, REP_IMPORT_DIR);
  const inStm = isWithinDirectory(fullPath, STM_IMPORT_DIR);
  if (!inRep && !inStm) {
    throw new Error("ไม่อนุญาตให้อ่านไฟล์นอกโฟลเดอร์ REP/STM");
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error("รองรับเฉพาะไฟล์ .xls, .xlsx, .csv, .txt, .rep, .stm");
  }

  const rows = await readWorkbookRows(fullPath);
  const parsed = rows
    .map(parseRow)
    .filter((row): row is ParsedImportRow => Boolean(row));
  if (parsed.length) return parsed;

  const rawText = await fs.readFile(fullPath, "utf8");
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[;,|\t]/).map((part) => part.trim()))
    .filter((parts) => parts.length >= 3)
    .map(([hn, patientName, amountText, unitRef, claimMonth, note]) => ({
      hn: normalizeThaiDigits(hn).replace(/\s+/g, ""),
      patientName: patientName || hn,
      amount: Number.parseFloat(
        normalizeThaiDigits(amountText).replace(/,/g, ""),
      ),
      unitRef: unitRef || undefined,
      claimMonth: parseClaimMonthValue(claimMonth) ?? undefined,
      note: note || undefined,
    }))
    .filter((row) => row.hn && Number.isFinite(row.amount));
}
