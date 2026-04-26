import type {
  CandidateDxGroup,
  ClaimChecklist,
  UserRole,
  VisitChecklist,
  VisitWindow,
} from "./types";

export const REQUIRED_COMPLETE_VISITS = 6;

function normalize(code?: string): string {
  return (code ?? "").toUpperCase().replaceAll(".", "").trim();
}

export function normalizeIcd10(code?: string): string {
  return normalize(code);
}

export function normalizeServiceCode(code?: string): string {
  return normalize(code);
}

export function buildPalliativeDiagnosisWhereSql(column = "dx.icd10"): string {
  const normalized = `UPPER(REPLACE(${column}, '.', ''))`;
  return `${normalized} REGEXP '^(B2[0-4]|C|D[0-4]|F03|I5|I6|J44|K704|K717|K72|K74|N185|Z515|Z718)'`;
}

export function buildPalliativeDiagnosisExistsSql(vnExpr = "o.vn"): string {
  const condition = buildPalliativeDiagnosisWhereSql("d.icd10");
  return `EXISTS (SELECT 1 FROM ovstdiag d WHERE d.vn = ${vnExpr} AND ${condition})`;
}

export function buildRequiredClaimExistsSql(vnExpr = "o.vn"): string {
  return `
    EXISTS (SELECT 1 FROM ovstdiag d1 WHERE d1.vn = ${vnExpr} AND UPPER(REPLACE(d1.icd10, '.', '')) = 'Z515')
    AND EXISTS (SELECT 1 FROM ovstdiag d2 WHERE d2.vn = ${vnExpr} AND UPPER(REPLACE(d2.icd10, '.', '')) = 'Z718')
    AND EXISTS (
      SELECT 1
      FROM opitemrece op1
      LEFT JOIN drugitems di1 ON di1.icode = op1.icode
      LEFT JOIN s_drugitems sdi1 ON sdi1.icode = op1.icode
      WHERE op1.vn = ${vnExpr}
        AND UPPER(COALESCE(di1.nhso_adp_code, sdi1.nhso_adp_code, op1.icode, '')) = '30001'
    )
    AND EXISTS (
      SELECT 1
      FROM opitemrece op2
      LEFT JOIN drugitems di2 ON di2.icode = op2.icode
      LEFT JOIN s_drugitems sdi2 ON sdi2.icode = op2.icode
      WHERE op2.vn = ${vnExpr}
        AND UPPER(COALESCE(di2.nhso_adp_code, sdi2.nhso_adp_code, op2.icode, '')) = 'EVA001'
    )
    AND EXISTS (
      SELECT 1
      FROM opitemrece op3
      LEFT JOIN drugitems di3 ON di3.icode = op3.icode
      LEFT JOIN s_drugitems sdi3 ON sdi3.icode = op3.icode
      WHERE op3.vn = ${vnExpr}
        AND UPPER(COALESCE(di3.nhso_adp_code, sdi3.nhso_adp_code, op3.icode, '')) = 'CONS01'
    )
  `;
}

export function hasAllClaimSignals(input: Partial<ClaimChecklist>): boolean {
  return Boolean(
    input.diagZ515 &&
    input.diagZ718 &&
    input.adp30001 &&
    input.eva001 &&
    input.cons01 &&
    input.hasAuthentication &&
    input.hasHomeVisitReport,
  );
}

export function buildClaimChecklist(
  input: Partial<ClaimChecklist>,
): ClaimChecklist {
  const checklist: ClaimChecklist = {
    diagZ515: Boolean(input.diagZ515),
    diagZ718: Boolean(input.diagZ718),
    adp30001: Boolean(input.adp30001),
    eva001: Boolean(input.eva001),
    cons01: Boolean(input.cons01),
    hasAuthentication: Boolean(input.hasAuthentication),
    hasHomeVisitReport: Boolean(input.hasHomeVisitReport),
    hasPhoto: Boolean(input.hasPhoto),
    opioidEligible: Boolean(input.opioidEligible),
    readyForClaim: false,
  };

  checklist.readyForClaim = hasAllClaimSignals(checklist);
  return checklist;
}

export function isPalliativeEligibleCode(code?: string): boolean {
  const normalized = normalize(code);
  if (!normalized || normalized === "B230" || normalized === "B231") {
    return false;
  }

  return (
    /^C\d{2,3}/.test(normalized) ||
    /^D3[7-9]/.test(normalized) ||
    /^D4\d{1,2}/.test(normalized) ||
    /^I6[0-9]/.test(normalized) ||
    normalized === "I50" ||
    normalized === "N185" ||
    normalized === "J44" ||
    normalized === "F03" ||
    /^B2[0-4]/.test(normalized) ||
    normalized === "K72" ||
    normalized === "K704" ||
    normalized === "K717" ||
    normalized === "K74" ||
    normalized === "Z515" ||
    normalized === "Z718"
  );
}

export function isOpioidEligibleCode(code?: string): boolean {
  const normalized = normalize(code);
  return (
    /^C\d{2,3}/.test(normalized) ||
    /^D3[7-9]/.test(normalized) ||
    /^D4\d{1,2}/.test(normalized)
  );
}

export function describeEligibility(code?: string): string {
  const normalized = normalize(code);
  if (!normalized) {
    return "รอคัดกรองโดยโรงพยาบาล";
  }

  if (
    normalized.startsWith("C") ||
    normalized.startsWith("D3") ||
    normalized.startsWith("D4")
  )
    return "มะเร็ง/เนื้องอกระยะท้าย";
  if (normalized.startsWith("I6")) return "Stroke ที่ต้องดูแลต่อเนื่อง";
  if (normalized === "N185") return "CKD stage 5";
  if (normalized === "J44") return "COPD รุนแรง";
  if (normalized === "F03") return "สมองเสื่อมระยะรุนแรง";
  if (normalized.startsWith("B2")) return "AIDS ระยะรุนแรง";
  if (normalized.startsWith("K7")) return "ตับล้มเหลว/ตับแข็ง";
  if (normalized === "I50") return "หัวใจล้มเหลว";
  if (normalized === "Z515") return "เข้าเกณฑ์ Palliative care";
  if (normalized === "Z718") return "มีแผน Advance Care Plan";
  return "เข้าเกณฑ์ตามกลุ่มโรคของกรมการแพทย์";
}

export function classifyCandidateDxGroup(code?: string): CandidateDxGroup {
  const normalized = normalize(code);
  if (!normalized) return "other";
  if (
    normalized.startsWith("C") ||
    normalized.startsWith("D3") ||
    normalized.startsWith("D4")
  ) {
    return "cancer";
  }
  if (normalized.startsWith("I6")) return "stroke-neuro";
  if (normalized === "F03") return "dementia";
  if (normalized === "N185") return "ckd";
  if (normalized.startsWith("J44")) return "copd";
  if (normalized.startsWith("B2")) return "hiv";
  if (
    normalized === "K72" ||
    normalized === "K704" ||
    normalized === "K717" ||
    normalized === "K74"
  ) {
    return "liver";
  }
  if (normalized.startsWith("I50")) return "heart";
  if (normalized === "Z515" || normalized === "Z718") return "palliative-z";
  return "other";
}

export function toDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthKey(value: string): string {
  return value.slice(0, 7);
}

export function startOfMonth(value: string): string {
  return `${monthKey(value)}-01`;
}

export function endOfMonth(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return toDateKey(last);
}

export function buildVisitWindow(anchorDate: string): VisitWindow {
  return {
    startDate: startOfMonth(anchorDate),
    endDate: endOfMonth(anchorDate),
  };
}

export function isDateWithinWindow(date: string, window: VisitWindow): boolean {
  return date >= window.startDate && date <= window.endDate;
}

export function defaultVisitChecklist(): VisitChecklist {
  return {
    symptomAssessment: false,
    medicationReconciled: false,
    adlReviewed: false,
    acpReviewed: false,
    equipmentChecked: false,
    caregiverBriefed: false,
    photoCaptured: false,
  };
}

export function normalizeVisitChecklist(
  checklist: Partial<VisitChecklist> | undefined,
  options: { hasPhoto: boolean; hasSymptoms: boolean },
): VisitChecklist {
  return {
    ...defaultVisitChecklist(),
    ...(checklist ?? {}),
    symptomAssessment:
      options.hasSymptoms || Boolean(checklist?.symptomAssessment),
    photoCaptured: options.hasPhoto,
  };
}

export function validateVisitSubmission(input: {
  visitDate?: string;
  authenCode?: string;
  symptoms?: string;
  photosCount: number;
}) {
  if (!input.visitDate?.trim()) {
    throw new Error("กรุณาระบุวันที่เยี่ยมก่อนบันทึก");
  }

  if (!input.authenCode?.trim()) {
    throw new Error("กรุณากรอก Authen code ทุกครั้งก่อนบันทึกการเยี่ยม");
  }

  if (!input.symptoms?.trim()) {
    throw new Error("กรุณาบันทึกอาการติดตามก่อนบันทึกการเยี่ยม");
  }

  if (input.photosCount < 1) {
    throw new Error("กรุณาแนบภาพผู้ป่วยอย่างน้อย 1 รูปทุกครั้งที่ออกเยี่ยม");
  }
}

export function formatRoleLabel(role: UserRole): string {
  if (role === "hospital_admin") return "ผู้ดูแลโรงพยาบาล";
  if (role === "hospital_case_manager") return "Case manager โรงพยาบาล";
  if (role === "hospital_pcu") return "ทีม PCU โรงพยาบาล";
  if (role === "unit_manager") return "หัวหน้าหน่วย รพ.สต.";
  return "ผู้ปฏิบัติงาน รพ.สต./PCU";
}
