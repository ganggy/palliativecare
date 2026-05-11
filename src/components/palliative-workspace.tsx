"use client";

import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LoadingProgressOverlay } from "@/components/loading-progress-overlay";
import type {
  AdvanceCarePlanForm,
  AppSnapshot,
  AuthSessionUser,
  CandidateFilterMode,
  CandidateVisitHistory,
  CommentAudience,
  HosCandidate,
  PendingUserRequest,
  PalliativePatient,
  PalliativeVisit,
  UserRole,
  VisitClinicalAssessment,
  VisitChecklist,
} from "@/lib/types";
import { formatRoleLabel, monthKey, REQUIRED_COMPLETE_VISITS } from "@/lib/rules";

const defaultVisitChecklistState: VisitChecklist = {
  symptomAssessment: true,
  medicationReconciled: true,
  adlReviewed: true,
  acpReviewed: true,
  equipmentChecked: true,
  caregiverBriefed: true,
  photoCaptured: true,
};

const visitChecklistLabels: Record<keyof VisitChecklist, string> = {
  symptomAssessment: "ประเมินอาการและอาการรบกวน",
  medicationReconciled: "ทวนรายการยา",
  adlReviewed: "ประเมิน ADL / การช่วยเหลือตัวเอง",
  acpReviewed: "ทบทวน ACP / เป้าหมายการดูแล",
  equipmentChecked: "ตรวจอุปกรณ์และเวชภัณฑ์",
  caregiverBriefed: "อธิบายญาติ/ผู้ดูแล",
  photoCaptured: "ถ่ายภาพผู้ป่วยแล้ว",
};

const ppsScoreOptions = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];
const painScoreOptions = Array.from({ length: 11 }, (_, index) => index);

const distressingSymptomOptions = [
  "ไม่มีเลย",
  "ปวด",
  "หอบเหนื่อย",
  "กินไม่ได้",
  "ท้องผูก (ไม่ถ่ายเกิน 3 วัน)",
  "นอนไม่หลับ",
  "อาเจียน",
  "มีแผลกดทับ",
  "มีเลือดออกตามร่างกาย",
  "ซีด อ่อนเพลีย วิงเวียน",
  "บวม ตามร่างกาย",
  "ไอ หอบ",
  "เจ็บแน่นหน้าอก หายใจไม่อิ่ม",
  "ใส่สายยาง NG Tube for feed",
  "Retain foley cath",
  "แผลผ่าตัดหน้าท้อง",
  "อาการคันผิวหนัง",
  "แผลมะเร็ง",
  "มีอาการสะอึก",
  "อาการเพ้อสับสน",
  "อาการเบื่ออาหาร",
  "อาการอ่อนล้า",
  "ท้องมาน",
];

const oxygenUseOptions = ["ใช้", "ไม่ใช้", "อื่นๆ"];

const painManagementOptions = [
  "Morphine ชนิดเม็ด (MST)",
  "Morphine ชนิด น้ำ",
  "Morphine ชนิดฉีดใต้ผิวหนัง",
  "Morphine ชนิดฉีดเข้าเส้นเลือด",
  "Morphine Syring driver",
  "น้ำมันกัญชา",
  "ใช้แผ่น แปะ (fentanyl)",
  "Morphine ออกฤทธิ์สั้น MOIR",
  "ไม่ใช้ยา",
  "อื่นๆ",
];

const morphineSideEffectOptions = [
  "อัตราการหายใจ (Respiratory rate) น้อยกว่า 12 ครั้ง",
  "ความดันโลหิต น้อยกว่า 90/60 มม.ปรอท",
  "อัตราการเต้นของหัวใจ น้อยกว่า 60 ครั้ง/นาที",
  "หลับปลุกตื่นยาก หรือไม่ได้ตอบ / sedation score 3 คะแนน",
  "ท้องผูก",
  "คลื่นไส้อาเจียน",
  "ไม่พบอาการผิดปกติ",
  "อื่นๆระบุ",
];

const acpImportantValueOptions = [
  "ต้องการมีคุณภาพชีวิตที่ดี",
  "ต้องการการรักษาที่ไม่สร้างความเจ็บปวดหรือทุกข์ทรมาน",
  "ต้องการมีชีวิตอยู่ให้นานที่สุดเท่าที่จะทำได้",
  "อื่นๆ",
];

const acpUnacceptableStateOptions = [
  "ช่วยเหลือตัวเองไม่ได้ ติดเตียง ต้องมีผู้ดูแลตลอด",
  "ไม่มีการรับรู้/จำคนที่รักไม่ได้/สภาพผักถาวร",
  "ต้องใช้เครื่องช่วยหายใจไปตลอดชีวิต",
  "อื่นๆ",
];

const acpTreatmentScopeOptions = [
  "รักษาเต็มที่แม้จะมีเครื่องมือพยุงชีพ",
  "รักษาเต็มที่รวมถึงเครื่องพยุงชีพ แต่หากไม่ได้ผลอนุญาตให้ถอดและรักษาตามอาการ",
  "รักษาเพื่อลดทรมาน ไม่ใช้เครื่องพยุงชีพหรือการยื้อชีวิต",
  "ยังตัดสินใจไม่ได้",
  "อื่นๆ",
];

const acpPreferredPlaceOptions = ["บ้าน", "โรงพยาบาล", "ที่อื่นๆ"];

type ImportSource = "REP" | "STM";

type ImportFileOption = {
  source: ImportSource;
  name: string;
  fullPath: string;
  size: number;
  modifiedAt: string;
};

type NurseWorkspaceTab = "search" | "registry" | "visit" | "acp" | "progress";
type UserManagementTab = "members" | "approvals";

type VisitPhotoCategory = "patient-card" | "follow-up";

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatRoundDate(value?: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  const year = date.getFullYear() + 543;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${day}/${month}/${year}`;
}

function shortDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function buildPageList(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  const adjustedStart = Math.max(1, end - 4);
  return Array.from(
    { length: end - adjustedStart + 1 },
    (_, index) => adjustedStart + index,
  );
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: PalliativePatient["careStatus"]) {
  if (status === "registered") return "ลงทะเบียนแล้ว";
  if (status === "scheduled") return "ถึงกำหนดเยี่ยม";
  if (status === "active") return "ติดตามต่อ";
  if (status === "completed") return "ครบ 6 เดือน";
  if (status === "cancelled") return "ยกเลิก";
  if (status === "deceased") return "เสียชีวิต";
  return "รอคัดกรอง";
}

function statusClass(status: PalliativePatient["careStatus"]) {
  if (status === "scheduled")
    return "border-[#f3bd6a55] bg-[#f3bd6a22] text-[#7a5509]";
  if (status === "completed")
    return "border-[#74c69d55] bg-[#74c69d22] text-[#0f5132]";
  if (status === "cancelled" || status === "deceased")
    return "border-[#ef476f55] bg-[#ef476f22] text-[#8d1d3e]";
  if (status === "active")
    return "border-[#4ea8de55] bg-[#4ea8de22] text-[#0a4d74]";
  return "border-[#6be2d355] bg-[#6be2d322] text-[#064b45]";
}

function claimItems(patient: PalliativePatient) {
  return claimChecklistItems(patient.claimChecklist);
}

function claimChecklistItems(checklist: PalliativePatient["claimChecklist"]) {
  return [
    ["Z51.5", checklist.diagZ515],
    ["Z71.8", checklist.diagZ718],
    ["30001", checklist.adp30001],
    ["EVA001", checklist.eva001],
    ["CONS01", checklist.cons01],
    ["Authen", checklist.hasAuthentication],
    ["Report", checklist.hasHomeVisitReport],
    ["Photo", checklist.hasPhoto],
  ] as const;
}

function candidateRowKey(candidate: HosCandidate): string {
  return `${candidate.hn}|${candidate.unitId}|${candidate.visitDate}`;
}

function claimGapLabels(patient: PalliativePatient) {
  return claimItems(patient)
    .filter(([, active]) => !active)
    .map(([label]) => label);
}

function formatAudience(audience: CommentAudience) {
  if (audience === "hospital") return "โรงพยาบาล";
  if (audience === "unit") return "หน่วย";
  return "ทุกฝ่าย";
}

function formatMoney(value: number) {
  return `${value.toLocaleString()} บาท`;
}

function getFiscalYearStart(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  const year = date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-10-01`;
}

function getExecutiveDiseaseGroup(patient: PalliativePatient) {
  const code = patient.primaryDxCode.toUpperCase();
  if (code.startsWith("C") || code.startsWith("D3") || code.startsWith("D4")) return "มะเร็ง";
  if (code.startsWith("I6")) return "Stroke/ระบบประสาท";
  if (code.startsWith("N185")) return "ไตวาย CKD5";
  if (code.startsWith("J44")) return "COPD";
  if (code.startsWith("F03")) return "สมองเสื่อม";
  if (code.startsWith("I50")) return "หัวใจล้มเหลว";
  if (code.startsWith("B2")) return "HIV/AIDS";
  if (code.startsWith("K7")) return "ตับแข็ง/ตับล้มเหลว";
  if (code.startsWith("Z515") || code.startsWith("Z718")) return "Palliative Z-code";
  return patient.eligibleReason || "อื่น ๆ";
}

function getPhotoCategoryLabel(category: VisitPhotoCategory) {
  if (category === "patient-card") return "รูปบัตรคู่กับคนไข้";
  return "รูปติดตามอาการคนไข้";
}

function splitVisitPhotos(photos: PalliativeVisit["photos"]) {
  return {
    patientCardPhotos: photos.filter((photo) => photo.caption === "patient-card"),
    followUpPhotos: photos.filter(
      (photo) => photo.caption === "follow-up" || !photo.caption,
    ),
  };
}

function createDefaultClinicalAssessment(): VisitClinicalAssessment {
  return {
    temperatureCelsius: "",
    pulsePerMinute: "",
    respiratoryRatePerMinute: "",
    bloodPressureMmHg: "",
    ppsScore: undefined,
    esasChiefComplaint: "",
    distressingSymptoms: [],
    oxygenUse: "",
    oxygenUseOther: "",
    painLocation: "",
    painScore: undefined,
    painManagement: [],
    painManagementOther: "",
    morphineSideEffects: [],
    morphineSideEffectsOther: "",
  };
}

function createAcpDraft(
  patient?: PalliativePatient,
  currentDate = "",
): AdvanceCarePlanForm {
  return {
    planDate: currentDate,
    patientName: patient?.fullName ?? "",
    patientAge: patient?.age ? String(patient.age) : "",
    patientCid: patient?.cid ?? "",
    patientAddress: patient?.address ?? "",
    patientPhone: patient?.phone ?? "",
    patientBirthDate: patient?.birthday ?? "",
    regularHospital: patient?.assignedUnitName ?? "",
    insurance: patient?.insuranceGroup ?? "",
    coPlannerName: "",
    coPlannerCid: "",
    coPlannerRelation: "",
    coPlannerPhone: "",
    importantValues: [],
    importantValuesOther: "",
    unacceptableStates: [],
    unacceptableStatesOther: "",
    treatmentScope: "",
    treatmentScopeOther: "",
    otherCare: "",
    terminalNaturalDeath: "",
    preferredPlace: "",
    preferredPlaceOther: "",
    terminalOtherCare: "",
    proxyName: "",
    proxyAge: "",
    proxyRelation: "",
    proxyAddress: "",
    proxyPhone: "",
    healthStaffName: "",
    healthStaffProfession: "",
    healthStaffPhone: "",
    patientSignerName: patient?.fullName ?? "",
    proxySignerName: "",
    witness1Name: "",
    witness2Name: "",
  };
}

function toggleListValue(values: string[], value: string, checked: boolean) {
  if (checked) return values.includes(value) ? values : [...values, value];
  return values.filter((item) => item !== value);
}

function formatClinicalList(values?: string[], other?: string) {
  const items = [...(values ?? [])];
  if (other?.trim()) items.push(other.trim());
  return items.length ? items.join(", ") : "-";
}

function visitClinicalSummaryItems(clinical?: VisitClinicalAssessment) {
  if (!clinical) return [];
  return [
    ["อุณหภูมิ", clinical.temperatureCelsius ? `${clinical.temperatureCelsius} °C` : ""],
    ["ชีพจร", clinical.pulsePerMinute ? `${clinical.pulsePerMinute} ครั้ง/นาที` : ""],
    [
      "หายใจ",
      clinical.respiratoryRatePerMinute
        ? `${clinical.respiratoryRatePerMinute} ครั้ง/นาที`
        : "",
    ],
    ["ความดัน", clinical.bloodPressureMmHg],
    ["PPS", clinical.ppsScore !== undefined ? `${clinical.ppsScore}` : ""],
    ["ESAS / CC", clinical.esasChiefComplaint],
    [
      "อาการรบกวน",
      formatClinicalList(clinical.distressingSymptoms),
    ],
    [
      "ออกซิเจน",
      [clinical.oxygenUse, clinical.oxygenUseOther].filter(Boolean).join(" / "),
    ],
    ["ตำแหน่งปวด", clinical.painLocation],
    ["ระดับปวด", clinical.painScore !== undefined ? `${clinical.painScore}/10` : ""],
    [
      "จัดการปวด",
      formatClinicalList(clinical.painManagement, clinical.painManagementOther),
    ],
    [
      "ผลข้างเคียง Morphine",
      formatClinicalList(
        clinical.morphineSideEffects,
        clinical.morphineSideEffectsOther,
      ),
    ],
  ].filter(([, value]) => value && value !== "-");
}

function VisitClinicalSummary({
  clinical,
}: {
  clinical?: VisitClinicalAssessment;
}) {
  const items = visitClinicalSummaryItems(clinical);
  if (!items.length) return null;
  return (
    <div className="mt-3 rounded-2xl border border-[#d9e5ec] bg-[#f7fbfd] p-3">
      <div className="text-xs uppercase tracking-[0.2em] text-[#6f8190]">
        ข้อมูลประเมินการเยี่ยม
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white px-3 py-2 text-xs text-[#123047]">
            <div className="text-[0.68rem] text-[#6f8190]">{label}</div>
            <div className="mt-1 leading-5">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function isSavedDataNotice(notice: string | null) {
  if (!notice) return false;
  return (
    notice.startsWith("บันทึก") ||
    notice.startsWith("แก้ไขข้อมูลที่ส่งแล้ว") ||
    notice.startsWith("นำเข้า STM/REP แล้ว")
  );
}

function SavedDataNotice({
  notice,
  canViewDailyVisits,
  canViewRegistry,
}: {
  notice: string | null;
  canViewDailyVisits: boolean;
  canViewRegistry: boolean;
}) {
  if (!notice) return null;
  const showLinks = isSavedDataNotice(notice);
  return (
    <div className={`rounded-[1.2rem] border px-4 py-3 text-sm shadow-sm ${showLinks ? "border-[#b8eadf] bg-[#eefbf7] text-[#0f5132]" : "border-[#d9e5ec] bg-[#f7fbfd] text-[#5f7486]"}`}>
      <div className="font-medium">{notice}</div>
      {showLinks ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canViewDailyVisits ? (
            <Link
              href="/daily-visits"
              className="rounded-xl border border-[#0f766e33] bg-white px-3 py-2 text-xs font-medium text-[#0f766e]"
            >
              ดูข้อมูลเยี่ยมที่บันทึก
            </Link>
          ) : null}
          {canViewRegistry ? (
            <Link
              href="/case-manager/registry"
              className="rounded-xl border border-[#12304722] bg-white px-3 py-2 text-xs font-medium text-[#123047]"
            >
              ดูทะเบียนข้อมูลผู้ป่วย
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SignaturePad({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const getPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const saveCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className="rounded-2xl border border-[#d9e5ec] bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[#123047]">{label}</div>
        <button
          type="button"
          onClick={clearCanvas}
          className="rounded-full border border-[#d9e5ec] px-3 py-1 text-xs text-[#5f7486]"
        >
          ล้างลายเซ็น
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={520}
        height={180}
        className="h-36 w-full touch-none rounded-xl border border-dashed border-[#b9ccd8] bg-[#fbfdff]"
        onPointerDown={(event) => {
          const canvas = canvasRef.current;
          const context = canvas?.getContext("2d");
          if (!canvas || !context) return;
          const point = getPoint(event);
          drawingRef.current = true;
          canvas.setPointerCapture(event.pointerId);
          context.lineWidth = 3;
          context.lineCap = "round";
          context.strokeStyle = "#123047";
          context.beginPath();
          context.moveTo(point.x, point.y);
        }}
        onPointerMove={(event) => {
          if (!drawingRef.current) return;
          const context = canvasRef.current?.getContext("2d");
          if (!context) return;
          const point = getPoint(event);
          context.lineTo(point.x, point.y);
          context.stroke();
        }}
        onPointerUp={(event) => {
          drawingRef.current = false;
          canvasRef.current?.releasePointerCapture(event.pointerId);
          saveCanvas();
        }}
        onPointerLeave={() => {
          if (drawingRef.current) saveCanvas();
          drawingRef.current = false;
        }}
      />
      <div className="mt-2 text-xs text-[#6f8190]">
        {value ? "ลงลายเซ็นแล้ว" : "ให้เซ็นในกรอบนี้ด้วยนิ้วหรือปากกา stylus"}
      </div>
    </div>
  );
}

function escapeHtml(value?: string) {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function makeAcpSnapshotJpeg(input: {
  form: AdvanceCarePlanForm;
  patient?: PalliativePatient;
  visit?: PalliativeVisit;
  signatures: Record<string, string>;
}) {
  const { form, patient, visit, signatures } = input;
  const list = (items: string[], other?: string) =>
    [...items, other?.trim()].filter(Boolean).map(escapeHtml).join(", ") || "-";
  const signatureBox = (label: string, name?: string, dataUrl?: string) => `
    <div class="sig">
      <div class="sig-label">${escapeHtml(label)}</div>
      ${
        dataUrl
          ? `<img src="${dataUrl}" />`
          : `<div class="sig-empty">ยังไม่มีลายเซ็น</div>`
      }
      <div class="sig-name">(${escapeHtml(name || "-")})</div>
    </div>
  `;
  const html = `
    <div xmlns="http://www.w3.org/1999/xhtml" class="page">
      <style>
        .page{box-sizing:border-box;width:900px;min-height:1280px;padding:42px;font-family:"Noto Sans Thai","Tahoma",sans-serif;color:#123047;background:#fff}
        .header{padding:24px;border-radius:28px;background:linear-gradient(135deg,#0f4f4b,#d8efe8);color:white}
        .eyebrow{font-size:14px;letter-spacing:.18em;text-transform:uppercase;opacity:.8}
        h1{margin:8px 0 4px;font-size:34px;line-height:1.18}
        .sub{font-size:17px;opacity:.9}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .section{margin-top:18px;padding:18px;border:1px solid #d9e5ec;border-radius:22px;background:#f8fcfe}
        .title{font-size:20px;font-weight:700;margin-bottom:10px;color:#0f4f4b}
        .field{padding:10px 12px;border-radius:14px;background:white;font-size:15px;line-height:1.55}
        .label{font-size:12px;color:#6f8190}
        .value{margin-top:2px;font-weight:600;color:#123047}
        .wide{grid-column:1/-1}
        .consent{font-size:14px;line-height:1.7;background:#fff;border-radius:16px;padding:12px;color:#334b5f}
        .sigs{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
        .sig{background:white;border:1px dashed #b9ccd8;border-radius:16px;padding:10px;text-align:center}
        .sig-label{font-size:13px;color:#6f8190}
        .sig img{height:82px;max-width:100%;object-fit:contain}
        .sig-empty{height:82px;display:flex;align-items:center;justify-content:center;color:#9aaaba;font-size:13px}
        .sig-name{font-size:14px;color:#123047}
      </style>
      <div class="header">
        <div class="eyebrow">Advance Care Plan / Living Will</div>
        <h1>การวางแผนการดูแลล่วงหน้า</h1>
        <div class="sub">ทำที่โรงพยาบาลโคกศรีสุพรรณ วันที่ ${escapeHtml(formatDate(form.planDate))}</div>
      </div>
      <div class="section">
        <div class="title">ส่วนที่ 1 ข้อมูลผู้แสดงเจตนา</div>
        <div class="grid">
          <div class="field"><div class="label">ชื่อ-สกุล</div><div class="value">${escapeHtml(form.patientName || patient?.fullName)}</div></div>
          <div class="field"><div class="label">HN / Visit</div><div class="value">${escapeHtml(patient?.hn)} / ${escapeHtml(visit ? formatDate(visit.visitDate) : "-")}</div></div>
          <div class="field"><div class="label">อายุ</div><div class="value">${escapeHtml(form.patientAge)}</div></div>
          <div class="field"><div class="label">เลขบัตรประชาชน</div><div class="value">${escapeHtml(form.patientCid || patient?.cid)}</div></div>
          <div class="field"><div class="label">วันเดือนปีเกิด</div><div class="value">${escapeHtml(formatDate(form.patientBirthDate))}</div></div>
          <div class="field"><div class="label">สิทธิรักษา</div><div class="value">${escapeHtml(form.insurance)}</div></div>
          <div class="field wide"><div class="label">ที่อยู่</div><div class="value">${escapeHtml(form.patientAddress)}</div></div>
          <div class="field"><div class="label">โทรศัพท์</div><div class="value">${escapeHtml(form.patientPhone)}</div></div>
          <div class="field"><div class="label">ผู้ร่วมวางแผน</div><div class="value">${escapeHtml(form.coPlannerName)}</div></div>
          <div class="field"><div class="label">ความสัมพันธ์/โทรศัพท์</div><div class="value">${escapeHtml(form.coPlannerRelation)} ${escapeHtml(form.coPlannerPhone)}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="title">ส่วนที่ 2 ความต้องการและขอบเขตการรักษา</div>
        <div class="grid">
          <div class="field wide"><div class="label">สิ่งที่ให้ความสำคัญ</div><div class="value">${list(form.importantValues, form.importantValuesOther)}</div></div>
          <div class="field wide"><div class="label">สภาวะที่ไม่ต้องการ/ยอมรับไม่ได้</div><div class="value">${list(form.unacceptableStates, form.unacceptableStatesOther)}</div></div>
          <div class="field wide"><div class="label">ขอบเขตการรักษาที่ต้องการ</div><div class="value">${escapeHtml(form.treatmentScope)} ${escapeHtml(form.treatmentScopeOther)}</div></div>
          <div class="field wide"><div class="label">การดูแลอื่นๆ</div><div class="value">${escapeHtml(form.otherCare)}</div></div>
          <div class="field"><div class="label">การตายสงบตามธรรมชาติ</div><div class="value">${escapeHtml(form.terminalNaturalDeath)}</div></div>
          <div class="field"><div class="label">ปรารถนาเสียชีวิตที่</div><div class="value">${escapeHtml(form.preferredPlace)} ${escapeHtml(form.preferredPlaceOther)}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="title">ส่วนที่ 3 ผู้ตัดสินใจแทนและการยินยอมข้อมูล</div>
        <div class="grid">
          <div class="field"><div class="label">ผู้ตัดสินใจแทน</div><div class="value">${escapeHtml(form.proxyName)}</div></div>
          <div class="field"><div class="label">ความสัมพันธ์/โทรศัพท์</div><div class="value">${escapeHtml(form.proxyRelation)} ${escapeHtml(form.proxyPhone)}</div></div>
          <div class="field wide"><div class="label">ที่อยู่ผู้ตัดสินใจแทน</div><div class="value">${escapeHtml(form.proxyAddress)}</div></div>
          <div class="consent wide">ผู้แสดงเจตนายินยอมให้ผู้ประกอบวิชาชีพด้านสุขภาพเข้าถึงและเปิดเผยข้อมูลสุขภาพผ่านระบบอิเล็กทรอนิกส์ เพื่อประโยชน์ในการรักษาพยาบาลและการส่งต่อข้อมูลที่ต่อเนื่อง โดยสถานพยาบาลจะคุ้มครองข้อมูลส่วนบุคคลตามมาตรฐานที่เกี่ยวข้อง</div>
        </div>
        <div class="sigs">
          ${signatureBox("ผู้แสดงเจตนา", form.patientSignerName, signatures.patient)}
          ${signatureBox("ผู้ตัดสินใจแทน", form.proxySignerName, signatures.proxy)}
          ${signatureBox("พยาน 1", form.witness1Name, signatures.witness1)}
          ${signatureBox("พยาน 2", form.witness2Name, signatures.witness2)}
          ${signatureBox("บุคลากรด้านสุขภาพ", form.healthStaffName, signatures.staff)}
        </div>
      </div>
    </div>
  `;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1280"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
  const image = new window.Image();
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("สร้างภาพเอกสาร ACP/LW ไม่สำเร็จ"));
    image.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1280;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ไม่สามารถสร้าง PDF preview ได้");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function candidateModeLabel(mode: CandidateFilterMode) {
  if (mode === "missing_both_z")
    return "ยังไม่เคยลงทั้ง Z51.5 และ Z71.8";
  if (mode === "missing_any_z")
    return "ยังไม่เคยลง Z51.5 หรือ Z71.8 อย่างใดอย่างหนึ่ง";
  if (mode === "z_done_but_visit_incomplete")
    return `ลง Z ครบแล้ว แต่เยี่ยมครบเกณฑ์ยังไม่ถึง ${REQUIRED_COMPLETE_VISITS} ครั้ง`;
  return "ทุกเคสเข้าเกณฑ์";
}

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: "hospital_admin", label: "Admin โรงพยาบาล" },
  { value: "hospital_case_manager", label: "Case Manager โรงพยาบาล" },
  { value: "hospital_executive", label: "ผู้บริหาร" },
  { value: "hospital_card_room", label: "ห้องบัตร" },
  { value: "hospital_pcu", label: "PCU โรงพยาบาล" },
  { value: "unit_manager", label: "หัวหน้าหน่วย" },
  { value: "unit_nurse", label: "พยาบาลหน่วย" },
];

const publicRegisterRoleOptions = roleOptions.filter((option) =>
  [
    "hospital_pcu",
    "hospital_executive",
    "hospital_card_room",
    "unit_manager",
    "unit_nurse",
  ].includes(option.value),
);

function getManageableRoleOptions(role?: UserRole) {
  if (role === "hospital_admin") return roleOptions;
  if (role === "hospital_case_manager") {
    return roleOptions.filter(
      (option) =>
        option.value !== "hospital_admin" &&
        option.value !== "hospital_case_manager",
    );
  }
  return roleOptions.filter((option) => option.value === "unit_nurse");
}

function getSelfNavigationActions(role?: UserRole) {
  if (role === "hospital_admin") {
    return [
      { href: "/case-manager", label: "ไปหน้า Case Manager" },
      { href: "/case-manager/registry", label: "ไปหน้าทะเบียนเคส" },
      { href: "/executive", label: "ไปหน้าผู้บริหาร" },
      { href: "/card-room", label: "ไปหน้าห้องบัตร" },
      { href: "/daily-visits", label: "รายงานเยี่ยมรายวัน" },
    ];
  }
  if (role === "hospital_case_manager") {
    return [
      { href: "/case-manager", label: "ไปหน้า Case Manager" },
      { href: "/case-manager/registry", label: "ไปหน้าทะเบียนเคส" },
      { href: "/executive", label: "ไปหน้าผู้บริหาร" },
      { href: "/card-room", label: "ไปหน้าห้องบัตร" },
      { href: "/daily-visits", label: "รายงานเยี่ยมรายวัน" },
    ];
  }
  if (role === "hospital_executive") {
    return [{ href: "/executive", label: "ไปหน้าผู้บริหาร" }];
  }
  if (role === "hospital_card_room") {
    return [{ href: "/card-room", label: "ไปหน้าห้องบัตร" }];
  }
  if (role === "unit_manager") {
    return [
      { href: "/unit-overview", label: "ไปหน้าภาพรวมหน่วย" },
      { href: "/daily-visits", label: "รายงานเยี่ยมรายวัน" },
    ];
  }
  if (role === "unit_nurse") {
    return [
      { href: "/nurse", label: "ไปหน้าพยาบาลหน่วย" },
      { href: "/daily-visits", label: "รายงานเยี่ยมรายวัน" },
    ];
  }
  if (role === "hospital_pcu") {
    return [
      { href: "/case-manager/registry", label: "ไปหน้าทะเบียนเคส" },
      { href: "/daily-visits", label: "รายงานเยี่ยมรายวัน" },
    ];
  }
  return [];
}

async function requestJson(url: string, init?: RequestInit, authToken?: string) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(authToken
        ? { authorization: `Bearer ${authToken}` }
        : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text || "Request failed";
    try {
      const payload = JSON.parse(text) as { error?: string };
      message = payload.error || message;
    } catch {
      // Keep the raw response text when the server did not return JSON.
    }
    throw new Error(message);
  }
  if (response.status === 204 || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
  }
}

async function filesToPayload(files: FileList | null) {
  if (!files?.length) return [] as Array<{ fileName: string; dataUrl: string }>;
  return Promise.all(
    [...files].map(
      (file) =>
        new Promise<{ fileName: string; dataUrl: string }>(
          (resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                fileName: file.name,
                dataUrl: String(reader.result ?? ""),
              });
            reader.onerror = () =>
              reject(reader.error ?? new Error("Cannot read image"));
            reader.readAsDataURL(file);
          },
        ),
    ),
  );
}

async function filesToPayloadWithCaption(
  files: FileList | null,
  caption: VisitPhotoCategory,
) {
  const payload = await filesToPayload(files);
  return payload.map((item) => ({ ...item, caption }));
}

async function fileGroupsToPayloadWithCaption(
  filesList: Array<FileList | null>,
  caption: VisitPhotoCategory,
) {
  const groups = await Promise.all(
    filesList
      .filter((files): files is FileList => Boolean(files?.length))
      .map((files) => filesToPayloadWithCaption(files, caption)),
  );
  return groups.flat();
}

function parseStmText(text: string, fallbackClaimMonth: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[;,|\t]/).map((part) => part.trim()))
    .filter((parts) => parts.length >= 4 && parts[0].toLowerCase() !== "hn")
    .map(([hn, patientName, amountText, unitId, claimMonth, note]) => ({
      hn,
      patientName: patientName || hn,
      amount: Number.parseFloat(amountText.replace(/,/g, "")),
      unitId,
      claimMonth: claimMonth || fallbackClaimMonth,
      note,
    }))
    .filter((row) => row.hn && row.unitId && !Number.isNaN(row.amount));
}

function Box({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.8rem] border border-[rgba(20,55,84,0.12)] bg-white p-5 shadow-[0_20px_50px_rgba(8,33,51,0.08)]">
      <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#123047]">
        {title}
      </h2>
      {note ? (
        <p className="mt-1 text-sm leading-6 text-[#5f7486]">{note}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function PalliativeWorkspace({
  initialSnapshot,
  preferredRole,
}: {
  initialSnapshot: AppSnapshot;
  preferredRole?: UserRole;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const initialUser =
    initialSnapshot.users.find((user) => user.role === preferredRole) ??
    initialSnapshot.users[1] ??
    initialSnapshot.users[0];
  const initialPatient = initialSnapshot.patients[0];
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [activeUserId, setActiveUserId] = useState(initialUser?.id ?? "");
  const [selectedPatientId, setSelectedPatientId] = useState(
    initialPatient?.id ?? 0,
  );
  const [candidateDate, setCandidateDate] = useState(
    initialSnapshot.currentDate,
  );
  const [candidateClinic, setCandidateClinic] = useState("all");
  const [candidateMode, setCandidateMode] = useState<CandidateFilterMode>(
    initialUser?.role === "hospital_case_manager" ? "missing_both_z" : "all",
  );
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateRows, setCandidateRows] = useState<HosCandidate[]>([]);
  const [selectedCandidateKey, setSelectedCandidateKey] = useState("");
  const [signupUnitId, setSignupUnitId] = useState(
    initialSnapshot.units.find((unit) => unit.kind !== "hospital")?.id ?? "",
  );
  const [registerDate, setRegisterDate] = useState(initialSnapshot.currentDate);
  const [registerNote, setRegisterNote] = useState(
    "มอบหมายเยี่ยมบ้านจากโรงพยาบาล",
  );
  const [renameDraft, setRenameDraft] = useState(
    initialUser?.displayName ?? "",
  );
  const [commentDraft, setCommentDraft] = useState("");
  const [commentAudience, setCommentAudience] =
    useState<CommentAudience>("all");
  const [patientDraft, setPatientDraft] = useState({
    phone: initialPatient?.phone ?? "",
    relativePhone: initialPatient?.relativePhone ?? "",
    lineId: initialPatient?.lineId ?? "",
    nextVisitAt: initialPatient?.nextVisitAt ?? "",
    notes: initialPatient?.notes ?? "",
    assignedUnitId: initialPatient?.assignedUnitId ?? "",
  });
  const [cancelReason, setCancelReason] = useState(
    "ข้อมูลไม่เข้าเกณฑ์ / ย้ายการดูแล",
  );
  const [visitDraft, setVisitDraft] = useState({
    visitDate: initialPatient?.nextVisitAt ?? initialSnapshot.currentDate,
    authenCode: "",
    symptoms: "",
    note: "",
  });
  const [visitChecklist, setVisitChecklist] = useState<VisitChecklist>(
    defaultVisitChecklistState,
  );
  const [visitClinical, setVisitClinical] = useState<VisitClinicalAssessment>(
    createDefaultClinicalAssessment,
  );
  const [acpSelectedVisitId, setAcpSelectedVisitId] = useState<number>(0);
  const [acpDraft, setAcpDraft] = useState<AdvanceCarePlanForm>(() =>
    createAcpDraft(initialPatient, initialSnapshot.currentDate),
  );
  const [acpPatientSignature, setAcpPatientSignature] = useState("");
  const [acpProxySignature, setAcpProxySignature] = useState("");
  const [acpWitness1Signature, setAcpWitness1Signature] = useState("");
  const [acpWitness2Signature, setAcpWitness2Signature] = useState("");
  const [acpStaffSignature, setAcpStaffSignature] = useState("");
  const [selectedPatientVisitHistory, setSelectedPatientVisitHistory] = useState<
    CandidateVisitHistory[]
  >([]);
  const [selectedPatientVisitHistoryLoading, setSelectedPatientVisitHistoryLoading] =
    useState(false);
  const [stmText, setStmText] = useState("");
  const [stmPercent, setStmPercent] = useState(50);
  const [stmFileName, setStmFileName] = useState("REP_STM_import.csv");
  const [importSource, setImportSource] = useState<ImportSource>("STM");
  const [importFiles, setImportFiles] = useState<ImportFileOption[]>([]);
  const [selectedImportPath, setSelectedImportPath] = useState("");
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState("");
  const [sessionUser, setSessionUser] = useState<AuthSessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerDisplayName, setRegisterDisplayName] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerRole, setRegisterRole] = useState<UserRole>("unit_nurse");
  const [registerUnitId, setRegisterUnitId] = useState(
    initialSnapshot.units.find((unit) => unit.kind !== "hospital")?.id ?? "",
  );
  const [cardRoomDate, setCardRoomDate] = useState(initialSnapshot.currentDate);
  const [dailyVisitDate, setDailyVisitDate] = useState(initialSnapshot.currentDate);
  const [editingVisitId, setEditingVisitId] = useState<number | null>(null);
  const [dailyVisitDraft, setDailyVisitDraft] = useState({
    visitDate: initialSnapshot.currentDate,
    authenCode: "",
    symptoms: "",
    note: "",
  });
  const [dailyVisitChecklist, setDailyVisitChecklist] = useState<VisitChecklist>(
    defaultVisitChecklistState,
  );
  const [dailyVisitClinical, setDailyVisitClinical] =
    useState<VisitClinicalAssessment>(createDefaultClinicalAssessment);
  const [dailyPatientCardFiles, setDailyPatientCardFiles] = useState<Array<FileList | null>>([null]);
  const [dailyFollowUpFiles, setDailyFollowUpFiles] = useState<Array<FileList | null>>([null]);
  const [dailyPatientCardFileInputKey, setDailyPatientCardFileInputKey] = useState(0);
  const [dailyFollowUpFileInputKey, setDailyFollowUpFileInputKey] = useState(0);
  const [pendingRequests, setPendingRequests] = useState<PendingUserRequest[]>([]);
  const [newUserDraft, setNewUserDraft] = useState({
    username: "",
    displayName: "",
    password: "",
    role: "unit_nurse" as UserRole,
    unitId: initialSnapshot.units.find((unit) => unit.kind !== "hospital")?.id ?? "",
    active: true,
  });
  const [editingUserId, setEditingUserId] = useState("");
  const [editingUserDraft, setEditingUserDraft] = useState({
    username: "",
    displayName: "",
    password: "",
    role: "unit_nurse" as UserRole,
    unitId: initialSnapshot.units.find((unit) => unit.kind !== "hospital")?.id ?? "",
    active: true,
  });
  const [userManagementTab, setUserManagementTab] =
    useState<UserManagementTab>("members");

  const refresh = async () => {
    const nextSnapshot = (await requestJson("/api/app", undefined, authToken)) as AppSnapshot;
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  };
  const activeSnapshotUser = snapshot.users.find((user) => user.id === activeUserId);
  const sessionSnapshotUser = snapshot.users.find(
    (user) => user.id === sessionUser?.id,
  );
  const preferredSnapshotUser = preferredRole
    ? snapshot.users.find((user) => user.role === preferredRole)
    : null;
  const isPreviewingAnotherUser =
    Boolean(activeSnapshotUser) && activeSnapshotUser?.id !== sessionSnapshotUser?.id;
  const canPreviewPreferredRole =
    sessionSnapshotUser?.role === "hospital_admin" && isPreviewingAnotherUser;
  const currentUser =
    (activeSnapshotUser &&
    (!preferredRole ||
      activeSnapshotUser.role === preferredRole ||
      canPreviewPreferredRole)
      ? activeSnapshotUser
      : null) ??
    (sessionSnapshotUser &&
    (!preferredRole || sessionSnapshotUser.role === preferredRole)
      ? sessionSnapshotUser
      : null) ??
    preferredSnapshotUser ??
    activeSnapshotUser ??
    sessionSnapshotUser ??
    snapshot.users[0];
  const isHospitalBoard =
    currentUser?.role === "hospital_admin" ||
    currentUser?.role === "hospital_case_manager";
  const isCaseManager = currentUser?.role === "hospital_case_manager";
  const canViewExecutive =
    currentUser?.role === "hospital_executive" ||
    currentUser?.role === "hospital_admin" ||
    currentUser?.role === "hospital_case_manager";
  const isCardRoom = currentUser?.role === "hospital_card_room";
  const canViewCardRoom =
    currentUser?.role === "hospital_card_room" ||
    currentUser?.role === "hospital_admin" ||
    currentUser?.role === "hospital_case_manager";
  const canViewDailyVisits =
    currentUser?.role === "hospital_admin" ||
    currentUser?.role === "hospital_case_manager" ||
    currentUser?.role === "hospital_pcu" ||
    currentUser?.role === "unit_manager" ||
    currentUser?.role === "unit_nurse";
  const pageNavigationActions = useMemo(() => {
    if (
      currentUser?.role !== "hospital_admin" &&
      currentUser?.role !== "hospital_case_manager" &&
      currentUser?.role !== "hospital_executive" &&
      currentUser?.role !== "hospital_pcu" &&
      currentUser?.role !== "unit_manager" &&
      currentUser?.role !== "unit_nurse"
    ) {
      return [];
    }
    return [
      { href: "/", label: "หน้าหลัก" },
      ...getSelfNavigationActions(currentUser.role).filter((action) => action.href !== pathname),
    ];
  }, [currentUser?.role, pathname]);
  const isUnitNurse = currentUser?.role === "unit_nurse";
  const isUnitManager = currentUser?.role === "unit_manager";
  const [nurseTab, setNurseTab] = useState<NurseWorkspaceTab>("search");
  const [nurseRegistryMode, setNurseRegistryMode] =
    useState<"tracking" | "completed">("tracking");
  const [unitManagerRegistryMode, setUnitManagerRegistryMode] =
    useState<"tracking" | "completed">("tracking");
  const [nurseSearch, setNurseSearch] = useState("");
  const [nursePatientPage, setNursePatientPage] = useState(1);
  const [registrySearch, setRegistrySearch] = useState("");
  const [registryUnitFilter, setRegistryUnitFilter] = useState("all");
  const [registryPage, setRegistryPage] = useState(1);
  const [pendingNursePatientId, setPendingNursePatientId] = useState<number | null>(null);
  const [patientCardFiles, setPatientCardFiles] = useState<Array<FileList | null>>([null]);
  const [patientCardFileInputKey, setPatientCardFileInputKey] = useState(0);
  const [followUpFiles, setFollowUpFiles] = useState<Array<FileList | null>>([null]);
  const [followUpFileInputKey, setFollowUpFileInputKey] = useState(0);
  const visiblePatients = useMemo(
    () =>
      isHospitalBoard
        ? snapshot.patients
        : snapshot.patients.filter(
            (patient) => patient.assignedUnitId === currentUser?.unitId,
          ),
    [currentUser?.unitId, isHospitalBoard, snapshot.patients],
  );
  const nursePatients = useMemo(() => {
    if (!isUnitNurse) return visiblePatients;
    const keyword = nurseSearch.trim().toLowerCase();
    if (!keyword) return visiblePatients;
    return visiblePatients.filter((patient) => {
      const haystack =
        `${patient.hn} ${patient.cid} ${patient.fullName} ${patient.primaryDxCode} ${patient.assignedUnitName}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [isUnitNurse, nurseSearch, visiblePatients]);
  const nursePatientsPerPage = 5;
  const nursePatientsPageCount = Math.max(
    1,
    Math.ceil(nursePatients.length / nursePatientsPerPage),
  );
  const nursePatientsPage = Math.min(nursePatientPage, nursePatientsPageCount);
  const nursePatientsPageItems = nursePatients.slice(
    (nursePatientsPage - 1) * nursePatientsPerPage,
    nursePatientsPage * nursePatientsPerPage,
  );
  const selectedPatient =
    visiblePatients.find((patient) => patient.id === selectedPatientId) ??
    visiblePatients[0];
  const selectedVisits = snapshot.visits.filter(
    (visit) => visit.patientId === selectedPatient?.id,
  );
  const selectedAcpVisit =
    selectedVisits.find((visit) => visit.id === acpSelectedVisitId) ??
    selectedVisits[0];
  const selectedComments = snapshot.comments.filter(
    (comment) => comment.patientId === selectedPatient?.id,
  );
  const selectedCandidate = candidateRows.find(
    (candidate) => candidateRowKey(candidate) === selectedCandidateKey,
  );
  const roleGuide = snapshot.guides.find(
    (guide) => guide.role === currentUser?.role,
  );
  const visibleUnits = isHospitalBoard
    ? snapshot.unitSummaries
    : snapshot.unitSummaries.filter(
        (row) => row.unitId === currentUser?.unitId,
      );
  const readyRows = (isHospitalBoard ? snapshot.patients : visiblePatients)
    .filter((patient) => patient.claimChecklist.readyForClaim)
    .slice(0, 6);
  const latestStm = snapshot.stmBatches[0];
  const pendingNursePatient = visiblePatients.find(
    (patient) => patient.id === pendingNursePatientId,
  );
  const selectedUnit = snapshot.units.find(
    (unit) => unit.id === selectedPatient?.assignedUnitId,
  );
  const currentUnitSummary = visibleUnits[0];
  const currentUnitId = currentUser?.unitId;
  const fiscalYearStart = getFiscalYearStart(snapshot.currentDate);
  const currentUnitVisitPatients = currentUnitId
    ? snapshot.patients.filter(
        (patient) =>
          patient.assignedUnitId === currentUnitId &&
          patient.careStatus !== "cancelled" &&
          patient.careStatus !== "deceased",
      )
    : [];
  const currentUnitRemainingCount = currentUnitVisitPatients.filter(
    (patient) => patient.careStatus !== "completed",
  ).length;
  const currentUnitCompletedCount = currentUnitVisitPatients.filter(
    (patient) => patient.careStatus === "completed",
  ).length;
  const currentUnitVisitTodayCount = currentUnitId
    ? snapshot.visits.filter((visit) => {
        const patient = snapshot.patients.find(
          (row) => row.id === visit.patientId,
        );
        return (
          patient?.assignedUnitId === currentUnitId &&
          visit.visitDate === snapshot.currentDate
        );
      }).length
    : 0;
  const currentUnitVisitMonthCount = currentUnitId
    ? snapshot.visits.filter((visit) => {
        const patient = snapshot.patients.find(
          (row) => row.id === visit.patientId,
        );
        return (
          patient?.assignedUnitId === currentUnitId &&
          monthKey(visit.visitDate) === monthKey(snapshot.currentDate)
        );
      }).length
    : 0;
  const registryTrackingPatients = visiblePatients.filter(
    (patient) =>
      patient.careStatus === "registered" ||
      patient.careStatus === "scheduled" ||
      patient.careStatus === "active",
  );
  const registryCompletedPatients = visiblePatients.filter(
    (patient) => patient.careStatus === "completed",
  );
  const registryMode = isUnitManager ? unitManagerRegistryMode : nurseRegistryMode;
  const registryBasePatients =
    isUnitNurse || isUnitManager
      ? registryMode === "tracking"
        ? registryTrackingPatients
        : registryCompletedPatients
      : visiblePatients;
  const registryUnitOptions = useMemo(
    () => snapshot.units.filter((unit) => unit.kind !== "hospital"),
    [snapshot.units],
  );
  const selectedRegistryUnitName =
    registryUnitFilter === "all"
      ? "ทุกหน่วย"
      : registryUnitOptions.find((unit) => unit.id === registryUnitFilter)?.name ??
        "ไม่พบหน่วย";
  const registryFilteredPatients = useMemo(() => {
    const unitFilteredPatients =
      isHospitalBoard && registryUnitFilter !== "all"
        ? registryBasePatients.filter(
            (patient) => patient.assignedUnitId === registryUnitFilter,
          )
        : registryBasePatients;
    const keyword = registrySearch.trim().toLowerCase();
    if (!keyword) return unitFilteredPatients;
    return unitFilteredPatients.filter((patient) => {
      const haystack =
        `${patient.hn} ${patient.cid} ${patient.fullName} ${patient.primaryDxCode} ${patient.primaryDxName} ${patient.assignedUnitName}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [isHospitalBoard, registryBasePatients, registrySearch, registryUnitFilter]);
  const registryPatientsPerPage = 21;
  const registryPageCount = Math.max(
    1,
    Math.ceil(registryFilteredPatients.length / registryPatientsPerPage),
  );
  const currentRegistryPage = Math.min(registryPage, registryPageCount);
  const registryPageItems = registryFilteredPatients.slice(
    (currentRegistryPage - 1) * registryPatientsPerPage,
    currentRegistryPage * registryPatientsPerPage,
  );
  const registryPageList = buildPageList(currentRegistryPage, registryPageCount);
  const fiscalYearVisitCount = snapshot.visits.filter((visit) => {
    if (!selectedPatient?.assignedUnitId) return false;
    const unitPatient = snapshot.patients.find((patient) => patient.id === visit.patientId);
    return Boolean(
      unitPatient &&
      unitPatient.assignedUnitId === selectedPatient.assignedUnitId &&
      visit.visitDate >= fiscalYearStart &&
      visit.visitDate <= snapshot.currentDate,
    );
  }).length;
  const canApproveUsers =
    sessionUser?.role === "hospital_admin" ||
    sessionUser?.role === "hospital_case_manager";
  const isAdmin = sessionUser?.role === "hospital_admin";
  const canManageUsers = canApproveUsers;
  const manageableRoleOptions = useMemo(
    () => getManageableRoleOptions(sessionUser?.role),
    [sessionUser?.role],
  );
  const currentUserActions = useMemo(
    () => getSelfNavigationActions(currentUser?.role),
    [currentUser?.role],
  );
  const selectableUsers = useMemo(() => {
    if (!sessionUser) return [];
    if (isAdmin) return snapshot.users;
    return snapshot.users.filter((user) => user.id === sessionUser.id);
  }, [isAdmin, sessionUser, snapshot.users]);
  const unitReportRows = useMemo(
    () =>
      visibleUnits.map((row) => {
        const unitPatients = snapshot.patients.filter(
          (patient) =>
            patient.assignedUnitId === row.unitId &&
            patient.careStatus !== "cancelled",
        );
        const patientIds = new Set(unitPatients.map((patient) => patient.id));
        const latestComment = snapshot.comments.find((comment) =>
          patientIds.has(comment.patientId),
        );

        return {
          ...row,
          dueToday: unitPatients.filter(
            (patient) => patient.nextVisitAt === snapshot.currentDate,
          ).length,
          overdue: unitPatients.filter(
            (patient) =>
              patient.nextVisitAt && patient.nextVisitAt < snapshot.currentDate,
          ).length,
          incompleteClaims: unitPatients.filter(
            (patient) => !patient.claimChecklist.readyForClaim,
          ).length,
          latestCommentAt: latestComment?.createdAt,
        };
    }),
    [snapshot.comments, snapshot.currentDate, snapshot.patients, visibleUnits],
  );
  const visitSixTableRows = useMemo(() => {
    const visitMap = new Map<number, string[]>();
    const orderedVisits = [...snapshot.visits].sort(
      (a, b) => a.visitDate.localeCompare(b.visitDate) || a.id - b.id,
    );
    for (const visit of orderedVisits) {
      const list = visitMap.get(visit.patientId) ?? [];
      if (list.length < 6) {
        list.push(visit.visitDate);
        visitMap.set(visit.patientId, list);
      }
    }

    return visiblePatients.map((patient, index) => {
      const completed =
        visitMap.get(patient.id)?.length
          ? [...(visitMap.get(patient.id) ?? [])]
          : [...(patient.historicalVisitDates ?? [])];
      const rounds = Array.from({ length: 6 }, () => "");
      completed.slice(0, 6).forEach((value, roundIndex) => {
        rounds[roundIndex] = value;
      });
      return {
        order: index + 1,
        patient,
        rounds,
      };
    });
  }, [snapshot.visits, visiblePatients]);
  const selectedPatientVisitSixRow = useMemo(
    () =>
      visitSixTableRows.find(
        (row) => row.patient.id === selectedPatient?.id,
      ) ?? null,
    [selectedPatient?.id, visitSixTableRows],
  );
  const displayedSelectedPatientVisitHistory = selectedPatient?.hn
    ? selectedPatientVisitHistory
    : [];
  const executiveRows = useMemo(() => {
    const unitRows = snapshot.units.filter((unit) => unit.kind !== "hospital");
    return unitRows.map((unit) => {
      const patients = snapshot.patients.filter(
        (patient) =>
          patient.assignedUnitId === unit.id &&
          patient.careStatus !== "cancelled" &&
          patient.careStatus !== "deceased",
      );
      const patientIds = new Set(patients.map((patient) => patient.id));
      const completed = patients.filter((patient) => patient.careStatus === "completed").length;
      const remaining = patients.length - completed;
      const readyForClaim = patients.filter((patient) => patient.claimChecklist.readyForClaim).length;
      const overdue = patients.filter(
        (patient) => patient.nextVisitAt && patient.nextVisitAt < snapshot.currentDate,
      ).length;
      const visitsToday = snapshot.visits.filter(
        (visit) => patientIds.has(visit.patientId) && visit.visitDate === snapshot.currentDate,
      ).length;
      const visitsMonth = snapshot.visits.filter(
        (visit) =>
          patientIds.has(visit.patientId) &&
          monthKey(visit.visitDate) === monthKey(snapshot.currentDate),
      ).length;
      const visitsFiscalYear = snapshot.visits.filter(
        (visit) =>
          patientIds.has(visit.patientId) &&
          visit.visitDate >= fiscalYearStart &&
          visit.visitDate <= snapshot.currentDate,
      ).length;
      const progress = patients.length ? Math.round((completed / patients.length) * 100) : 0;
      const diseaseMap = new Map<string, number>();
      for (const patient of patients) {
        const label = getExecutiveDiseaseGroup(patient);
        diseaseMap.set(label, (diseaseMap.get(label) ?? 0) + 1);
      }
      const diseaseRows = [...diseaseMap.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "th"));
      const topDisease = diseaseRows[0];

      return {
        unitId: unit.id,
        unitName: unit.name,
        unitKind: unit.kind,
        total: patients.length,
        completed,
        remaining,
        readyForClaim,
        overdue,
        visitsToday,
        visitsMonth,
        visitsFiscalYear,
        progress,
        diseaseRows,
        topDiseaseLabel: topDisease?.label ?? "-",
        topDiseaseCount: topDisease?.count ?? 0,
      };
    });
  }, [fiscalYearStart, snapshot.currentDate, snapshot.patients, snapshot.units, snapshot.visits]);
  const executiveTotals = useMemo(() => {
    const total = executiveRows.reduce((sum, row) => sum + row.total, 0);
    const completed = executiveRows.reduce((sum, row) => sum + row.completed, 0);
    const remaining = executiveRows.reduce((sum, row) => sum + row.remaining, 0);
    const visitsToday = executiveRows.reduce((sum, row) => sum + row.visitsToday, 0);
    const visitsMonth = executiveRows.reduce((sum, row) => sum + row.visitsMonth, 0);
    const visitsFiscalYear = executiveRows.reduce((sum, row) => sum + row.visitsFiscalYear, 0);
    const readyForClaim = executiveRows.reduce((sum, row) => sum + row.readyForClaim, 0);
    const overdue = executiveRows.reduce((sum, row) => sum + row.overdue, 0);
    return {
      total,
      completed,
      remaining,
      visitsToday,
      visitsMonth,
      visitsFiscalYear,
      readyForClaim,
      overdue,
      progress: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [executiveRows]);
  const executiveDiseaseRows = useMemo(() => {
    const diseaseMap = new Map<string, number>();
    for (const patient of snapshot.patients) {
      if (patient.careStatus === "cancelled" || patient.careStatus === "deceased") continue;
      const label = getExecutiveDiseaseGroup(patient);
      diseaseMap.set(label, (diseaseMap.get(label) ?? 0) + 1);
    }
    return [...diseaseMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [snapshot.patients]);
  const executiveMaxUnitTotal = Math.max(1, ...executiveRows.map((row) => row.total));
  const executiveMaxDiseaseTotal = Math.max(1, ...executiveDiseaseRows.map((row) => row.count));
  const cardRoomRows = useMemo(() => {
    const unitNameById = new Map(snapshot.units.map((unit) => [unit.id, unit.name] as const));
    const sortedVisits = [...snapshot.visits]
      .filter((visit) => visit.visitDate === cardRoomDate && visit.photos.length > 0)
      .sort((a, b) => {
        const patientA = snapshot.patients.find((patient) => patient.id === a.patientId);
        const patientB = snapshot.patients.find((patient) => patient.id === b.patientId);
        const unitA = patientA?.assignedUnitName ?? unitNameById.get(a.unitId) ?? "";
        const unitB = patientB?.assignedUnitName ?? unitNameById.get(b.unitId) ?? "";
        return (
          unitA.localeCompare(unitB, "th") ||
          (patientA?.fullName ?? "").localeCompare(patientB?.fullName ?? "", "th") ||
          a.id - b.id
        );
      });

    const runningIndexByUnit = new Map<string, number>();
    return sortedVisits.flatMap((visit) => {
      const patient = snapshot.patients.find((item) => item.id === visit.patientId);
      if (!patient) return [];
      const unitName = patient.assignedUnitName || unitNameById.get(visit.unitId) || "-";
      const nextIndex = (runningIndexByUnit.get(unitName) ?? 0) + 1;
      runningIndexByUnit.set(unitName, nextIndex);
      return [{
        key: `${visit.id}-${patient.id}`,
        order: nextIndex,
        unitName,
        cid: patient.cid,
        hn: patient.hn,
        fullName: patient.fullName,
        photos: visit.photos,
      }];
    });
  }, [cardRoomDate, snapshot.patients, snapshot.units, snapshot.visits]);
  const dailyVisitRows = useMemo(() => {
    return snapshot.visits
      .filter((visit) => {
        if (visit.visitDate !== dailyVisitDate) return false;
        if (isHospitalBoard) return true;
        return visit.unitId === currentUser?.unitId;
      })
      .map((visit) => {
        const patient = snapshot.patients.find((item) => item.id === visit.patientId);
        const unit = snapshot.units.find((item) => item.id === visit.unitId);
        return {
          visit,
          patient,
          unitName: unit?.name ?? patient?.assignedUnitName ?? visit.unitId,
        };
      })
      .sort(
        (a, b) =>
          a.unitName.localeCompare(b.unitName, "th") ||
          (a.patient?.fullName ?? "").localeCompare(b.patient?.fullName ?? "", "th") ||
          a.visit.id - b.visit.id,
      );
  }, [
    currentUser?.unitId,
    dailyVisitDate,
    isHospitalBoard,
    snapshot.patients,
    snapshot.units,
    snapshot.visits,
  ]);
  const dailyVisitStats = useMemo(() => {
    const patientIds = new Set<number>();
    const visitorNames = new Set<string>();
    const unitNames = new Set<string>();
    let authenCount = 0;
    let photoCount = 0;
    let completeChecklistCount = 0;

    for (const { visit, patient, unitName } of dailyVisitRows) {
      patientIds.add(patient?.id ?? visit.patientId);
      visitorNames.add(visit.visitorName);
      unitNames.add(unitName);
      if (visit.authenCode?.trim()) authenCount += 1;
      photoCount += visit.photos.length;
      if (Object.values(visit.checklist).every(Boolean)) {
        completeChecklistCount += 1;
      }
    }

    return {
      authenCount,
      completeChecklistCount,
      patientCount: patientIds.size,
      photoCount,
      unitCount: unitNames.size,
      visitorCount: visitorNames.size,
      visitCount: dailyVisitRows.length,
    };
  }, [dailyVisitRows]);

  useEffect(() => {
    if (!selectedPatient?.hn) {
      return;
    }

    let cancelled = false;
    startTransition(() => {
      setSelectedPatientVisitHistoryLoading(true);
    });
    void requestJson(
      `/api/candidates/history?hn=${encodeURIComponent(selectedPatient.hn)}&limit=6`,
    )
      .then((rows) => {
        if (cancelled) return;
        setSelectedPatientVisitHistory(rows as CandidateVisitHistory[]);
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedPatientVisitHistory([]);
      })
      .finally(() => {
        if (cancelled) return;
        setSelectedPatientVisitHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPatient?.hn]);

  useEffect(() => {
    if (nurseTab !== "acp" || !selectedPatient?.hn) return;
    if (selectedPatient.birthday && selectedPatient.insuranceGroup) return;

    let cancelled = false;
    void requestJson(
      `/api/hosxp/patient?hn=${encodeURIComponent(selectedPatient.hn)}`,
    )
      .then((payload) => {
        if (cancelled) return;
        const hos = payload as {
          profile?: { birthday?: string };
          serviceHistory?: Array<{ pttype?: string }>;
        };
        const latestInsurance =
          hos.serviceHistory?.find((item) => item.pttype)?.pttype ?? "";
        setAcpDraft((draft) => ({
          ...draft,
          patientBirthDate:
            draft.patientBirthDate ||
            selectedPatient.birthday ||
            hos.profile?.birthday ||
            "",
          insurance:
            draft.insurance ||
            selectedPatient.insuranceGroup ||
            latestInsurance ||
            "",
        }));
      })
      .catch(() => {
        // If HOSXP is unavailable, keep the editable form values as-is.
      });

    return () => {
      cancelled = true;
    };
  }, [
    nurseTab,
    selectedPatient?.birthday,
    selectedPatient?.hn,
    selectedPatient?.insuranceGroup,
  ]);

  useEffect(() => {
    const savedToken = window.localStorage.getItem("palliative-auth-token") ?? "";
    if (!savedToken) {
      setTimeout(() => setAuthReady(true), 0);
      return;
    }
    void requestJson("/api/auth/me", undefined, savedToken)
      .then((payload) => {
        const user = (payload as { user?: AuthSessionUser }).user;
        if (!user) throw new Error("unauthorized");
        setAuthToken(savedToken);
        setSessionUser(user);
        setActiveUserId(user.id);
        setRenameDraft(user.displayName);
      })
      .catch(() => {
        window.localStorage.removeItem("palliative-auth-token");
        setAuthToken("");
        setSessionUser(null);
      })
        .finally(() => setAuthReady(true));
  }, []);

  const loadPendingRequests = () => {
    if (!sessionUser || !authToken || !canApproveUsers) return;
    setWorking(true);
    startTransition(() => {
      void requestJson(
        `/api/auth/pending?reviewerUserId=${encodeURIComponent(sessionUser.id)}`,
        undefined,
        authToken,
      )
        .then((rows) => setPendingRequests(rows as PendingUserRequest[]))
        .catch((error) =>
          setNotice(
            error instanceof Error ? error.message : "โหลดคำขอสมัครไม่สำเร็จ",
          ),
        )
        .finally(() => setWorking(false));
    });
  };

  useEffect(() => {
    if (canApproveUsers && authToken && sessionUser) {
      void requestJson(
        `/api/auth/pending?reviewerUserId=${encodeURIComponent(sessionUser.id)}`,
        undefined,
        authToken,
      )
        .then((rows) => setPendingRequests(rows as PendingUserRequest[]))
        .catch(() => setPendingRequests([]));
    }
  }, [canApproveUsers, authToken, sessionUser]);

  useEffect(() => {
    if (!manageableRoleOptions.length) return;
    if (manageableRoleOptions.some((option) => option.value === newUserDraft.role)) {
      return;
    }
    setNewUserDraft((prev) => ({
      ...prev,
      role: manageableRoleOptions[0].value,
    }));
  }, [manageableRoleOptions, newUserDraft.role]);

  const signIn = () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setNotice("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
      return;
    }
    setWorking(true);
    startTransition(() => {
      void requestJson(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            username: loginUsername,
            password: loginPassword,
          }),
        },
        authToken,
      )
        .then(async (payload) => {
          const result = payload as { token: string; user: AuthSessionUser };
          setAuthToken(result.token);
          setSessionUser(result.user);
          setActiveUserId(result.user.id);
          setRenameDraft(result.user.displayName);
          window.localStorage.setItem("palliative-auth-token", result.token);
          if (
            result.user.role === "hospital_admin" ||
            result.user.role === "hospital_case_manager"
          ) {
            loadPendingRequests();
          }
          await refresh();
          if (result.user.role === "unit_manager") {
            router.push("/unit-overview");
          }
          if (result.user.role === "unit_nurse") {
            router.push("/nurse");
          }
          if (result.user.role === "hospital_card_room") {
            router.push("/card-room");
          }
          if (result.user.role === "hospital_executive") {
            router.push("/executive");
          }
          setNotice("เข้าสู่ระบบสำเร็จ");
        })
        .catch((error) =>
          setNotice(error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ"),
        )
        .finally(() => setWorking(false));
    });
  };

  const signOut = () => {
    window.localStorage.removeItem("palliative-auth-token");
    setAuthToken("");
    setSessionUser(null);
    setActiveUserId("");
    setPendingRequests([]);
    setNotice("ออกจากระบบแล้ว");
  };

  const switchUserView = (userId: string) => {
    if (!sessionUser) return;
    if (!isAdmin && userId !== sessionUser.id) return;
    setActiveUserId(userId);
    const nextUser = snapshot.users.find((user) => user.id === userId);
    if (nextUser) {
      if (nextUser.role === "unit_nurse") {
        router.push("/nurse");
        setNurseTab("search");
        setPendingNursePatientId(null);
        setNurseSearch("");
        const nextPatients = snapshot.patients.filter(
          (patient) => patient.assignedUnitId === nextUser.unitId,
        );
        if (nextPatients[0]) {
          setSelectedPatientId(nextPatients[0].id);
          syncPatientDrafts(nextPatients[0]);
        }
        setRenameDraft(nextUser.displayName);
        return;
      }
      if (nextUser.role === "unit_manager") {
        router.push("/unit-overview");
        setRenameDraft(nextUser.displayName);
        const nextPatients = snapshot.patients.filter(
          (patient) => patient.assignedUnitId === nextUser.unitId,
        );
        if (nextPatients[0]) {
          setSelectedPatientId(nextPatients[0].id);
          syncPatientDrafts(nextPatients[0]);
        }
        return;
      }
      if (nextUser.role === "hospital_case_manager") {
        router.push("/case-manager");
        return;
      }
      if (nextUser.role === "hospital_card_room") {
        router.push("/card-room");
        return;
      }
      if (nextUser.role === "hospital_executive") {
        router.push("/executive");
        return;
      }
      setCandidateMode("all");
      setRenameDraft(nextUser.displayName);
      const nextPatients =
        nextUser.role === "hospital_admin"
          ? snapshot.patients
          : snapshot.patients.filter(
              (patient) => patient.assignedUnitId === nextUser.unitId,
            );
      if (nextPatients[0]) {
        setSelectedPatientId(nextPatients[0].id);
        syncPatientDrafts(nextPatients[0]);
      }
    }
  };

  const registerNewAccount = () => {
    if (
      !registerUsername.trim() ||
      !registerPassword.trim() ||
      !registerDisplayName.trim() ||
      !signupUnitId
    ) {
      setNotice("กรุณากรอกข้อมูลสมัครสมาชิกให้ครบ");
      return;
    }
    setWorking(true);
    startTransition(() => {
      void requestJson("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: registerUsername,
          displayName: registerDisplayName,
          password: registerPassword,
          role: registerRole,
          unitId: signupUnitId,
        }),
      })
        .then(() => {
          setRegisterPassword("");
          setNotice("ส่งคำขอสมัครแล้ว รอ Admin/Case Manager อนุมัติ");
        })
        .catch((error) =>
          setNotice(error instanceof Error ? error.message : "สมัครสมาชิกไม่สำเร็จ"),
        )
        .finally(() => setWorking(false));
    });
  };

  const reviewRequest = (targetUserId: string, approved: boolean) => {
    if (!sessionUser || !authToken) return;
    run(
      () =>
        requestJson(
          `/api/auth/pending/${targetUserId}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              reviewerUserId: sessionUser.id,
              approved,
            }),
          },
          authToken,
        ),
      approved ? "อนุมัติผู้ใช้แล้ว" : "ไม่อนุมัติผู้ใช้แล้ว",
      () => loadPendingRequests(),
    );
  };

  const createUserByAdminAction = () => {
    if (!sessionUser || !authToken || !canManageUsers) return;
    if (
      !newUserDraft.username.trim() ||
      !newUserDraft.displayName.trim() ||
      !newUserDraft.password.trim() ||
      !newUserDraft.unitId
    ) {
      setNotice("กรุณากรอกข้อมูลผู้ใช้ใหม่ให้ครบ");
      return;
    }
    if (!manageableRoleOptions.some((option) => option.value === newUserDraft.role)) {
      setNotice("สิทธิ์ของคุณไม่สามารถสร้าง role นี้ได้");
      return;
    }
    run(
      () =>
        requestJson(
          "/api/users",
          {
            method: "POST",
            body: JSON.stringify({
              actorUserId: sessionUser.id,
              ...newUserDraft,
            }),
          },
          authToken,
        ),
      "เพิ่มผู้ใช้งานแล้ว",
      () =>
        setNewUserDraft((prev) => ({
          ...prev,
          username: "",
          displayName: "",
          password: "",
        })),
    );
  };

  const quickToggleUserActive = (targetUserId: string, active: boolean) => {
    if (!sessionUser || !authToken || !canManageUsers) return;
    run(
      () =>
        requestJson(
          "/api/users",
          {
            method: "PATCH",
            body: JSON.stringify({
              actorUserId: sessionUser.id,
              targetUserId,
              active,
            }),
          },
          authToken,
        ),
      "อัปเดตสถานะผู้ใช้แล้ว",
    );
  };

  const startEditingUser = (user: AppSnapshot["users"][number]) => {
    setEditingUserId(user.id);
    setEditingUserDraft({
      username: user.username,
      displayName: user.displayName,
      password: "",
      role: user.role,
      unitId: user.unitId,
      active: user.active,
    });
  };

  const saveEditingUser = () => {
    if (!sessionUser || !authToken || !canManageUsers || !editingUserId) return;
    if (!editingUserDraft.username.trim() || !editingUserDraft.displayName.trim()) {
      setNotice("กรุณากรอก username และชื่อที่แสดง");
      return;
    }
    if (!manageableRoleOptions.some((option) => option.value === editingUserDraft.role)) {
      setNotice("สิทธิ์ของคุณไม่สามารถแก้เป็น role นี้ได้");
      return;
    }
    if (editingUserDraft.password && editingUserDraft.password.trim().length < 6) {
      setNotice("รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร");
      return;
    }
    run(
      () =>
        requestJson(
          "/api/users",
          {
            method: "PATCH",
            body: JSON.stringify({
              actorUserId: sessionUser.id,
              targetUserId: editingUserId,
              username: editingUserDraft.username,
              displayName: editingUserDraft.displayName,
              role: editingUserDraft.role,
              unitId: editingUserDraft.unitId,
              active: editingUserDraft.active,
              password: editingUserDraft.password.trim()
                ? editingUserDraft.password
                : undefined,
            }),
          },
          authToken,
        ),
      "แก้ไขข้อมูลผู้ใช้แล้ว",
      () => {
        setEditingUserId("");
        setEditingUserDraft((prev) => ({ ...prev, password: "" }));
      },
    );
  };

  const removeUser = (targetUserId: string) => {
    if (!sessionUser || !authToken || !canManageUsers) return;
    run(
      () =>
        requestJson(
          "/api/users",
          {
            method: "DELETE",
            body: JSON.stringify({
              actorUserId: sessionUser.id,
              targetUserId,
            }),
          },
          authToken,
        ),
      "ลบผู้ใช้แล้ว",
    );
  };

  const syncPatientDrafts = (
    patient?: PalliativePatient,
    currentSnapshot?: AppSnapshot,
  ) => {
    const sourceSnapshot = currentSnapshot ?? snapshot;
    if (!patient) return;
    setPatientDraft({
      phone: patient.phone ?? "",
      relativePhone: patient.relativePhone ?? "",
      lineId: patient.lineId ?? "",
      nextVisitAt: patient.nextVisitAt ?? "",
      notes: patient.notes ?? "",
      assignedUnitId: patient.assignedUnitId,
    });
    setVisitDraft({
      visitDate: patient.nextVisitAt ?? sourceSnapshot.currentDate,
      authenCode: "",
      symptoms: "",
      note: "",
    });
    setVisitChecklist(defaultVisitChecklistState);
    setVisitClinical(createDefaultClinicalAssessment());
    setAcpDraft(createAcpDraft(patient, sourceSnapshot.currentDate));
    setAcpSelectedVisitId(0);
    setAcpPatientSignature("");
    setAcpProxySignature("");
    setAcpWitness1Signature("");
    setAcpWitness2Signature("");
    setAcpStaffSignature("");
    setPatientCardFiles([null]);
    setFollowUpFiles([null]);
    setPatientCardFileInputKey((value) => value + 1);
    setFollowUpFileInputKey((value) => value + 1);
  };

  const selectPatient = (patient?: PalliativePatient) => {
    if (!patient) return;
    setSelectedPatientId(patient.id);
    syncPatientDrafts(patient);
  };

  const run = (
    task: () => Promise<unknown>,
    successMessage: string,
    afterSuccess?: () => void,
  ) => {
    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void task()
        .then(async () => {
          let nextSnapshot: AppSnapshot | null = null;
          let refreshError: unknown = null;
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              nextSnapshot = await refresh();
              refreshError = null;
              break;
            } catch (error) {
              refreshError = error;
            }
          }
          if (!nextSnapshot) {
            afterSuccess?.();
            setNotice(
              `${successMessage} แต่รีเฟรชข้อมูลล่าสุดไม่สำเร็จ กรุณากดรีเฟรชอีกครั้ง`,
            );
            if (refreshError instanceof Error) {
              console.error(refreshError);
            }
            return;
          }
          const nextUser = nextSnapshot.users.find(
            (user) => user.id === activeUserId,
          );
          if (nextUser) setRenameDraft(nextUser.displayName);
          const nextPatient =
            nextSnapshot.patients.find(
              (patient) => patient.id === selectedPatientId,
            ) ?? nextSnapshot.patients[0];
          syncPatientDrafts(nextPatient, nextSnapshot);
          afterSuccess?.();
          setNotice(successMessage);
        })
        .catch((error) =>
          setNotice(error instanceof Error ? error.message : "เกิดข้อผิดพลาด"),
        )
        .finally(() => setWorking(false));
    });
  };

  const renderClinicalAssessmentForm = (
    value: VisitClinicalAssessment,
    onChange: Dispatch<SetStateAction<VisitClinicalAssessment>>,
  ) => {
    const setField = <K extends keyof VisitClinicalAssessment>(
      key: K,
      nextValue: VisitClinicalAssessment[K],
    ) => onChange((draft) => ({ ...draft, [key]: nextValue }));
    const toggleField = (
      key: "distressingSymptoms" | "painManagement" | "morphineSideEffects",
      option: string,
      checked: boolean,
    ) =>
      onChange((draft) => ({
        ...draft,
        [key]: toggleListValue(draft[key] ?? [], option, checked),
      }));

    return (
      <div className="rounded-[1.4rem] border border-[#d9e5ec] bg-[#f7fbfd] p-4 sm:col-span-2">
        <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
          ข้อมูลประเมินการเยี่ยม
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <input
            value={value.temperatureCelsius ?? ""}
            onChange={(event) => setField("temperatureCelsius", event.target.value)}
            placeholder="อุณหภูมิ (°C)"
            inputMode="decimal"
            className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none"
          />
          <input
            value={value.pulsePerMinute ?? ""}
            onChange={(event) => setField("pulsePerMinute", event.target.value)}
            placeholder="ชีพจร ครั้ง/นาที"
            inputMode="numeric"
            className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none"
          />
          <input
            value={value.respiratoryRatePerMinute ?? ""}
            onChange={(event) =>
              setField("respiratoryRatePerMinute", event.target.value)
            }
            placeholder="อัตราหายใจ ครั้ง/นาที"
            inputMode="numeric"
            className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none"
          />
          <input
            value={value.bloodPressureMmHg ?? ""}
            onChange={(event) => setField("bloodPressureMmHg", event.target.value)}
            placeholder="ความดันโลหิต mmHg"
            className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none"
          />
          <select
            value={value.ppsScore ?? ""}
            onChange={(event) =>
              setField(
                "ppsScore",
                event.target.value ? Number(event.target.value) : undefined,
              )
            }
            className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none"
          >
            <option value="">PPS score 0-100</option>
            {ppsScoreOptions.map((score) => (
              <option key={score} value={score}>
                {score}
              </option>
            ))}
          </select>
          <select
            value={value.painScore ?? ""}
            onChange={(event) =>
              setField(
                "painScore",
                event.target.value ? Number(event.target.value) : undefined,
              )
            }
            className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none"
          >
            <option value="">ระดับปวด 0-10</option>
            {painScoreOptions.map((score) => (
              <option key={score} value={score}>
                {score}
              </option>
            ))}
          </select>
          <input
            value={value.painLocation ?? ""}
            onChange={(event) => setField("painLocation", event.target.value)}
            placeholder="ตำแหน่งที่ปวด (ถ้ามี)"
            className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none xl:col-span-2"
          />
          <textarea
            value={value.esasChiefComplaint ?? ""}
            onChange={(event) => setField("esasChiefComplaint", event.target.value)}
            placeholder="อาการสำคัญ (CC) / ESAS"
            rows={2}
            className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none sm:col-span-2 xl:col-span-4"
          />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl bg-white p-3">
            <div className="text-sm font-semibold text-[#123047]">อาการรบกวนอื่นๆ</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {distressingSymptomOptions.map((option) => (
                <label key={option} className="flex items-center gap-2 text-xs text-[#123047]">
                  <input
                    type="checkbox"
                    checked={value.distressingSymptoms.includes(option)}
                    onChange={(event) =>
                      toggleField("distressingSymptoms", option, event.target.checked)
                    }
                  />
                  {option}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4">
            <div className="rounded-2xl bg-white p-3">
              <div className="text-sm font-semibold text-[#123047]">การใช้ออกซิเจน</div>
              <div className="mt-3 flex flex-wrap gap-3">
                {oxygenUseOptions.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-xs text-[#123047]">
                    <input
                      type="radio"
                      name={`oxygen-${editingVisitId ?? "new"}`}
                      checked={value.oxygenUse === option}
                      onChange={() => setField("oxygenUse", option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
              {value.oxygenUse === "อื่นๆ" ? (
                <input
                  value={value.oxygenUseOther ?? ""}
                  onChange={(event) => setField("oxygenUseOther", event.target.value)}
                  placeholder="ระบุการใช้ออกซิเจน"
                  className="mt-3 w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
              ) : null}
            </div>
            <div className="rounded-2xl bg-white p-3">
              <div className="text-sm font-semibold text-[#123047]">การจัดการความปวด</div>
              <div className="mt-3 grid gap-2">
                {painManagementOptions.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-xs text-[#123047]">
                    <input
                      type="checkbox"
                      checked={value.painManagement.includes(option)}
                      onChange={(event) =>
                        toggleField("painManagement", option, event.target.checked)
                      }
                    />
                    {option}
                  </label>
                ))}
              </div>
              {value.painManagement.includes("อื่นๆ") ? (
                <input
                  value={value.painManagementOther ?? ""}
                  onChange={(event) =>
                    setField("painManagementOther", event.target.value)
                  }
                  placeholder="ระบุวิธีจัดการความปวดอื่นๆ"
                  className="mt-3 w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl bg-white p-3 xl:col-span-2">
            <div className="text-sm font-semibold text-[#123047]">
              ผลข้างเคียงจาก Morphine
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {morphineSideEffectOptions.map((option) => (
                <label key={option} className="flex items-center gap-2 text-xs text-[#123047]">
                  <input
                    type="checkbox"
                    checked={value.morphineSideEffects.includes(option)}
                    onChange={(event) =>
                      toggleField("morphineSideEffects", option, event.target.checked)
                    }
                  />
                  {option}
                </label>
              ))}
            </div>
            {value.morphineSideEffects.includes("อื่นๆระบุ") ? (
              <input
                value={value.morphineSideEffectsOther ?? ""}
                onChange={(event) =>
                  setField("morphineSideEffectsOther", event.target.value)
                }
                placeholder="ระบุผลข้างเคียงอื่นๆ"
                className="mt-3 w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  };
  const loadCandidates = () => {
    setWorking(true);
    startTransition(() => {
      void requestJson(
        `/api/candidates?visitDate=${candidateDate}&clinic=${candidateClinic}&mode=${candidateMode}&search=${encodeURIComponent(candidateSearch)}`,
      )
        .then((rows) => {
          const typedRows = rows as HosCandidate[];
          setCandidateRows(typedRows);
          setSelectedCandidateKey(
            typedRows[0] ? candidateRowKey(typedRows[0]) : "",
          );
          if (typedRows[0]) {
            setRegisterUnitId(typedRows[0].unitId);
            setRegisterDate(candidateDate);
          }
          setNotice(
            `ดึงรายชื่อ ${typedRows.length} รายการ (${candidateModeLabel(candidateMode)})`,
          );
        })
        .catch((error) =>
          setNotice(
            error instanceof Error ? error.message : "โหลดรายชื่อไม่สำเร็จ",
          ),
        )
        .finally(() => setWorking(false));
    });
  };

  const syncCandidates = () => {
    if (!currentUser) return;
    run(
      () =>
        requestJson("/api/registry/sync", {
          method: "POST",
          body: JSON.stringify({
            visitDate: candidateDate,
            clinic: candidateClinic,
            candidateMode,
            userId: currentUser.id,
            note: "ซิงก์เข้า registry จากหน้ารายชื่อเข้าเกณฑ์",
          }),
        }),
      "ซิงก์ candidate เข้าทะเบียนแล้ว",
      () => {
        setCandidateRows([]);
        setSelectedCandidateKey("");
      },
    );
  };

  const registerCandidate = () => {
    if (!selectedCandidate || !currentUser) {
      setNotice("กรุณาเลือกเคสก่อนลงทะเบียน");
      return;
    }
    if (!registerDate) {
      setNotice("กรุณาระบุวันเยี่ยมนัดแรก");
      return;
    }

    run(
      () =>
        requestJson("/api/registry/register", {
          method: "POST",
          body: JSON.stringify({
            candidate: selectedCandidate,
            nextVisitAt: registerDate,
            assignedUnitId: registerUnitId,
            note: registerNote,
            userId: currentUser.id,
          }),
        }),
      "ลงทะเบียนเคสเรียบร้อย",
      () => {
        setCandidateRows((rows) =>
          rows.filter((candidate) => candidate.hn !== selectedCandidate.hn),
        );
        setSelectedCandidateKey("");
      },
    );
  };

  const saveVisit = async () => {
    if (!selectedPatient || !currentUser) return;
    if (!visitDraft.visitDate) {
      setNotice("กรุณาระบุวันที่เยี่ยม");
      return;
    }
    if (!visitDraft.authenCode.trim()) {
      setNotice("กรุณากรอก Authen code");
      return;
    }
    if (!visitDraft.symptoms.trim()) {
      setNotice("กรุณาบันทึกอาการติดตาม");
      return;
    }
    if (!patientCardFiles.some((files) => files?.length)) {
      setNotice("กรุณาแนบรูปบัตรคู่กับคนไข้");
      return;
    }
    if (!followUpFiles.some((files) => files?.length)) {
      setNotice("กรุณาแนบรูปติดตามอาการคนไข้");
      return;
    }

    const cardPhotos = await fileGroupsToPayloadWithCaption(
      patientCardFiles,
      "patient-card",
    );
    const followUpPhotos = await fileGroupsToPayloadWithCaption(
      followUpFiles,
      "follow-up",
    );
    const photos = [...cardPhotos, ...followUpPhotos];
    const normalizedChecklist: VisitChecklist = {
      ...visitChecklist,
      symptomAssessment: true,
      photoCaptured: photos.length > 0,
    };

    run(
      () =>
        requestJson(`/api/registry/${selectedPatient.id}/visits`, {
          method: "POST",
          body: JSON.stringify({
            ...visitDraft,
            visitorUserId: currentUser.id,
            visitorName: currentUser.displayName,
            unitId: currentUser.unitId,
            checklist: normalizedChecklist,
            clinical: visitClinical,
            photos,
          }),
      }),
      "บันทึกข้อมูลการเยี่ยมแล้ว",
      () => {
        setVisitChecklist(defaultVisitChecklistState);
        setVisitClinical(createDefaultClinicalAssessment());
        setPatientCardFiles([null]);
        setFollowUpFiles([null]);
        setPatientCardFileInputKey((value) => value + 1);
        setFollowUpFileInputKey((value) => value + 1);
      },
    );
  };

  const saveComment = () => {
    if (!selectedPatient || !currentUser || !commentDraft.trim()) {
      setNotice("กรุณากรอกข้อความประสานงานก่อนส่ง");
      return;
    }

    run(
      () =>
        requestJson(`/api/registry/${selectedPatient.id}/comments`, {
          method: "POST",
          body: JSON.stringify({
            userId: currentUser.id,
            body: commentDraft,
            audience: commentAudience,
          }),
        }),
      "ส่งคอมเมนต์แล้ว",
      () => setCommentDraft(""),
    );
  };

  const startEditDailyVisit = (visit: PalliativeVisit) => {
    setEditingVisitId(visit.id);
    setDailyVisitDraft({
      visitDate: visit.visitDate,
      authenCode: visit.authenCode ?? "",
      symptoms: visit.symptoms,
      note: visit.note,
    });
    setDailyVisitChecklist(visit.checklist);
    setDailyVisitClinical(visit.clinical ?? createDefaultClinicalAssessment());
    setDailyPatientCardFiles([null]);
    setDailyFollowUpFiles([null]);
    setDailyPatientCardFileInputKey((value) => value + 1);
    setDailyFollowUpFileInputKey((value) => value + 1);
  };

  const saveDailyVisitEdit = async () => {
    if (!editingVisitId || !currentUser) return;
    if (!dailyVisitDraft.visitDate) {
      setNotice("กรุณาระบุวันที่เยี่ยม");
      return;
    }
    if (!dailyVisitDraft.authenCode.trim()) {
      setNotice("กรุณากรอก Authen code");
      return;
    }
    if (!dailyVisitDraft.symptoms.trim()) {
      setNotice("กรุณาบันทึกอาการติดตาม");
      return;
    }
    const visit = snapshot.visits.find((item) => item.id === editingVisitId);
    if (!visit) {
      setNotice("ไม่พบข้อมูลการเยี่ยมที่ต้องการแก้ไข");
      return;
    }
    const cardPhotos = await fileGroupsToPayloadWithCaption(
      dailyPatientCardFiles,
      "patient-card",
    );
    const followUpPhotos = await fileGroupsToPayloadWithCaption(
      dailyFollowUpFiles,
      "follow-up",
    );
    const photos = [...cardPhotos, ...followUpPhotos];
    const normalizedChecklist: VisitChecklist = {
      ...dailyVisitChecklist,
      photoCaptured: dailyVisitChecklist.photoCaptured || visit.photos.length + photos.length > 0,
    };

    run(
      () =>
        requestJson(`/api/visits/${editingVisitId}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...dailyVisitDraft,
            patientId: visit.patientId,
            checklist: normalizedChecklist,
            clinical: dailyVisitClinical,
            actorUserId: currentUser.id,
            photos,
          }),
      }),
      "บันทึกข้อมูลการเยี่ยมแล้ว",
      () => {
        setEditingVisitId(null);
        setDailyPatientCardFiles([null]);
        setDailyFollowUpFiles([null]);
        setDailyPatientCardFileInputKey((value) => value + 1);
        setDailyFollowUpFileInputKey((value) => value + 1);
      },
    );
  };

  const setAcpField = <K extends keyof AdvanceCarePlanForm>(
    key: K,
    value: AdvanceCarePlanForm[K],
  ) => setAcpDraft((draft) => ({ ...draft, [key]: value }));

  const toggleAcpList = (
    key: "importantValues" | "unacceptableStates",
    option: string,
    checked: boolean,
  ) =>
    setAcpDraft((draft) => ({
      ...draft,
      [key]: toggleListValue(draft[key] ?? [], option, checked),
    }));

  const saveAcpDocument = async () => {
    if (!currentUser || !selectedPatient || !selectedAcpVisit) {
      setNotice("กรุณาเลือกคนไข้และ visit ก่อนบันทึก ACP/LW");
      return;
    }
    if (!acpPatientSignature || !acpWitness1Signature) {
      setNotice("กรุณาให้ผู้ป่วยและพยานอย่างน้อย 1 คนเซ็นรับทราบ");
      return;
    }
    setWorking(true);
    setNotice(null);
    try {
      const snapshotJpegDataUrl = await makeAcpSnapshotJpeg({
        form: acpDraft,
        patient: selectedPatient,
        visit: selectedAcpVisit,
        signatures: {
          patient: acpPatientSignature,
          proxy: acpProxySignature,
          witness1: acpWitness1Signature,
          witness2: acpWitness2Signature,
          staff: acpStaffSignature,
        },
      });
      await requestJson(`/api/visits/${selectedAcpVisit.id}/acp`, {
        method: "POST",
        body: JSON.stringify({
          actorUserId: currentUser.id,
          patientId: selectedPatient.id,
          form: acpDraft,
          snapshotJpegDataUrl,
        }),
      });
      await refresh();
      setNotice("บันทึก ACP/LW เป็น PDF แล้ว");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "บันทึก ACP/LW ไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  };

  const loadImportFiles = () => {
    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void requestJson(`/api/stm/files?source=${importSource}&limit=300`)
        .then((payload) => {
          const files = (payload as { files?: ImportFileOption[] }).files ?? [];
          setImportFiles(files);
          setSelectedImportPath(files[0]?.fullPath ?? "");
          setNotice(`โหลดไฟล์จาก ${importSource} ได้ ${files.length} ไฟล์`);
        })
        .catch((error) =>
          setNotice(
            error instanceof Error
              ? error.message
              : "โหลดรายชื่อไฟล์จากโฟลเดอร์ไม่สำเร็จ",
          ),
        )
        .finally(() => setWorking(false));
    });
  };

  const readSelectedImportFile = () => {
    if (!currentUser) return;
    if (!selectedImportPath) {
      setNotice("กรุณาเลือกไฟล์ก่อนอ่านเข้าแบบฟอร์ม");
      return;
    }

    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void requestJson("/api/stm/files/read", {
        method: "POST",
        body: JSON.stringify({
          fullPath: selectedImportPath,
          userId: currentUser.id,
        }),
      })
        .then((payload) => {
          const response = payload as {
            fileName: string;
            inferredClaimMonth: string;
            totalRows: number;
            rows: Array<{
              hn: string;
              patientName: string;
              amount: number;
              unitId: string;
              claimMonth: string;
              note?: string;
            }>;
          };
          const lines = response.rows.map(
            (row) =>
              `${row.hn},${row.patientName},${row.amount},${row.unitId},${row.claimMonth},${(row.note ?? "").replaceAll(",", " ")}`,
          );
          setStmText(lines.join("\n"));
          setStmFileName(response.fileName);
          setNotice(
            `อ่านไฟล์ ${response.fileName} สำเร็จ ${response.totalRows} รายการ (เดือนเคลม ${response.inferredClaimMonth})`,
          );
        })
        .catch((error) =>
          setNotice(
            error instanceof Error
              ? error.message
              : "อ่านไฟล์จากโฟลเดอร์ไม่สำเร็จ",
          ),
        )
        .finally(() => setWorking(false));
    });
  };

  const importStm = () => {
    if (!currentUser) return;
    const rows = parseStmText(stmText, snapshot.currentDate.slice(0, 7));
    if (!rows.length) {
      setNotice("ยังไม่พบข้อมูล STM/REP ที่อ่านได้");
      return;
    }

    run(
      () =>
        requestJson("/api/stm/import", {
          method: "POST",
          body: JSON.stringify({
            fileName: stmFileName,
            importedByUserId: currentUser.id,
            defaultSplitPercent: stmPercent,
            rows,
          }),
        }),
      "นำเข้า STM/REP แล้ว",
    );
  };

  if (!authReady) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[720px] items-center justify-center px-4 py-10">
        <div className="w-full rounded-[1.8rem] border border-[#d6e3eb] bg-white p-8 text-center text-[#123047] shadow-[0_20px_50px_rgba(8,33,51,0.08)]">
          กำลังตรวจสอบสถานะการเข้าสู่ระบบ...
        </div>
      </main>
    );
  }

  if (!sessionUser) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1080px] flex-col gap-6 px-4 py-8 sm:px-6">
        <section className="rounded-[2rem] bg-[linear-gradient(135deg,#0c3148_0%,#104a61_52%,#d1ece8_100%)] p-7 text-white shadow-[0_30px_80px_rgba(6,29,43,0.22)]">
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">เข้าสู่ระบบ Palliative Home Visit</h1>
          <p className="mt-2 text-sm text-white/85">
            ผู้ใช้ใหม่สมัครสมาชิกได้ที่ฟอร์มด้านล่าง แล้วรอ Admin หรือ Case Manager อนุมัติ
          </p>
        </section>
        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[1.6rem] border border-[#d6e3eb] bg-white p-5 shadow-[0_20px_50px_rgba(8,33,51,0.08)]">
            <div className="text-lg font-semibold text-[#123047]">เข้าสู่ระบบ</div>
            <div className="mt-4 space-y-3">
              <input
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                placeholder="Username"
                className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="Password"
                className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
              <button
                type="button"
                onClick={signIn}
                className="w-full rounded-2xl bg-[#123047] px-5 py-3 text-sm font-medium text-white"
              >
                เข้าสู่ระบบ
              </button>
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-[#d6e3eb] bg-white p-5 shadow-[0_20px_50px_rgba(8,33,51,0.08)]">
            <div className="text-lg font-semibold text-[#123047]">สมัครสมาชิก</div>
            <div className="mt-4 space-y-3">
              <input
                value={registerUsername}
                onChange={(event) => setRegisterUsername(event.target.value)}
                placeholder="Username"
                className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
              <input
                value={registerDisplayName}
                onChange={(event) => setRegisterDisplayName(event.target.value)}
                placeholder="ชื่อที่แสดง"
                className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
              <input
                type="password"
                value={registerPassword}
                onChange={(event) => setRegisterPassword(event.target.value)}
                placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)"
                className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
              <select
                value={registerRole}
                onChange={(event) => setRegisterRole(event.target.value as UserRole)}
                className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              >
                {publicRegisterRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={signupUnitId}
                onChange={(event) => setSignupUnitId(event.target.value)}
                className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              >
                {initialSnapshot.units
                  .filter((unit) => unit.kind !== "hospital")
                  .map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={registerNewAccount}
                className="w-full rounded-2xl bg-[#0f766e] px-5 py-3 text-sm font-medium text-white"
              >
                ส่งคำขอสมัคร
              </button>
            </div>
          </div>
        </section>
        {notice ? (
          <div className="rounded-2xl border border-[#d4e6ef] bg-[#f7fbfd] px-5 py-3 text-sm text-[#5f7486]">
            {notice}
          </div>
        ) : null}
      </main>
    );
  }

  if (canViewCardRoom && pathname === "/card-room") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[2.4rem] bg-[linear-gradient(135deg,#1e3a46_0%,#2d6172_52%,#d8ecef_100%)] p-6 text-white shadow-[0_30px_80px_rgba(6,29,43,0.22)] sm:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
            <div>
              <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/85">
                Card Room
              </div>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
                หน้าห้องบัตร
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-white/85 sm:text-lg">
                เลือกวันที่เพื่อดูรายการคนไข้ที่มีรูปแนบสำหรับเปิดบัตรหรือปิดสิทธิ์
              </p>
            </div>
            <div className="rounded-[1.8rem] border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.24em] text-white/70">
                ผู้ใช้งานปัจจุบัน
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  value={`${sessionUser.displayName} - ${formatRoleLabel(sessionUser.role)}`}
                  readOnly
                  className="w-full rounded-2xl border border-white/20 bg-[#f7fbff] px-4 py-3 text-sm text-[#123047] outline-none"
                />
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white"
                >
                  รีเฟรช
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white"
                >
                  ออกจากระบบ
                </button>
              </div>
              {pageNavigationActions.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {pageNavigationActions.map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="rounded-full border border-white/20 bg-white/15 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/25"
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <Box
          title="รายการคนไข้สำหรับห้องบัตร"
          note="แสดงเฉพาะวันที่ที่เลือก โดยแยกตาม รพ.สต. พร้อมเลขบัตรประชาชน HN ชื่อคนไข้ และรูปที่แนบมา"
        >
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-[#123047]" htmlFor="card-room-date">
                วันที่
              </label>
              <input
                id="card-room-date"
                type="date"
                value={cardRoomDate}
                onChange={(event) => setCardRoomDate(event.target.value)}
                className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
            </div>
            <div className="rounded-full border border-[#d9e5ec] bg-[#f7fbfd] px-4 py-2 text-sm text-[#5f7486]">
              พบ {cardRoomRows.length} รายการ
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.5rem] border border-[#e2edf4]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f5fafc] text-xs uppercase tracking-[0.2em] text-[#6f8190]">
                  <tr>
                    <th className="px-4 py-4">รพ.สต.</th>
                    <th className="px-4 py-4">ลำดับ</th>
                    <th className="px-4 py-4">เลขบัตร</th>
                    <th className="px-4 py-4">HN</th>
                    <th className="px-4 py-4">ชื่อคนไข้</th>
                    <th className="px-4 py-4">รูปที่แนบมา</th>
                  </tr>
                </thead>
                <tbody>
                  {cardRoomRows.length ? (
                    cardRoomRows.map((row) => (
                      <tr key={row.key} className="border-t border-[#edf3f7] align-top">
                        <td className="px-4 py-4 text-[#123047]">{row.unitName}</td>
                        <td className="px-4 py-4 text-[#123047]">{row.order}</td>
                        <td className="px-4 py-4 text-[#123047]">{row.cid}</td>
                        <td className="px-4 py-4 text-[#123047]">{row.hn}</td>
                        <td className="px-4 py-4 font-medium text-[#123047]">{row.fullName}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-3">
                            {row.photos.map((photo) => (
                              <a
                                key={photo.id}
                                href={photo.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block"
                              >
                                <Image
                                  src={photo.url}
                                  alt={photo.fileName}
                                  width={120}
                                  height={120}
                                  className="h-24 w-24 rounded-2xl border border-[#d9e5ec] object-cover"
                                />
                              </a>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-[#6f8190]">
                        ไม่พบรายการคนไข้ที่มีรูปแนบในวันที่เลือก
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Box>
      </main>
    );
  }

  if (canViewDailyVisits && pathname === "/daily-visits") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[2.4rem] bg-[linear-gradient(135deg,#123047_0%,#2f6f73_55%,#d9eee8_100%)] p-6 text-white shadow-[0_30px_80px_rgba(6,29,43,0.22)] sm:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
            <div>
              <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/85">
                รายงานพยาบาล
              </div>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                รายงานการเยี่ยมรายวัน
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-white/85 sm:text-lg">
                ตรวจจำนวนการเยี่ยมในแต่ละวัน รายชื่อคนไข้ ผู้บันทึก Authen code รูปภาพ และความครบถ้วนของ checklist
              </p>
            </div>
            <div className="rounded-[1.8rem] border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.24em] text-white/70">
                ผู้ใช้งานปัจจุบัน
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  value={`${sessionUser.displayName} - ${formatRoleLabel(sessionUser.role)}`}
                  readOnly
                  className="w-full rounded-2xl border border-white/20 bg-[#f7fbff] px-4 py-3 text-sm text-[#123047] outline-none"
                />
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white"
                >
                  รีเฟรช
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white"
                >
                  ออกจากระบบ
                </button>
              </div>
              {pageNavigationActions.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {pageNavigationActions.map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="rounded-full border border-white/20 bg-white/15 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/25"
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <SavedDataNotice
          notice={notice}
          canViewDailyVisits={canViewDailyVisits}
          canViewRegistry={isHospitalBoard}
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["เยี่ยมทั้งหมด", dailyVisitStats.visitCount],
            ["คนไข้ไม่ซ้ำ", dailyVisitStats.patientCount],
            ["มี Authen", dailyVisitStats.authenCount],
            ["Checklist ครบ", dailyVisitStats.completeChecklistCount],
            ["รูปภาพ", dailyVisitStats.photoCount],
            [isHospitalBoard ? "หน่วยที่ส่ง" : "ผู้บันทึก", isHospitalBoard ? dailyVisitStats.unitCount : dailyVisitStats.visitorCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[1.2rem] border border-[#d9e5ec] bg-white px-4 py-3 shadow-sm">
              <div className="text-xs text-[#6f8190]">{label}</div>
              <div className="mt-1 text-2xl font-semibold text-[#123047]">{value}</div>
            </div>
          ))}
        </div>

        <Box
          title="รายการเยี่ยมในวันที่เลือก"
          note={isHospitalBoard ? "โรงพยาบาลดูได้ทุกหน่วย" : "รพ.สต./PCU ดูและแก้ไขเฉพาะข้อมูลของหน่วยตัวเอง"}
        >
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-[#123047]" htmlFor="daily-visit-date">
                วันที่
              </label>
              <input
                id="daily-visit-date"
                type="date"
                value={dailyVisitDate}
                onChange={(event) => {
                  setDailyVisitDate(event.target.value);
                  setEditingVisitId(null);
                }}
                className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
            </div>
            <div className="rounded-full border border-[#d9e5ec] bg-[#f7fbfd] px-4 py-2 text-sm text-[#5f7486]">
              พบ {dailyVisitRows.length} รายการ
            </div>
          </div>

          <div className="space-y-4">
            {dailyVisitRows.length ? (
              dailyVisitRows.map(({ visit, patient, unitName }) => {
                const isEditing = editingVisitId === visit.id;
                const missingChecklistLabels = Object.entries(visitChecklistLabels)
                  .filter(([key]) => !visit.checklist[key as keyof VisitChecklist])
                  .map(([, label]) => label);
                return (
                  <div key={visit.id} className="rounded-[1.5rem] border border-[#e2edf4] bg-[#fbfdff] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-[#6f8190]">{unitName}</div>
                        <h3 className="mt-1 text-lg font-semibold text-[#123047]">
                          {patient?.fullName ?? `Visit #${visit.id}`}
                        </h3>
                        <div className="mt-1 text-sm text-[#5f7486]">
                          วันที่ {formatDate(visit.visitDate)} · HN {patient?.hn ?? "-"} · เลขบัตร {patient?.cid ?? "-"} · ผู้บันทึก {visit.visitorName}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => (isEditing ? setEditingVisitId(null) : startEditDailyVisit(visit))}
                        className="rounded-2xl bg-[#123047] px-4 py-2 text-sm font-medium text-white"
                      >
                        {isEditing ? "ยกเลิกแก้ไข" : "แก้ไขข้อมูล"}
                      </button>
                    </div>

                    {isEditing ? (
                      <div className="mt-4 grid gap-4 rounded-[1.2rem] border border-[#d9e5ec] bg-white p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="grid gap-1 text-sm text-[#123047]">
                            วันที่เยี่ยม
                            <input
                              type="date"
                              value={dailyVisitDraft.visitDate}
                              onChange={(event) =>
                                setDailyVisitDraft((draft) => ({ ...draft, visitDate: event.target.value }))
                              }
                              className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                            />
                          </label>
                          <label className="grid gap-1 text-sm text-[#123047]">
                            Authen code
                            <input
                              value={dailyVisitDraft.authenCode}
                              onChange={(event) =>
                                setDailyVisitDraft((draft) => ({ ...draft, authenCode: event.target.value }))
                              }
                              className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                            />
                          </label>
                        </div>
                        <label className="grid gap-1 text-sm text-[#123047]">
                          อาการติดตาม
                          <textarea
                            value={dailyVisitDraft.symptoms}
                            onChange={(event) =>
                              setDailyVisitDraft((draft) => ({ ...draft, symptoms: event.target.value }))
                            }
                            rows={3}
                            className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                          />
                        </label>
                        <label className="grid gap-1 text-sm text-[#123047]">
                          หมายเหตุ
                          <textarea
                            value={dailyVisitDraft.note}
                            onChange={(event) =>
                              setDailyVisitDraft((draft) => ({ ...draft, note: event.target.value }))
                            }
                            rows={2}
                            className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                          />
                        </label>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          {Object.entries(visitChecklistLabels).map(([key, label]) => (
                            <label key={key} className="flex items-center gap-2 rounded-2xl border border-[#e3edf3] bg-[#f7fbfd] px-3 py-2 text-xs text-[#123047]">
                              <input
                                type="checkbox"
                                checked={Boolean(dailyVisitChecklist[key as keyof VisitChecklist])}
                                onChange={(event) =>
                                  setDailyVisitChecklist((checklist) => ({
                                    ...checklist,
                                    [key]: event.target.checked,
                                  }))
                                }
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="rounded-2xl border border-dashed border-[#c9d9e3] bg-[#f7fbfd] px-4 py-3 text-sm">
                            <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                              เพิ่ม{getPhotoCategoryLabel("patient-card")}
                            </div>
                            <div className="mt-3 space-y-3">
                              {dailyPatientCardFiles.map((files, index) => (
                                <div key={`${dailyPatientCardFileInputKey}-${index}`}>
                                  <div className="mb-1 text-xs text-[#5f7486]">
                                    รูปที่ {index + 1}
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <label className="rounded-xl border border-[#d9e5ec] bg-white px-3 py-2 text-xs text-[#123047]">
                                      เลือกรูปจากเครื่อง
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(event) =>
                                          setDailyPatientCardFiles((prev) =>
                                            prev.map((item, itemIndex) =>
                                              itemIndex === index ? event.target.files : item,
                                            ),
                                          )
                                        }
                                        className="mt-2 w-full text-sm outline-none"
                                      />
                                    </label>
                                    <label className="rounded-xl border border-[#d9e5ec] bg-white px-3 py-2 text-xs text-[#123047]">
                                      ถ่ายรูปใหม่
                                      <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={(event) =>
                                          setDailyPatientCardFiles((prev) =>
                                            prev.map((item, itemIndex) =>
                                              itemIndex === index ? event.target.files : item,
                                            ),
                                          )
                                        }
                                        className="mt-2 w-full text-sm outline-none"
                                      />
                                    </label>
                                  </div>
                                  <div className="mt-1 text-xs text-[#6f8190]">
                                    {files?.length ? "เลือกรูปแล้ว" : "ยังไม่ได้เลือกรูป"}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => setDailyPatientCardFiles((prev) => [...prev, null])}
                              className="mt-3 rounded-xl border border-[#12304733] bg-white px-3 py-2 text-xs font-medium text-[#123047]"
                            >
                              เพิ่มรูป
                            </button>
                          </div>
                          <div className="rounded-2xl border border-dashed border-[#c9d9e3] bg-[#f7fbfd] px-4 py-3 text-sm">
                            <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                              เพิ่ม{getPhotoCategoryLabel("follow-up")}
                            </div>
                            <div className="mt-3 space-y-3">
                              {dailyFollowUpFiles.map((files, index) => (
                                <div key={`${dailyFollowUpFileInputKey}-${index}`}>
                                  <div className="mb-1 text-xs text-[#5f7486]">
                                    รูปที่ {index + 1}
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <label className="rounded-xl border border-[#d9e5ec] bg-white px-3 py-2 text-xs text-[#123047]">
                                      เลือกรูปจากเครื่อง
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(event) =>
                                          setDailyFollowUpFiles((prev) =>
                                            prev.map((item, itemIndex) =>
                                              itemIndex === index ? event.target.files : item,
                                            ),
                                          )
                                        }
                                        className="mt-2 w-full text-sm outline-none"
                                      />
                                    </label>
                                    <label className="rounded-xl border border-[#d9e5ec] bg-white px-3 py-2 text-xs text-[#123047]">
                                      ถ่ายรูปใหม่
                                      <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={(event) =>
                                          setDailyFollowUpFiles((prev) =>
                                            prev.map((item, itemIndex) =>
                                              itemIndex === index ? event.target.files : item,
                                            ),
                                          )
                                        }
                                        className="mt-2 w-full text-sm outline-none"
                                      />
                                    </label>
                                  </div>
                                  <div className="mt-1 text-xs text-[#6f8190]">
                                    {files?.length ? "เลือกรูปแล้ว" : "ยังไม่ได้เลือกรูป"}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => setDailyFollowUpFiles((prev) => [...prev, null])}
                              className="mt-3 rounded-xl border border-[#12304733] bg-white px-3 py-2 text-xs font-medium text-[#123047]"
                            >
                              เพิ่มรูป
                            </button>
                          </div>
                        </div>
                        {renderClinicalAssessmentForm(
                          dailyVisitClinical,
                          setDailyVisitClinical,
                        )}
                        <button
                          type="button"
                          onClick={saveDailyVisitEdit}
                          className="w-full rounded-2xl bg-[#0f766e] px-5 py-3 text-sm font-medium text-white sm:w-fit"
                        >
                          บันทึกการแก้ไข
                        </button>
                        <SavedDataNotice
                          notice={notice}
                          canViewDailyVisits={canViewDailyVisits}
                          canViewRegistry={isHospitalBoard}
                        />
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3 md:grid-cols-[0.7fr_1fr_1fr]">
                        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-[#123047]">
                          <div className="text-xs text-[#6f8190]">Authen</div>
                          {visit.authenCode || "-"}
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-[#123047]">
                          <div className="text-xs text-[#6f8190]">อาการ</div>
                          {visit.symptoms || "-"}
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-[#123047]">
                          <div className="text-xs text-[#6f8190]">หมายเหตุ</div>
                          {visit.note || "-"}
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-[#123047]">
                          <div className="text-xs text-[#6f8190]">รูปภาพ</div>
                          {visit.photos.length} รูป
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-[#123047] md:col-span-2">
                          <div className="text-xs text-[#6f8190]">Checklist</div>
                          {missingChecklistLabels.length
                            ? `ยังขาด ${missingChecklistLabels.join(", ")}`
                            : "ครบทุกข้อ"}
                        </div>
                        <div className="md:col-span-3">
                          <VisitClinicalSummary clinical={visit.clinical} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-[#d9e5ec] px-4 py-10 text-center text-sm text-[#6f8190]">
                ยังไม่มีข้อมูลที่ส่งในวันที่เลือก
              </div>
            )}
          </div>
        </Box>
      </main>
    );
  }

  if (canViewExecutive && pathname === "/executive") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[2.4rem] bg-[linear-gradient(135deg,#244237_0%,#5d7f61_52%,#f4ead6_100%)] p-6 text-white shadow-[0_30px_80px_rgba(39,58,47,0.2)] sm:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
            <div>
              <div className="inline-flex rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/85">
                Executive Dashboard
              </div>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold sm:text-5xl">
                ภาพรวม Palliative รายหน่วย
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-white/85 sm:text-lg">
                เปรียบเทียบความคืบหน้า เคสคงเหลือ โรคหลัก และผลงานเยี่ยมบ้านของแต่ละ รพ.สต.
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.24em] text-white/70">
                ผู้ใช้งานปัจจุบัน
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  value={`${sessionUser.displayName} - ${formatRoleLabel(sessionUser.role)}`}
                  readOnly
                  className="w-full rounded-xl border border-white/20 bg-[#f7fbff] px-4 py-3 text-sm text-[#123047] outline-none"
                />
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white"
                >
                  รีเฟรช
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white"
                >
                  ออกจากระบบ
                </button>
              </div>
              {pageNavigationActions.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {pageNavigationActions.map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="rounded-full border border-white/20 bg-white/15 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/25"
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["เคสทั้งหมด", executiveTotals.total],
            ["ทำครบแล้ว", executiveTotals.completed],
            ["คงเหลือ", executiveTotals.remaining],
            ["พร้อมเบิก", executiveTotals.readyForClaim],
            ["เยี่ยมวันนี้", executiveTotals.visitsToday],
            ["เยี่ยมเดือนนี้", executiveTotals.visitsMonth],
            ["ปีงบประมาณ", executiveTotals.visitsFiscalYear],
            ["เลยกำหนด", executiveTotals.overdue],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-[#dce7de] bg-white p-5 shadow-[0_16px_40px_rgba(39,58,47,0.08)]"
            >
              <div className="text-xs uppercase tracking-[0.2em] text-[#697b6e]">{label}</div>
              <div className="mt-3 text-3xl font-semibold text-[#20382f]">{value}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-lg border border-[#dce7de] bg-white p-5 shadow-[0_16px_40px_rgba(39,58,47,0.08)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#20382f]">ความคืบหน้าราย รพ.สต.</h2>
                <p className="mt-1 text-sm text-[#697b6e]">เทียบจำนวนเคสทั้งหมด ทำแล้ว และคงเหลือของแต่ละหน่วย</p>
              </div>
              <div className="text-sm font-medium text-[#20382f]">รวมสำเร็จ {executiveTotals.progress}%</div>
            </div>
            <div className="mt-6 space-y-4">
              {executiveRows.map((row) => (
                <div key={row.unitId} className="grid gap-3 lg:grid-cols-[220px_1fr_150px] lg:items-center">
                  <div>
                    <div className="font-semibold text-[#20382f]">{row.unitName}</div>
                    <div className="text-xs text-[#697b6e]">
                      {row.completed} ทำแล้ว · {row.remaining} คงเหลือ
                    </div>
                  </div>
                  <div>
                    <div className="h-4 overflow-hidden rounded-full bg-[#e8efe9]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#3f7d5a,#d7a642)]"
                        style={{ width: `${Math.max(4, row.progress)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex h-8 overflow-hidden rounded-md bg-[#f4f7f2]">
                      <div
                        className="bg-[#5f8f6f]"
                        style={{ width: `${(row.completed / executiveMaxUnitTotal) * 100}%` }}
                        title={`ทำแล้ว ${row.completed}`}
                      />
                      <div
                        className="bg-[#d7a642]"
                        style={{ width: `${(row.remaining / executiveMaxUnitTotal) * 100}%` }}
                        title={`คงเหลือ ${row.remaining}`}
                      />
                    </div>
                  </div>
                  <div className="rounded-md bg-[#f7faf6] px-3 py-2 text-right">
                    <div className="text-lg font-semibold text-[#20382f]">{row.progress}%</div>
                    <div className="text-xs text-[#697b6e]">พร้อมเบิก {row.readyForClaim}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#dce7de] bg-white p-5 shadow-[0_16px_40px_rgba(39,58,47,0.08)]">
            <h2 className="text-xl font-semibold text-[#20382f]">กลุ่มโรคที่รับบริการ</h2>
            <p className="mt-1 text-sm text-[#697b6e]">เรียงตามจำนวนเคสที่กำลังดูแล</p>
            <div className="mt-5 space-y-4">
              {executiveDiseaseRows.map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-[#20382f]">{row.label}</span>
                    <span className="text-[#697b6e]">{row.count}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[#edf2ed]">
                    <div
                      className="h-full rounded-full bg-[#496f5a]"
                      style={{ width: `${(row.count / executiveMaxDiseaseTotal) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-[#dce7de] bg-white p-5 shadow-[0_16px_40px_rgba(39,58,47,0.08)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#20382f]">หน้าโรคแยกราย รพ.สต.</h2>
              <p className="mt-1 text-sm text-[#697b6e]">
                ดูภาระโรคของแต่ละหน่วยแบบแยกชัดเจน เพื่อเห็นว่าหน่วยไหนดูแลโรคกลุ่มใดมากที่สุด
              </p>
            </div>
            <div className="rounded-full bg-[#eef4eb] px-4 py-2 text-sm font-medium text-[#496f5a]">
              รวม {executiveDiseaseRows.length} กลุ่มโรค
            </div>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {executiveRows.map((unitRow) => {
              const unitMaxDiseaseTotal = Math.max(1, ...unitRow.diseaseRows.map((row) => row.count));
              return (
                <div
                  key={unitRow.unitId}
                  className="rounded-[1.4rem] border border-[#e2eadf] bg-[linear-gradient(180deg,#fbfdf8_0%,#f4f8f0_100%)] p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-[#20382f]">{unitRow.unitName}</h3>
                      <p className="mt-1 text-xs text-[#697b6e]">
                        {unitRow.total} เคส · โรคหลัก {unitRow.topDiseaseLabel}
                        {unitRow.topDiseaseCount ? ` ${unitRow.topDiseaseCount} เคส` : ""}
                      </p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#496f5a] shadow-sm">
                      คืบหน้า {unitRow.progress}%
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {unitRow.diseaseRows.length ? (
                      unitRow.diseaseRows.map((row) => (
                        <div key={`${unitRow.unitId}-${row.label}`}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium text-[#20382f]">{row.label}</span>
                            <span className="text-[#697b6e]">{row.count} เคส</span>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full bg-white">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#496f5a,#d7a642)]"
                              style={{ width: `${(row.count / unitMaxDiseaseTotal) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[#d6e2d6] bg-white/70 px-4 py-5 text-sm text-[#697b6e]">
                        ยังไม่มีเคสที่กำลังดูแลในหน่วยนี้
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-[#dce7de] bg-white p-5 shadow-[0_16px_40px_rgba(39,58,47,0.08)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#20382f]">ตารางเปรียบเทียบผลงานรายหน่วย</h2>
              <p className="mt-1 text-sm text-[#697b6e]">ยอดวันนี้ เดือนนี้ และปีงบประมาณ ใช้อ่านความเร็วของงานแต่ละ รพ.สต.</p>
            </div>
            <div className="text-sm text-[#697b6e]">ข้อมูล ณ {formatDate(snapshot.currentDate)}</div>
          </div>
          <div className="mt-5 overflow-hidden rounded-lg border border-[#e1e9e1]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f4f7f2] text-xs uppercase tracking-[0.16em] text-[#697b6e]">
                  <tr>
                    <th className="px-4 py-3">รพ.สต.</th>
                    <th className="px-4 py-3">ทั้งหมด</th>
                    <th className="px-4 py-3">ทำแล้ว</th>
                    <th className="px-4 py-3">คงเหลือ</th>
                    <th className="px-4 py-3">วันนี้</th>
                    <th className="px-4 py-3">เดือนนี้</th>
                    <th className="px-4 py-3">ปีงบ</th>
                    <th className="px-4 py-3">โรคหลัก</th>
                  </tr>
                </thead>
                <tbody>
                  {executiveRows.map((row) => (
                    <tr key={row.unitId} className="border-t border-[#edf2ed]">
                      <td className="px-4 py-4 font-semibold text-[#20382f]">{row.unitName}</td>
                      <td className="px-4 py-4 text-[#20382f]">{row.total}</td>
                      <td className="px-4 py-4 text-[#20382f]">{row.completed}</td>
                      <td className="px-4 py-4 text-[#20382f]">{row.remaining}</td>
                      <td className="px-4 py-4 text-[#20382f]">{row.visitsToday}</td>
                      <td className="px-4 py-4 text-[#20382f]">{row.visitsMonth}</td>
                      <td className="px-4 py-4 text-[#20382f]">{row.visitsFiscalYear}</td>
                      <td className="px-4 py-4 text-[#20382f]">
                        {row.topDiseaseLabel}
                        {row.topDiseaseCount ? ` (${row.topDiseaseCount})` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="rounded-[2.4rem] bg-[linear-gradient(135deg,#0c3148_0%,#104a61_46%,#cfe9e8_100%)] p-6 text-white shadow-[0_30px_80px_rgba(6,29,43,0.22)] sm:p-8">
        {isUnitNurse ? (
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
            <div>
              <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/85">
                Nurse Workspace
              </div>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
                งานพยาบาลหน่วย
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-white/85 sm:text-lg">
                ค้นหาคนไข้ของหน่วยตัวเอง ยืนยันการรับงาน บันทึกเยี่ยมบ้าน และดูผลลัพธ์เฉพาะสถานบริการของคุณ
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[1.4rem] border border-white/20 bg-white/10 p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/70">
                    คนไข้คงเหลือ
                  </div>
                  <div className="mt-3 text-3xl font-semibold">
                    {currentUnitSummary?.activePatients ?? visiblePatients.length}
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-white/20 bg-white/10 p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/70">
                    ถึงกำหนดวันนี้
                  </div>
                  <div className="mt-3 text-3xl font-semibold">
                    {currentUnitVisitTodayCount}
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-white/20 bg-white/10 p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/70">
                    เยี่ยมเดือนนี้
                  </div>
                  <div className="mt-3 text-3xl font-semibold">
                    {currentUnitSummary?.visitsThisMonth ?? 0}
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-white/20 bg-white/10 p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/70">
                    ปีงบประมาณ
                  </div>
                  <div className="mt-3 text-3xl font-semibold">
                    {fiscalYearVisitCount}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-[1.8rem] border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.24em] text-white/70">
                ผู้ใช้งานปัจจุบัน
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                {isAdmin ? (
                  <select
                    value={activeUserId}
                    onChange={(event) => switchUserView(event.target.value)}
                    className="w-full rounded-2xl border border-white/20 bg-[#f7fbff] px-4 py-3 text-sm text-[#123047] outline-none"
                  >
                    {selectableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName} - {formatRoleLabel(user.role)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={`${sessionUser.displayName} - ${formatRoleLabel(sessionUser.role)}`}
                    readOnly
                    className="w-full rounded-2xl border border-white/20 bg-[#f7fbff] px-4 py-3 text-sm text-[#123047] outline-none"
                  />
                )}
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white"
                >
                  รีเฟรช
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white"
                >
                  ออกจากระบบ
                </button>
              </div>
              <div className="mt-4 rounded-2xl bg-[#0b2c3f]/45 p-4 text-sm text-white/82">
                <div className="font-medium text-white">
                  {currentUser?.displayName}
                </div>
                <div className="mt-1">
                  {currentUser ? formatRoleLabel(currentUser.role) : "-"}
                </div>
                <div className="mt-1 text-white/70">
                  หน่วย{" "}
                  {snapshot.units.find((unit) => unit.id === currentUser?.unitId)
                    ?.name ?? "-"}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
            <div>
              <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/85">
                Palliative Home Visit Command Center
              </div>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
                ระบบติดตามการเยี่ยมบ้าน Palliative ตามเกณฑ์ สปสช.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-white/85 sm:text-lg">
                เชื่อมงานโรงพยาบาล, รพ.สต. และ PCU ตั้งแต่คัดเลือกเคสจาก HOSXP
                ไปจนถึงติดตามเยี่ยมบ้านและสรุปผลการดูแลแต่ละหน่วย
              </p>
            </div>
            <div className="rounded-[1.8rem] border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.24em] text-white/70">
                ผู้ใช้งานปัจจุบัน
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                {isAdmin ? (
                  <select
                    value={activeUserId}
                    onChange={(event) => switchUserView(event.target.value)}
                    className="w-full rounded-2xl border border-white/20 bg-[#f7fbff] px-4 py-3 text-sm text-[#123047] outline-none"
                  >
                    {selectableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName} - {formatRoleLabel(user.role)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={`${sessionUser.displayName} - ${formatRoleLabel(sessionUser.role)}`}
                    readOnly
                    className="w-full rounded-2xl border border-white/20 bg-[#f7fbff] px-4 py-3 text-sm text-[#123047] outline-none"
                  />
                )}
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white"
                >
                  รีเฟรช
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white"
                >
                  ออกจากระบบ
                </button>
              </div>
              <div className="mt-4 rounded-2xl bg-[#0b2c3f]/45 p-4 text-sm text-white/82">
                <div className="font-medium text-white">
                  {currentUser?.displayName}
                </div>
                <div className="mt-1">
                  {currentUser ? formatRoleLabel(currentUser.role) : "-"}
                </div>
                <div className="mt-1 text-white/70">
                  หน่วย{" "}
                  {snapshot.units.find((unit) => unit.id === currentUser?.unitId)
                    ?.name ?? "-"}
                </div>
                {isAdmin ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {currentUserActions.map((action) => (
                      <button
                        key={action.href}
                        type="button"
                        onClick={() => router.push(action.href)}
                        className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-xs text-white"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : currentUserActions.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {currentUserActions.map((action) => (
                      <button
                        key={action.href}
                        type="button"
                        onClick={() => router.push(action.href)}
                        className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-xs text-white"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </header>
      <SavedDataNotice
        notice={notice}
        canViewDailyVisits={canViewDailyVisits}
        canViewRegistry={isHospitalBoard}
      />
      {isUnitNurse ? (
        <section className="rounded-[1.8rem] border border-[rgba(20,55,84,0.12)] bg-white p-4 shadow-[0_20px_50px_rgba(8,33,51,0.08)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-[#123047]">
                แถบการทำงานพยาบาล
              </div>
              <div className="mt-1 text-xs text-[#5f7486]">
                ค้นหาคนไข้ของหน่วยตัวเอง, ยืนยันการเลือก, ทะเบียน, เยี่ยมบ้าน และภาพรวมผลลัพธ์
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {(
                [
                  ["search", "ค้นหา/ยืนยัน"],
                  ["registry", "ทะเบียน"],
                  ["visit", "เยี่ยมบ้าน"],
                  ["acp", "ACP/LW"],
                  ["progress", "ภาพรวม"],
                ] as Array<[NurseWorkspaceTab, string]>
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setNurseTab(tab)}
                  className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${nurseTab === tab ? "bg-[#123047] text-white" : "border border-[#d9e5ec] bg-[#f7fbfd] text-[#123047]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {isUnitNurse && nurseTab === "search" ? (
        <Box
          title="ค้นหาคนไข้ของหน่วย"
          note="แสดงเฉพาะคนไข้ที่อยู่ในสถานบริการของคุณ เลือกแล้วค่อยยืนยันเพื่อเปิดหน้าเยี่ยมบ้าน"
        >
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              <input
                value={nurseSearch}
                onChange={(event) => {
                  setNurseSearch(event.target.value);
                  setNursePatientPage(1);
                }}
                placeholder="ค้นหา HN / CID / ชื่อ / Dx"
                className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
              <div className="space-y-2">
                {nursePatientsPageItems.map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => setPendingNursePatientId(patient.id)}
                    className="w-full rounded-[1.4rem] border border-[#e2edf4] bg-white p-4 text-left transition hover:bg-[#f8fbfd]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-[#123047]">
                          {patient.fullName}
                        </div>
                        <div className="mt-1 text-xs text-[#6f8190]">
                          HN {patient.hn} · CID {patient.cid}
                        </div>
                      </div>
                      <span className="inline-flex rounded-full border border-[#d9e5ec] bg-[#f7fbfd] px-3 py-1 text-xs text-[#123047]">
                        {patient.assignedUnitName}
                      </span>
                    </div>
                  </button>
                ))}
                {!nursePatients.length ? (
                  <div className="rounded-[1.4rem] border border-dashed border-[#d9e5ec] bg-[#f7fbfd] p-5 text-sm text-[#6f8190]">
                    ไม่พบคนไข้ในหน่วยของคุณตามคำค้นนี้
                  </div>
                ) : null}
                {nursePatients.length > nursePatientsPerPage ? (
                  <div className="flex items-center justify-between rounded-[1.4rem] border border-[#e2edf4] bg-[#f7fbfd] px-4 py-3 text-sm text-[#123047]">
                    <button
                      type="button"
                      onClick={() =>
                        setNursePatientPage((page) => Math.max(1, page - 1))
                      }
                      disabled={nursePatientsPage <= 1}
                      className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-2 text-sm font-medium text-[#123047] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ก่อนหน้า
                    </button>
                    <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                      หน้า {nursePatientsPage} / {nursePatientsPageCount}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setNursePatientPage((page) =>
                          Math.min(nursePatientsPageCount, page + 1),
                        )
                      }
                      disabled={nursePatientsPage >= nursePatientsPageCount}
                      className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-2 text-sm font-medium text-[#123047] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ถัดไป
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="rounded-[1.5rem] bg-[#f7fbfd] p-5">
              {pendingNursePatient ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                      คนไข้ที่เลือก
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#123047]">
                      {pendingNursePatient.fullName}
                    </div>
                    <div className="mt-2 text-sm text-[#6f8190]">
                      HN {pendingNursePatient.hn} · CID {pendingNursePatient.cid}
                    </div>
                  </div>
                  <div className="rounded-[1.4rem] border border-[#d9e5ec] bg-white p-4 text-sm text-[#123047]">
                    หน่วยตามที่อยู่: {pendingNursePatient.assignedUnitName}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatientId(pendingNursePatient.id);
                        setPendingNursePatientId(null);
                        setNurseTab("visit");
                      }}
                      className="rounded-2xl bg-[#0f766e] px-5 py-3 text-sm font-medium text-white"
                    >
                      ยืนยัน
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingNursePatientId(null)}
                      className="rounded-2xl border border-[#d9e5ec] bg-white px-5 py-3 text-sm font-medium text-[#123047]"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-[#6f8190]">
                  แตะที่รายชื่อคนไข้เพื่อดูชื่อและเลขบัตรประชาชนก่อนยืนยัน
                </div>
              )}
            </div>
          </div>
        </Box>
      ) : null}

      {isUnitNurse && nurseTab === "progress" ? (
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Box
            title="ภาพรวมผลลัพธ์ของหน่วย"
            note="สรุปงานประจำวัน รายเดือน และปีงบประมาณของหน่วยตัวเอง"
          >
            {currentUnitSummary ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[1.4rem] bg-[#f7fbfd] p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                    คนไข้คงเหลือ
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-[#123047]">
                    {currentUnitSummary.activePatients}
                  </div>
                </div>
                <div className="rounded-[1.4rem] bg-[#f7fbfd] p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                    ถึงกำหนดวันนี้
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-[#123047]">
                    {currentUnitVisitTodayCount}
                  </div>
                </div>
                <div className="rounded-[1.4rem] bg-[#f7fbfd] p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                    เยี่ยมเดือนนี้
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-[#123047]">
                    {currentUnitSummary.visitsThisMonth}
                  </div>
                </div>
                <div className="rounded-[1.4rem] bg-[#f7fbfd] p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                    ปีงบประมาณนี้
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-[#123047]">
                    {fiscalYearVisitCount}
                  </div>
                </div>
              </div>
            ) : null}
            {currentUnitSummary ? (
              <div className="mt-5 space-y-3">
                <div>
                  <div className="flex items-center justify-between text-sm text-[#5f7486]">
                    <span>ความพร้อมเบิก</span>
                    <span>
                      {currentUnitSummary.claimReady}/{currentUnitSummary.activePatients}
                    </span>
                  </div>
                  <div className="mt-2 h-3 rounded-full bg-[#e7f0f4]">
                    <div
                      className="h-3 rounded-full bg-[#0f766e]"
                      style={{
                        width: `${
                          currentUnitSummary.activePatients
                            ? Math.round(
                                (currentUnitSummary.claimReady /
                                  currentUnitSummary.activePatients) *
                                  100,
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm text-[#5f7486]">
                    <span>คนไข้ที่ยังต้องติดตาม</span>
                    <span>{currentUnitRemainingCount}</span>
                  </div>
                  <div className="mt-2 h-3 rounded-full bg-[#e7f0f4]">
                    <div
                      className="h-3 rounded-full bg-[#f59e0b]"
                      style={{
                        width: `${
                          currentUnitSummary.activePatients
                            ? Math.round(
                                (currentUnitRemainingCount /
                                  currentUnitSummary.activePatients) *
                                  100,
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </Box>
          <Box
            title="ทะเบียนหน่วยตัวเอง"
            note="ใช้ดูคิวเยี่ยมและสถานะเบิกเฉพาะสถานบริการของคุณ"
          >
            <div className="space-y-3">
              {visiblePatients.slice(0, 8).map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between rounded-[1.3rem] border border-[#e2edf4] bg-white px-4 py-3"
                >
                  <div>
                    <div className="font-medium text-[#123047]">
                      {patient.fullName}
                    </div>
                    <div className="text-xs text-[#6f8190]">
                      HN {patient.hn} · {patient.cid}
                    </div>
                  </div>
                  <div className="text-right text-sm text-[#123047]">
                    <div>{shortDate(patient.nextVisitAt)}</div>
                    <div className="text-xs text-[#6f8190]">
                      เดือน {patient.serviceMonthCount}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Box>
        </section>
      ) : null}

      {!isUnitNurse || nurseTab === "progress" ? (
        <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Box
          title="คู่มือบทบาท"
          note="เปิดแล้วรู้เลยว่าหน้าที่ของคนที่ล็อกอินอยู่ต้องทำอะไรบ้าง"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {roleGuide?.steps.map((step, index) => (
              <div key={step} className="rounded-[1.4rem] bg-[#f6fafc] p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-[#6d8394]">
                  Step {index + 1}
                </div>
                <div className="mt-2 text-sm leading-7 text-[#123047]">
                  {step}
                </div>
              </div>
            ))}
          </div>
        </Box>
        <Box
          title="ภาพรวมหน่วยงาน"
          note={
            isHospitalBoard
              ? "โรงพยาบาลเห็นทุกหน่วย"
              : "มุมมองของหน่วยที่กำลังใช้งาน"
          }
        >
          <div className="space-y-3">
            {visibleUnits.map((row) => (
              <div
                key={row.unitId}
                className="grid gap-3 rounded-[1.4rem] border border-[#e5eef4] bg-[#fbfdfe] p-4 sm:grid-cols-5"
              >
                <div>
                  <div className="text-sm font-semibold text-[#123047]">
                    {row.unitName}
                  </div>
                  <div className="text-xs text-[#6f8190]">
                    {row.unitKind === "pcu" ? "PCU" : "รพ.สต."}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#6f8190]">เคสในมือ</div>
                  <div className="mt-1 text-xl font-semibold text-[#123047]">
                    {row.activePatients}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#6f8190]">นัดใน 7 วัน</div>
                  <div className="mt-1 text-xl font-semibold text-[#123047]">
                    {row.dueThisWeek}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#6f8190]">พร้อมเบิก</div>
                  <div className="mt-1 text-xl font-semibold text-[#123047]">
                    {row.claimReady}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#6f8190]">รอรูปเยี่ยม</div>
                  <div className="mt-1 text-xl font-semibold text-[#123047]">
                    {row.pendingPhotos}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Box>
        </section>
      ) : null}

      {!isUnitNurse || nurseTab === "progress" ? (
        <Box
          title={
            isHospitalBoard ? "ตารางสรุปผลงานรายหน่วย" : "สรุปงานของหน่วยฉัน"
          }
          note="ใช้ติดตามจำนวนเคส งานที่ค้าง และความพร้อมเบิกของแต่ละหน่วยในมุมมองเดียว"
        >
          <div className="overflow-hidden rounded-[1.5rem] border border-[#e2edf4]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f5fafc] text-xs uppercase tracking-[0.2em] text-[#6f8190]">
                  <tr>
                    <th className="px-4 py-4">หน่วย</th>
                    <th className="px-4 py-4">เคสในมือ</th>
                    <th className="px-4 py-4">ถึงกำหนดวันนี้</th>
                    <th className="px-4 py-4">นัดใน 7 วัน</th>
                    <th className="px-4 py-4">พร้อมเบิก</th>
                    <th className="px-4 py-4">ค้างรูป/ข้อมูล</th>
                    <th className="px-4 py-4">เยี่ยมเดือนนี้</th>
                    <th className="px-4 py-4">คอมเมนต์ล่าสุด</th>
                  </tr>
                </thead>
                <tbody>
                  {unitReportRows.map((row) => (
                    <tr
                      key={row.unitId}
                      className="border-t border-[#edf3f7] bg-white"
                    >
                      <td className="px-4 py-4">
                        <div className="font-medium text-[#123047]">
                          {row.unitName}
                        </div>
                        <div className="mt-1 text-xs text-[#6f8190]">
                          {row.unitKind === "pcu" ? "PCU" : "รพ.สต."}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-medium text-[#123047]">
                        {row.activePatients}
                      </td>
                      <td className="px-4 py-4 text-[#123047]">{row.dueToday}</td>
                      <td className="px-4 py-4 text-[#123047]">
                        {row.dueThisWeek}
                      </td>
                      <td className="px-4 py-4 text-[#123047]">
                        {row.claimReady}
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-[#123047]">
                          รอรูป {row.pendingPhotos}
                        </div>
                        <div className="text-xs text-[#6f8190]">
                          ยังไม่พร้อมเบิก {row.incompleteClaims}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-[#123047]">
                        {row.visitsThisMonth}
                      </td>
                      <td className="px-4 py-4 text-[#123047]">
                        {row.latestCommentAt
                          ? formatDateTime(row.latestCommentAt)
                          : "-"}
                        {row.overdue > 0 ? (
                          <div className="mt-1 text-xs text-[#b14a1f]">
                            เกินกำหนด {row.overdue}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Box>
      ) : null}

      {isHospitalBoard && !isUnitManager ? (
        <Box
          title={
            isCaseManager
              ? "หน้าดึงคนไข้เข้าเงื่อนไข (Case Manager)"
              : "คัดเลือกและลงทะเบียนเคสจาก HOSXP"
          }
          note={
            isCaseManager
              ? "ใช้ดึงรายชื่อคนไข้จากโรคเป้าหมาย และโฟกัสเคสที่ยังไม่ลง Z51.5/Z71.8 เพื่อส่งต่อ รพ.สต./PCU"
              : "โรงพยาบาลกำหนดว่าเคสไหนเข้าเกณฑ์ และมอบหมายหน่วยรับผิดชอบจากหน้าจอนี้"
          }
        >
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="mb-4 flex flex-wrap gap-3">
                <Link
                  href="/case-manager"
                  className="rounded-2xl border border-[#12304744] bg-[#f7fbfd] px-4 py-3 text-sm font-medium text-[#123047]"
                >
                  เปิดหน้า Case Manager แยก
                </Link>
                <Link
                  href="/case-manager/in-progress"
                  className="rounded-2xl border border-[#2563eb44] bg-[#eef5ff] px-4 py-3 text-sm font-medium text-[#1d4ed8]"
                >
                  ตรวจสอบเคสกำลังเยี่ยม
                </Link>
                <Link
                  href="/case-manager/completed"
                  className="rounded-2xl border border-[#0f766e44] bg-[#e8fbf8] px-4 py-3 text-sm font-medium text-[#0f766e]"
                >
                  ตรวจสอบเคสเยี่ยมครบ
                </Link>
                <input
                  value={candidateSearch}
                  onChange={(event) => setCandidateSearch(event.target.value)}
                  placeholder="ค้นหา HN / ชื่อ / Dx"
                  className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
                <select
                  value={candidateClinic}
                  onChange={(event) => setCandidateClinic(event.target.value)}
                  className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                >
                  <option value="all">ทุกหน่วย</option>
                  {snapshot.clinicRules.map((rule) => (
                    <option key={rule.unitId} value={rule.shortName}>
                      {rule.clinicName}
                    </option>
                  ))}
                </select>
                {isCaseManager ? (
                  <select
                    value={candidateMode}
                    onChange={(event) =>
                      setCandidateMode(
                        event.target.value as CandidateFilterMode,
                      )
                    }
                    className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  >
                    <option value="missing_both_z">
                      ยังไม่เคยลงทั้ง Z51.5 และ Z71.8
                    </option>
                    <option value="missing_any_z">
                      ยังไม่เคยลง Z51.5 หรือ Z71.8 อย่างใดอย่างหนึ่ง
                    </option>
                    <option value="z_done_but_visit_incomplete">
                      ลง Z ครบแล้ว แต่เยี่ยมครบเกณฑ์ยังไม่ถึง {REQUIRED_COMPLETE_VISITS} ครั้ง
                    </option>
                    <option value="all">ทุกเคสเข้าเกณฑ์</option>
                  </select>
                ) : null}
                <input
                  type="date"
                  value={candidateDate}
                  onChange={(event) => setCandidateDate(event.target.value)}
                  className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={loadCandidates}
                  className="rounded-2xl bg-[#123047] px-5 py-3 text-sm font-medium text-white"
                >
                  ดึงรายชื่อ
                </button>
                <button
                  type="button"
                  onClick={syncCandidates}
                  className="rounded-2xl border border-[#0f766e55] bg-[#e8fbf8] px-5 py-3 text-sm font-medium text-[#0f766e]"
                >
                  ซิงก์เข้าทะเบียน
                </button>
              </div>
              {isCaseManager ? (
                <div className="mb-4 rounded-2xl border border-[#d9e5ec] bg-[#f7fbfd] px-4 py-3 text-sm text-[#4d6577]">
                  โหมดคัดกรอง: {candidateModeLabel(candidateMode)}
                </div>
              ) : null}
              <div className="overflow-hidden rounded-[1.5rem] border border-[#e2edf4]">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#f5fafc] text-xs uppercase tracking-[0.2em] text-[#6f8190]">
                      <tr>
                        <th className="px-4 py-4">ผู้ป่วย</th>
                        <th className="px-4 py-4">หน่วย</th>
                        <th className="px-4 py-4">Dx</th>
                        <th className="px-4 py-4">Z51.5 / Z71.8</th>
                        <th className="px-4 py-4">ความพร้อม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidateRows.length ? (
                        candidateRows.map((candidate) => (
                          <tr
                            key={candidateRowKey(candidate)}
                            className={`cursor-pointer border-t border-[#edf3f7] ${selectedCandidateKey === candidateRowKey(candidate) ? "bg-[#eef8f8]" : "hover:bg-[#f8fbfd]"}`}
                            onClick={() => {
                              setSelectedCandidateKey(
                                candidateRowKey(candidate),
                              );
                              setRegisterUnitId(candidate.unitId);
                              setRegisterDate(candidate.visitDate);
                            }}
                          >
                            <td className="px-4 py-4">
                              <div className="font-medium text-[#123047]">
                                {candidate.fullName}
                              </div>
                              <div className="mt-1 text-xs text-[#6f8190]">
                                HN {candidate.hn}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-[#123047]">
                              {candidate.clinicName}
                            </td>
                            <td className="px-4 py-4">
                              <div className="font-medium text-[#123047]">
                                {candidate.primaryDxCode}
                              </div>
                              <div className="mt-1 text-xs text-[#6f8190]">
                                {candidate.eligibleReason}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap gap-1.5 text-xs">
                                <span
                                  className={`inline-flex rounded-full border px-2.5 py-1 ${candidate.claimChecklist.diagZ515 ? "border-[#74c69d55] bg-[#74c69d22] text-[#0f5132]" : "border-[#ef476f55] bg-[#ef476f22] text-[#8d1d3e]"}`}
                                >
                                  Z51.5{" "}
                                  {candidate.claimChecklist.diagZ515
                                    ? "แล้ว"
                                    : "ยังไม่ลง"}
                                </span>
                                <span
                                  className={`inline-flex rounded-full border px-2.5 py-1 ${candidate.claimChecklist.diagZ718 ? "border-[#74c69d55] bg-[#74c69d22] text-[#0f5132]" : "border-[#ef476f55] bg-[#ef476f22] text-[#8d1d3e]"}`}
                                >
                                  Z71.8{" "}
                                  {candidate.claimChecklist.diagZ718
                                    ? "แล้ว"
                                    : "ยังไม่ลง"}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs ${candidate.claimChecklist.readyForClaim ? "border-[#74c69d55] bg-[#74c69d22] text-[#0f5132]" : "border-[#f3bd6a55] bg-[#f3bd6a22] text-[#7a5509]"}`}
                              >
                                {candidate.claimChecklist.readyForClaim
                                  ? "ครบพร้อมเบิก"
                                  : "ยังไม่ครบ"}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-8 text-center text-[#6f8190]"
                          >
                            กดดึงรายชื่อเพื่อดูเคสเข้าเกณฑ์
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="rounded-[1.5rem] bg-[#f7fbfd] p-5">
              {selectedCandidate ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                      ผู้ป่วยที่เลือก
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#123047]">
                      {selectedCandidate.fullName}
                    </div>
                    <div className="mt-2 text-sm text-[#6f8190]">
                      HN {selectedCandidate.hn} ·{" "}
                      {selectedCandidate.primaryDxCode}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {claimChecklistItems(selectedCandidate.claimChecklist).map(
                      ([label, active]) => (
                        <span
                          key={label}
                          className={`inline-flex rounded-full border px-3 py-1 text-xs ${active ? "border-[#6be2d355] bg-[#6be2d322] text-[#0b4d47]" : "border-[#d6e0e7] bg-[#f6f9fb] text-[#7c8f9d]"}`}
                        >
                          {label}
                        </span>
                      ),
                    )}
                  </div>
                  <div className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm text-[#123047]">
                    สถานบริการตามที่อยู่:{" "}
                    {snapshot.units.find((unit) => unit.id === registerUnitId)
                      ?.name ?? selectedCandidate.clinicName}
                  </div>
                  <input
                    type="date"
                    value={registerDate}
                    onChange={(event) => setRegisterDate(event.target.value)}
                    className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  />
                  <textarea
                    value={registerNote}
                    onChange={(event) => setRegisterNote(event.target.value)}
                    rows={4}
                    className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={registerCandidate}
                    className="w-full rounded-2xl bg-[#0f766e] px-5 py-3 text-sm font-medium text-white"
                  >
                    ลงทะเบียนเคสนี้
                  </button>
                </div>
              ) : (
                <div className="text-sm text-[#6f8190]">
                  เลือกเคสจากตารางเพื่อดูรายละเอียด
                </div>
              )}
            </div>
          </div>
        </Box>
      ) : null}
      {isCaseManager ? (
        <Box
          title="คัดเลือกคนไข้สำหรับ Case Manager"
          note="แยกหน้าเฉพาะสำหรับดึงรายชื่อเข้าเกณฑ์และลงทะเบียนเคส"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.4rem] border border-[#d9e5ec] bg-[#f7fbfd] p-5">
            <div>
              <div className="text-base font-semibold text-[#123047]">
                เปิดหน้าคัดเลือกคนไข้แยกเฉพาะ
              </div>
              <div className="mt-1 text-sm text-[#5f7486]">
                หน้านี้จะโฟกัสการค้นหาเคสตามโรคเป้าหมาย และเคสที่ยังไม่ลง
                Z51.5 / Z71.8
              </div>
            </div>
            <Link
              href="/case-manager"
              className="rounded-2xl bg-[#123047] px-5 py-3 text-sm font-medium text-white"
            >
              ไปหน้าคัดเลือกคนไข้
            </Link>
          </div>
        </Box>
      ) : null}
      {!isUnitNurse || nurseTab === "registry" ? (
        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Box
            title={
              isHospitalBoard
                ? "ทะเบียนผู้ป่วยทั้งเครือข่าย"
                : "ผู้ป่วยในหน่วยของฉัน"
            }
            note="คลิกแต่ละแถวเพื่อเปิดรายละเอียดเคสและประวัติการเยี่ยม"
          >
            {isUnitNurse || isUnitManager ? (
              <>
                {isUnitManager ? (
                  <div className="mb-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.2rem] bg-[#f7fbfd] p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-[#6f8190]">
                        กำลังติดตาม
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-[#123047]">
                        {registryTrackingPatients.length}
                      </div>
                    </div>
                    <div className="rounded-[1.2rem] bg-[#f7fbfd] p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-[#6f8190]">
                        ติดตามครบแล้ว
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-[#123047]">
                        {registryCompletedPatients.length}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-[1.2rem] bg-[#f7fbfd] p-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#6f8190]">
                      เคสเหลืออยู่
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-[#123047]">
                      {currentUnitRemainingCount}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] bg-[#f7fbfd] p-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#6f8190]">
                      ทำไปแล้ว
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-[#123047]">
                      {currentUnitCompletedCount}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] bg-[#f7fbfd] p-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#6f8190]">
                      สำเร็จวันนี้
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-[#123047]">
                      {currentUnitVisitTodayCount}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] bg-[#f7fbfd] p-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#6f8190]">
                      สำเร็จเดือนนี้
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-[#123047]">
                      {currentUnitVisitMonthCount}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] bg-[#f7fbfd] p-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#6f8190]">
                      ปีงบประมาณ
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-[#123047]">
                      {fiscalYearVisitCount}
                    </div>
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRegistryPage(1);
                      if (isUnitManager) {
                        setUnitManagerRegistryMode("tracking");
                      } else {
                        setNurseRegistryMode("tracking");
                      }
                    }}
                    className={`rounded-2xl px-4 py-2 text-sm font-medium ${(isUnitManager ? unitManagerRegistryMode : nurseRegistryMode) === "tracking" ? "bg-[#123047] text-white" : "border border-[#d9e5ec] bg-[#f7fbfd] text-[#123047]"}`}
                  >
                    คนไข้ที่กำลังติดตาม
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRegistryPage(1);
                      if (isUnitManager) {
                        setUnitManagerRegistryMode("completed");
                      } else {
                        setNurseRegistryMode("completed");
                      }
                    }}
                    className={`rounded-2xl px-4 py-2 text-sm font-medium ${(isUnitManager ? unitManagerRegistryMode : nurseRegistryMode) === "completed" ? "bg-[#0f766e] text-white" : "border border-[#d9e5ec] bg-[#f7fbfd] text-[#123047]"}`}
                  >
                    {isUnitManager ? "ติดตามครบแล้ว" : "ครบเงื่อนไขการติดตาม"}
                  </button>
                </div>
              </>
            ) : null}
            <div className="mb-4 flex flex-col gap-3 rounded-[1.3rem] border border-[#dce9ef] bg-[#f8fcfe] p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
                <label className="sr-only" htmlFor="registry-patient-search">
                  ค้นหาคนไข้
                </label>
                <input
                  id="registry-patient-search"
                  value={registrySearch}
                  onChange={(event) => {
                    setRegistrySearch(event.target.value);
                    setRegistryPage(1);
                  }}
                  placeholder="ค้นหา HN / CID / ชื่อ / Dx"
                  className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
                {isHospitalBoard ? (
                  <>
                    <label className="sr-only" htmlFor="registry-unit-filter">
                      กรองตามหน่วย
                    </label>
                    <select
                      id="registry-unit-filter"
                      value={registryUnitFilter}
                      onChange={(event) => {
                        setRegistryUnitFilter(event.target.value);
                        setRegistryPage(1);
                      }}
                      className="w-full rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm text-[#123047] outline-none"
                    >
                      <option value="all">ทุกหน่วย</option>
                      {registryUnitOptions.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#5f7486]">
                {isHospitalBoard ? (
                  <span className="rounded-full border border-[#d9e5ec] bg-white px-3 py-1.5">
                    หน่วย {selectedRegistryUnitName}
                  </span>
                ) : null}
                <span className="rounded-full border border-[#d9e5ec] bg-white px-3 py-1.5">
                  แสดง {registryPageItems.length} จาก {registryFilteredPatients.length} ราย
                </span>
                <span className="rounded-full border border-[#d9e5ec] bg-white px-3 py-1.5">
                  หน้า {currentRegistryPage}/{registryPageCount}
                </span>
              </div>
            </div>
            <div className="overflow-hidden rounded-[1.5rem] border border-[#e2edf4]">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f5fafc] text-xs uppercase tracking-[0.2em] text-[#6f8190]">
                    <tr>
                      <th className="px-4 py-4">ผู้ป่วย</th>
                      <th className="px-4 py-4">หน่วย</th>
                      <th className="px-4 py-4">นัดถัดไป</th>
                      <th className="px-4 py-4">เดือน</th>
                      <th className="px-4 py-4">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registryPageItems.length ? (
                      registryPageItems.map((patient) => (
                        <tr
                          key={patient.id}
                          className={`cursor-pointer border-t border-[#edf3f7] ${selectedPatient?.id === patient.id ? "bg-[#eef8f8]" : "hover:bg-[#f8fbfd]"}`}
                          onClick={() => selectPatient(patient)}
                        >
                          <td className="px-4 py-4">
                            <div className="font-medium text-[#123047]">
                              {patient.fullName}
                            </div>
                            <div className="mt-1 text-xs text-[#6f8190]">
                              HN {patient.hn} · {patient.primaryDxCode}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-[#123047]">
                            {patient.assignedUnitName}
                          </td>
                          <td className="px-4 py-4 text-[#123047]">
                            {shortDate(patient.nextVisitAt)}
                          </td>
                          <td className="px-4 py-4 text-[#123047]">
                            {patient.serviceMonthCount}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusClass(patient.careStatus)}`}
                            >
                              {statusLabel(patient.careStatus)}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-[#6f8190]">
                          ไม่พบคนไข้ตามคำค้นหา
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-[#6f8190]">
                แสดงหน้าละ 21 รายการ
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRegistryPage((page) => Math.max(1, page - 1))}
                  disabled={currentRegistryPage <= 1}
                  className="rounded-xl border border-[#d9e5ec] bg-white px-3 py-2 text-xs font-medium text-[#123047] disabled:opacity-40"
                >
                  ก่อนหน้า
                </button>
                {registryPageList.map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setRegistryPage(page)}
                    className={`rounded-xl px-3 py-2 text-xs font-medium ${
                      page === currentRegistryPage
                        ? "bg-[#123047] text-white"
                        : "border border-[#d9e5ec] bg-white text-[#123047]"
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setRegistryPage((page) => Math.min(registryPageCount, page + 1))
                  }
                  disabled={currentRegistryPage >= registryPageCount}
                  className="rounded-xl border border-[#d9e5ec] bg-white px-3 py-2 text-xs font-medium text-[#123047] disabled:opacity-40"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          </Box>
          <Box
            title="ตารางเยี่ยมและสถานะเบิก"
            note="ดูคิวเยี่ยม รายการพร้อมเบิก และรายการที่ยังต้องตามข้อมูลต่อ"
          >
            <div className="space-y-4">
              <div className="overflow-hidden rounded-[1.4rem] border border-[#e2edf4] bg-[#f7fbfd]">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#ecf4f8] text-xs font-semibold text-[#446075]">
                      <tr>
                        <th className="px-4 py-3">ลำดับ</th>
                        <th className="px-4 py-3">ชื่อ</th>
                        <th className="px-4 py-3">ครั้งที่1</th>
                        <th className="px-4 py-3">ครั้งที่2</th>
                        <th className="px-4 py-3">ครั้งที่3</th>
                        <th className="px-4 py-3">ครั้งที่4</th>
                        <th className="px-4 py-3">ครั้งที่5</th>
                        <th className="px-4 py-3">ครั้งที่6</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPatientVisitSixRow ? (
                        <tr className="border-t border-[#edf3f7] bg-white">
                          <td className="px-4 py-3 text-[#123047]">
                            {selectedPatientVisitSixRow.order}
                          </td>
                          <td className="px-4 py-3 text-[#123047]">
                            <div className="font-medium">
                              {selectedPatientVisitSixRow.patient.fullName}
                            </div>
                            <div className="text-xs text-[#6f8190]">
                              HN {selectedPatientVisitSixRow.patient.hn}
                            </div>
                          </td>
                          {selectedPatientVisitSixRow.rounds.map((date, index) => (
                            <td
                              key={`${selectedPatientVisitSixRow.patient.id}-${index}`}
                              className="px-4 py-3 text-[#123047]"
                            >
                              {date ? formatRoundDate(date) : "-"}
                            </td>
                          ))}
                        </tr>
                      ) : (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-4 py-8 text-center text-[#6f8190]"
                          >
                            คลิกเลือกเคสจากตารางทะเบียนเพื่อดูตารางเยี่ยมและสถานะเบิก
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="rounded-[1.4rem] border border-[#d9e5ec] bg-white p-4 text-sm text-[#4d6577]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                      ประวัติ visit จาก HOSXP
                    </div>
                    <div className="mt-1">
                      เลือกเคสแล้วจะเห็น diag และใบสั่งยาของ visit นั้น
                    </div>
                  </div>
                  <div className="rounded-full border border-[#d9e5ec] bg-[#f7fbfd] px-3 py-1 text-xs text-[#6f8190]">
                    {selectedPatient?.hn ?? "ยังไม่ได้เลือกเคส"}
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {selectedPatientVisitHistoryLoading ? (
                    <div className="rounded-2xl bg-[#f7fbfd] px-4 py-3 text-[#6f8190]">
                      กำลังโหลดประวัติ visit...
                    </div>
                  ) : displayedSelectedPatientVisitHistory.length ? (
                    displayedSelectedPatientVisitHistory.map((visit) => (
                      <div
                        key={visit.vn}
                        className="rounded-2xl border border-[#e2edf4] bg-[#fbfdfe] p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-[#123047]">
                              {formatDate(visit.visitDate)}
                            </div>
                            <div className="mt-1 text-xs text-[#6f8190]">
                              VN {visit.vn} · DX {visit.primaryDxCode}
                            </div>
                          </div>
                          <span className="rounded-full border border-[#d9e5ec] bg-white px-3 py-1 text-xs text-[#6f8190]">
                            {visit.isCompleteByCriteria ? "ครบเกณฑ์" : "ยังไม่ครบ"}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {visit.diagCodes.length ? (
                            visit.diagCodes.map((code) => (
                              <span
                                key={`${visit.vn}-${code}`}
                                className="inline-flex rounded-full border border-[#cfe3f3] bg-[#eef7ff] px-3 py-1 text-xs text-[#1d4ed8]"
                              >
                                {code}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-[#6f8190]">
                              ไม่มี diag
                            </span>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {visit.opitems.length ? (
                            visit.opitems.map((item) => (
                              <span
                                key={`${visit.vn}-${item.icode}`}
                                className="inline-flex rounded-full border border-[#d9e5ec] bg-white px-3 py-1 text-xs text-[#123047]"
                              >
                                {item.itemName}
                                {item.adpCode ? ` · ${item.adpCode}` : ""}
                                {item.qty ? ` × ${item.qty}` : ""}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-[#6f8190]">
                              ไม่มีใบสั่งยา
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-[#f7fbfd] px-4 py-3 text-[#6f8190]">
                      คลิกเลือกเคสจากตารางทะเบียนเพื่อดูประวัติ visit
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-[1.4rem] bg-[#fff9ef] p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-[#8c6a19]">
                  พร้อมเบิก
                </div>
                <div className="mt-3 space-y-2">
                  {readyRows.length ? (
                    readyRows.map((patient) => (
                      <div
                        key={patient.id}
                        className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm"
                      >
                        <div>
                          <div className="font-medium text-[#123047]">
                            {patient.fullName}
                          </div>
                          <div className="text-xs text-[#6f8190]">
                            {patient.assignedUnitName}
                          </div>
                        </div>
                        <div className="text-right text-[#123047]">
                          <div>เดือนที่ {patient.serviceMonthCount}</div>
                          <div className="text-xs text-[#6f8190]">
                            {claimGapLabels(patient).length
                              ? `ยังขาด ${claimGapLabels(patient).join(", ")}`
                              : "ครบทุกตัว"}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[#6f8190]">
                      ยังไม่มีเคสพร้อมเบิกในมุมมองนี้
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Box>
        </section>
      ) : null}

      {isUnitNurse && nurseTab === "acp" ? (
        <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <Box
            title="แบบฟอร์ม ACP/Living Will"
            note="เลือก visit ที่ต้องการ ให้ผู้ป่วยและพยานเซ็นในระบบ แล้วจัดเก็บเป็น PDF แนบกับ visit"
          >
            {selectedPatient ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    value={selectedAcpVisit?.id ?? ""}
                    onChange={(event) => setAcpSelectedVisitId(Number(event.target.value))}
                    className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm text-[#123047] outline-none"
                  >
                    {selectedVisits.length ? (
                      selectedVisits.map((visit) => (
                        <option key={visit.id} value={visit.id}>
                          เยี่ยมวันที่ {formatDate(visit.visitDate)} · {visit.visitorName}
                        </option>
                      ))
                    ) : (
                      <option value="">ยังไม่มี visit ที่บันทึกแล้ว</option>
                    )}
                  </select>
                  <input
                    type="date"
                    value={acpDraft.planDate}
                    onChange={(event) => setAcpField("planDate", event.target.value)}
                    className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  />
                </div>

                <div className="rounded-[1.4rem] border border-[#d9e5ec] bg-[#f7fbfd] p-4">
                  <div className="text-sm font-semibold text-[#123047]">ส่วนที่ 1 ข้อมูลส่วนบุคคล</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {([
                      ["patientName", "ชื่อ-สกุลผู้แสดงเจตนา"],
                      ["patientAge", "อายุ"],
                      ["patientCid", "เลขบัตรประชาชน"],
                      ["patientPhone", "เบอร์โทรศัพท์"],
                      ["patientBirthDate", "วันเดือนปีเกิด"],
                      ["regularHospital", "สถานพยาบาลประจำ"],
                      ["insurance", "สิทธิการรักษา"],
                      ["coPlannerName", "ชื่อผู้ร่วมวางแผน"],
                      ["coPlannerCid", "เลขบัตรผู้ร่วมวางแผน"],
                      ["coPlannerRelation", "ความสัมพันธ์"],
                      ["coPlannerPhone", "เบอร์โทรผู้ร่วมวางแผน"],
                    ] as Array<[keyof AdvanceCarePlanForm, string]>).map(([key, label]) => (
                      <input
                        key={key}
                        value={(acpDraft[key] as string | undefined) ?? ""}
                        onChange={(event) => setAcpField(key, event.target.value as never)}
                        placeholder={label}
                        className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none"
                      />
                    ))}
                    <textarea
                      value={acpDraft.patientAddress ?? ""}
                      onChange={(event) => setAcpField("patientAddress", event.target.value)}
                      placeholder="ที่อยู่ที่ติดต่อได้"
                      rows={2}
                      className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none sm:col-span-2"
                    />
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-[#d9e5ec] bg-[#f7fbfd] p-4">
                  <div className="text-sm font-semibold text-[#123047]">ส่วนที่ 2 การแสดงเจตจำนง</div>
                  <div className="mt-3 grid gap-4">
                    <div className="rounded-2xl bg-white p-3">
                      <div className="text-xs font-semibold text-[#6f8190]">สิ่งที่ต้องการ/ให้ความสำคัญ</div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {acpImportantValueOptions.map((option) => (
                          <label key={option} className="flex items-center gap-2 text-sm text-[#123047]">
                            <input
                              type="checkbox"
                              checked={acpDraft.importantValues.includes(option)}
                              onChange={(event) => toggleAcpList("importantValues", option, event.target.checked)}
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                      {acpDraft.importantValues.includes("อื่นๆ") ? (
                        <input
                          value={acpDraft.importantValuesOther ?? ""}
                          onChange={(event) => setAcpField("importantValuesOther", event.target.value)}
                          placeholder="ระบุสิ่งที่ให้ความสำคัญอื่นๆ"
                          className="mt-3 w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                        />
                      ) : null}
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <div className="text-xs font-semibold text-[#6f8190]">สภาวะที่ไม่ต้องการ/ยอมรับไม่ได้</div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {acpUnacceptableStateOptions.map((option) => (
                          <label key={option} className="flex items-center gap-2 text-sm text-[#123047]">
                            <input
                              type="checkbox"
                              checked={acpDraft.unacceptableStates.includes(option)}
                              onChange={(event) => toggleAcpList("unacceptableStates", option, event.target.checked)}
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                      {acpDraft.unacceptableStates.includes("อื่นๆ") ? (
                        <input
                          value={acpDraft.unacceptableStatesOther ?? ""}
                          onChange={(event) => setAcpField("unacceptableStatesOther", event.target.value)}
                          placeholder="ระบุสภาวะอื่นๆ"
                          className="mt-3 w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                        />
                      ) : null}
                    </div>
                    <select
                      value={acpDraft.treatmentScope ?? ""}
                      onChange={(event) => setAcpField("treatmentScope", event.target.value)}
                      className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm text-[#123047] outline-none"
                    >
                      <option value="">เลือกขอบเขตการรักษาที่ต้องการ</option>
                      {acpTreatmentScopeOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    {acpDraft.treatmentScope === "อื่นๆ" ? (
                      <input
                        value={acpDraft.treatmentScopeOther ?? ""}
                        onChange={(event) => setAcpField("treatmentScopeOther", event.target.value)}
                        placeholder="ระบุขอบเขตการรักษาอื่นๆ"
                        className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none"
                      />
                    ) : null}
                    <textarea
                      value={acpDraft.otherCare ?? ""}
                      onChange={(event) => setAcpField("otherCare", event.target.value)}
                      placeholder="การดูแลอื่นๆ ที่ต้องการนอกเหนือจากการแพทย์"
                      rows={2}
                      className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        value={acpDraft.terminalNaturalDeath ?? ""}
                        onChange={(event) => setAcpField("terminalNaturalDeath", event.target.value)}
                        className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm text-[#123047] outline-none"
                      >
                        <option value="">การตายสงบตามธรรมชาติ</option>
                        <option value="ต้องการ">ต้องการ</option>
                        <option value="ไม่ต้องการ">ไม่ต้องการ</option>
                      </select>
                      <select
                        value={acpDraft.preferredPlace ?? ""}
                        onChange={(event) => setAcpField("preferredPlace", event.target.value)}
                        className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm text-[#123047] outline-none"
                      >
                        <option value="">สถานที่ที่ปรารถนาเสียชีวิต</option>
                        {acpPreferredPlaceOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                    {acpDraft.preferredPlace === "ที่อื่นๆ" ? (
                      <input
                        value={acpDraft.preferredPlaceOther ?? ""}
                        onChange={(event) => setAcpField("preferredPlaceOther", event.target.value)}
                        placeholder="ระบุสถานที่อื่นๆ"
                        className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#f7fbfd] px-4 py-8 text-center text-sm text-[#6f8190]">
                กรุณาเลือกคนไข้ก่อนเปิดแบบฟอร์ม ACP/LW
              </div>
            )}
          </Box>

          <Box
            title="ผู้ตัดสินใจแทนและลายเซ็น"
            note="ลายเซ็นผู้ป่วยและพยาน 1 คนเป็นข้อมูลขั้นต่ำก่อนสร้าง PDF"
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ["proxyName", "ชื่อผู้ตัดสินใจแทน"],
                  ["proxyAge", "อายุ"],
                  ["proxyRelation", "ความสัมพันธ์"],
                  ["proxyPhone", "เบอร์โทร"],
                  ["healthStaffName", "ชื่อบุคลากรด้านสุขภาพ"],
                  ["healthStaffProfession", "วิชาชีพ"],
                  ["healthStaffPhone", "เบอร์ติดต่อบุคลากร"],
                  ["patientSignerName", "ชื่อผู้แสดงเจตนา"],
                  ["proxySignerName", "ชื่อผู้ตัดสินใจแทนที่เซ็น"],
                  ["witness1Name", "ชื่อพยาน 1"],
                  ["witness2Name", "ชื่อพยาน 2"],
                ] as Array<[keyof AdvanceCarePlanForm, string]>).map(([key, label]) => (
                  <input
                    key={key}
                    value={(acpDraft[key] as string | undefined) ?? ""}
                    onChange={(event) => setAcpField(key, event.target.value as never)}
                    placeholder={label}
                    className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none"
                  />
                ))}
                <textarea
                  value={acpDraft.proxyAddress ?? ""}
                  onChange={(event) => setAcpField("proxyAddress", event.target.value)}
                  placeholder="ที่อยู่ผู้ตัดสินใจแทน"
                  rows={2}
                  className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm outline-none sm:col-span-2"
                />
              </div>
              <SignaturePad label="ผู้แสดงเจตนา / คนไข้" value={acpPatientSignature} onChange={setAcpPatientSignature} />
              <SignaturePad label="ผู้ตัดสินใจแทน" value={acpProxySignature} onChange={setAcpProxySignature} />
              <SignaturePad label="พยาน 1" value={acpWitness1Signature} onChange={setAcpWitness1Signature} />
              <SignaturePad label="พยาน 2" value={acpWitness2Signature} onChange={setAcpWitness2Signature} />
              <SignaturePad label="บุคลากรด้านสุขภาพ" value={acpStaffSignature} onChange={setAcpStaffSignature} />
              <button
                type="button"
                onClick={() => void saveAcpDocument()}
                disabled={!selectedAcpVisit || working}
                className="w-full rounded-2xl bg-[#0f766e] px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[#9db8b4]"
              >
                สร้างและบันทึก PDF ACP/LW
              </button>
              {selectedAcpVisit?.advanceCarePlan ? (
                <a
                  href={selectedAcpVisit.advanceCarePlan.url}
                  download={selectedAcpVisit.advanceCarePlan.fileName}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-[#0f766e33] bg-[#ebfaf6] px-4 py-3 text-sm font-medium text-[#0f766e]"
                >
                  ดาวน์โหลด PDF ที่บันทึกแล้ว: {selectedAcpVisit.advanceCarePlan.fileName}
                </a>
              ) : null}
            </div>
          </Box>
        </section>
      ) : null}

      {!isUnitManager && (!isUnitNurse || nurseTab === "visit") ? (
        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Box
            title="รายละเอียดผู้ป่วย"
            note="แก้วันเยี่ยม เบอร์โทร หน่วยรับผิดชอบ และตรวจเช็กลิสต์การเบิก"
          >
            <div className="space-y-5">
              {selectedPatient ? (
                <>
                  <div className="rounded-[1.6rem] bg-[linear-gradient(180deg,#f6fbfd_0%,#ffffff_100%)] p-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                          {selectedPatient.assignedUnitName}
                        </div>
                        <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#123047]">
                          {selectedPatient.fullName}
                        </div>
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusClass(selectedPatient.careStatus)}`}
                      >
                        {statusLabel(selectedPatient.careStatus)}
                      </span>
                      {selectedPatient.claimChecklist.opioidEligible ? (
                        <span className="inline-flex rounded-full border border-[#efb85e55] bg-[#ffe9c2] px-3 py-1 text-xs font-medium text-[#7a5509]">
                          Opioid
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-[#5f7486]">
                      <span>HN {selectedPatient.hn}</span>
                      <span>{selectedPatient.primaryDxCode}</span>
                      <span>{selectedPatient.age} ปี</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {claimItems(selectedPatient).map(([label, active]) => (
                        <span
                          key={label}
                          className={`inline-flex rounded-full border px-3 py-1 text-xs ${active ? "border-[#6be2d355] bg-[#6be2d322] text-[#0b4d47]" : "border-[#d6e0e7] bg-[#f6f9fb] text-[#7c8f9d]"}`}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={patientDraft.phone}
                      onChange={(event) =>
                        setPatientDraft((draft) => ({
                          ...draft,
                          phone: event.target.value,
                        }))
                      }
                      placeholder="เบอร์ผู้ป่วย"
                      className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                    />
                    <input
                      value={patientDraft.relativePhone}
                      onChange={(event) =>
                        setPatientDraft((draft) => ({
                          ...draft,
                          relativePhone: event.target.value,
                        }))
                      }
                      placeholder="เบอร์ญาติ"
                      className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                    />
                    <input
                      value={patientDraft.lineId}
                      onChange={(event) =>
                        setPatientDraft((draft) => ({
                          ...draft,
                          lineId: event.target.value,
                        }))
                      }
                      placeholder="LINE ID"
                      className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                    />
                    <input
                      type="date"
                      value={patientDraft.nextVisitAt}
                      onChange={(event) =>
                        setPatientDraft((draft) => ({
                          ...draft,
                          nextVisitAt: event.target.value,
                        }))
                      }
                      className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                    />
                    <div className="rounded-2xl border border-[#d9e5ec] bg-white px-4 py-3 text-sm text-[#123047] sm:col-span-2">
                      สถานบริการ: {selectedUnit?.name ?? selectedPatient.assignedUnitName}
                    </div>
                    <textarea
                      value={patientDraft.notes}
                      onChange={(event) =>
                        setPatientDraft((draft) => ({
                          ...draft,
                          notes: event.target.value,
                        }))
                      }
                      rows={4}
                      className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none sm:col-span-2"
                    />
                  </div>
                  <div className="rounded-[1.4rem] border border-[#e2edf4] bg-[#f7fbfd] p-4 text-sm text-[#5f7486]">
                    ช่วงที่อนุญาตให้เลื่อนนัด:{" "}
                    {formatDate(selectedPatient.visitWindow.startDate)} -{" "}
                    {formatDate(selectedPatient.visitWindow.endDate)}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          () =>
                            requestJson(`/api/registry/${selectedPatient.id}`, {
                              method: "PATCH",
                              body: JSON.stringify(patientDraft),
                            }),
                          "บันทึกข้อมูลผู้ป่วยแล้ว",
                        )
                      }
                      className="rounded-2xl bg-[#123047] px-5 py-3 text-sm font-medium text-white"
                    >
                      บันทึกข้อมูล
                    </button>
                    {!isUnitNurse ? (
                      <>
                        <input
                          value={cancelReason}
                          onChange={(event) =>
                            setCancelReason(event.target.value)
                          }
                          className="min-w-[250px] rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              () =>
                                requestJson(
                                  `/api/registry/${selectedPatient.id}/cancel`,
                                  {
                                    method: "POST",
                                    body: JSON.stringify({ reason: cancelReason }),
                                  },
                                ),
                              "ยกเลิกการลงทะเบียนแล้ว",
                            )
                          }
                          className="rounded-2xl border border-[#ef476f55] bg-[#fff0f3] px-5 py-3 text-sm font-medium text-[#8d1d3e]"
                        >
                          ยกเลิกการลงทะเบียน
                        </button>
                      </>
                    ) : null}
                  </div>
                  <SavedDataNotice
                    notice={notice}
                    canViewDailyVisits={canViewDailyVisits}
                    canViewRegistry={isHospitalBoard}
                  />
                </>
              ) : (
                <div className="text-sm text-[#6f8190]">
                  ยังไม่มีผู้ป่วยในมุมมองนี้
                </div>
              )}
            </div>
          </Box>
          <Box
            title="บันทึกเยี่ยมบ้านและประวัติย้อนหลัง"
            note="แยกรูปบัตรคู่กับคนไข้และรูปติดตามอาการ เพื่อให้ตรวจย้อนหลังได้ชัด"
          >
            <div className="space-y-6">
              {selectedPatient ? (
                <>
                  <div className="rounded-[1.5rem] bg-[#f7fbfd] p-5">
                    <div className="mb-4 rounded-[1.3rem] border border-[#d9e5ec] bg-white p-4 text-sm text-[#4d6577]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                            ประวัติ visit จาก HOSXP
                          </div>
                          <div className="mt-1">
                            แสดงเฉพาะ visit ที่เข้าเกณฑ์ตามกติกาใน vale พร้อม
                            diag และใบสั่งยาของรอบนั้น
                          </div>
                        </div>
                        <div className="rounded-full border border-[#d9e5ec] bg-[#f7fbfd] px-3 py-1 text-xs text-[#6f8190]">
                          {selectedPatient.hn}
                        </div>
                      </div>
                      <div className="mt-4 space-y-3">
                        {selectedPatientVisitHistoryLoading ? (
                          <div className="rounded-2xl bg-[#f7fbfd] px-4 py-3 text-[#6f8190]">
                            กำลังโหลดประวัติ visit...
                          </div>
                        ) : displayedSelectedPatientVisitHistory.length ? (
                          displayedSelectedPatientVisitHistory.map((visit) => (
                            <div
                              key={visit.vn}
                              className="rounded-2xl border border-[#e2edf4] bg-[#fbfdfe] p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <div className="font-medium text-[#123047]">
                                    {formatDate(visit.visitDate)}
                                  </div>
                                  <div className="mt-1 text-xs text-[#6f8190]">
                                    VN {visit.vn} · DX {visit.primaryDxCode}
                                  </div>
                                </div>
                                <span className="rounded-full border border-[#d9e5ec] bg-white px-3 py-1 text-xs text-[#6f8190]">
                                  {visit.isCompleteByCriteria
                                    ? "ครบเกณฑ์"
                                    : "ยังไม่ครบ"}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {visit.diagCodes.length ? (
                                  visit.diagCodes.map((code) => (
                                    <span
                                      key={`${visit.vn}-${code}`}
                                      className="inline-flex rounded-full border border-[#cfe3f3] bg-[#eef7ff] px-3 py-1 text-xs text-[#1d4ed8]"
                                    >
                                      {code}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-sm text-[#6f8190]">
                                    ไม่มี diag
                                  </span>
                                )}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {visit.opitems.length ? (
                                  visit.opitems.map((item) => (
                                    <span
                                      key={`${visit.vn}-${item.icode}`}
                                      className="inline-flex rounded-full border border-[#d9e5ec] bg-white px-3 py-1 text-xs text-[#123047]"
                                    >
                                      {item.itemName}
                                      {item.adpCode ? ` · ${item.adpCode}` : ""}
                                      {item.qty ? ` × ${item.qty}` : ""}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-sm text-[#6f8190]">
                                    ไม่มีใบสั่งยา
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl bg-[#f7fbfd] px-4 py-3 text-[#6f8190]">
                            ไม่พบประวัติ visit ที่เข้าเกณฑ์สำหรับ HN นี้
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mb-4 rounded-[1.3rem] border border-[#0f766e22] bg-[#ebfaf6] p-4 text-sm leading-7 text-[#0b4d47]">
                      ก่อนบันทึกการเยี่ยม ต้องมีวันที่เยี่ยม, Authen code,
                      อาการติดตาม, รูปบัตรคู่กับคนไข้ และรูปติดตามอาการอย่างน้อย
                      1 รูป
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="date"
                        value={visitDraft.visitDate}
                        onChange={(event) =>
                          setVisitDraft((draft) => ({
                            ...draft,
                            visitDate: event.target.value,
                          }))
                        }
                        className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                      />
                      <input
                        value={visitDraft.authenCode}
                        onChange={(event) =>
                          setVisitDraft((draft) => ({
                            ...draft,
                            authenCode: event.target.value,
                          }))
                        }
                        placeholder="Authen code"
                        className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                      />
                      <textarea
                        value={visitDraft.symptoms}
                        onChange={(event) =>
                          setVisitDraft((draft) => ({
                            ...draft,
                            symptoms: event.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="อาการติดตาม"
                        className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none sm:col-span-2"
                      />
                      <textarea
                        value={visitDraft.note}
                        onChange={(event) =>
                          setVisitDraft((draft) => ({
                            ...draft,
                            note: event.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="บันทึกการเยี่ยม"
                        className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none sm:col-span-2"
                      />
                      {renderClinicalAssessmentForm(visitClinical, setVisitClinical)}
                      <div className="rounded-2xl border border-dashed border-[#c9d9e3] bg-white px-4 py-3 text-sm sm:col-span-2">
                        <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                          {getPhotoCategoryLabel("patient-card")}
                        </div>
                        <div className="mt-3 space-y-3">
                          {patientCardFiles.map((files, index) => (
                            <div key={`${patientCardFileInputKey}-${index}`}>
                              <div className="mb-1 text-xs text-[#5f7486]">
                                รูปที่ {index + 1}
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <label className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-xs text-[#123047]">
                                  เลือกรูปจากเครื่อง
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(event) =>
                                      setPatientCardFiles((prev) =>
                                        prev.map((item, itemIndex) =>
                                          itemIndex === index ? event.target.files : item,
                                        ),
                                      )
                                    }
                                    className="mt-2 w-full text-sm outline-none"
                                  />
                                </label>
                                <label className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-xs text-[#123047]">
                                  ถ่ายรูปใหม่
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={(event) =>
                                      setPatientCardFiles((prev) =>
                                        prev.map((item, itemIndex) =>
                                          itemIndex === index ? event.target.files : item,
                                        ),
                                      )
                                    }
                                    className="mt-2 w-full text-sm outline-none"
                                  />
                                </label>
                              </div>
                              <div className="mt-1 text-xs text-[#6f8190]">
                                {files?.length ? "เลือกรูปแล้ว" : "ยังไม่ได้เลือกรูป"}
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setPatientCardFiles((prev) => [...prev, null])
                          }
                          className="mt-3 rounded-xl border border-[#12304733] px-3 py-2 text-xs font-medium text-[#123047]"
                        >
                          เพิ่มรูป
                        </button>
                      </div>
                      <div className="rounded-2xl border border-dashed border-[#c9d9e3] bg-white px-4 py-3 text-sm sm:col-span-2">
                        <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                          {getPhotoCategoryLabel("follow-up")}
                        </div>
                        <div className="mt-3 space-y-3">
                          {followUpFiles.map((files, index) => (
                            <div key={`${followUpFileInputKey}-${index}`}>
                              <div className="mb-1 text-xs text-[#5f7486]">
                                รูปที่ {index + 1}
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <label className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-xs text-[#123047]">
                                  เลือกรูปจากเครื่อง
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(event) =>
                                      setFollowUpFiles((prev) =>
                                        prev.map((item, itemIndex) =>
                                          itemIndex === index ? event.target.files : item,
                                        ),
                                      )
                                    }
                                    className="mt-2 w-full text-sm outline-none"
                                  />
                                </label>
                                <label className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-xs text-[#123047]">
                                  ถ่ายรูปใหม่
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={(event) =>
                                      setFollowUpFiles((prev) =>
                                        prev.map((item, itemIndex) =>
                                          itemIndex === index ? event.target.files : item,
                                        ),
                                      )
                                    }
                                    className="mt-2 w-full text-sm outline-none"
                                  />
                                </label>
                              </div>
                              <div className="mt-1 text-xs text-[#6f8190]">
                                {files?.length ? "เลือกรูปแล้ว" : "ยังไม่ได้เลือกรูป"}
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setFollowUpFiles((prev) => [...prev, null])
                          }
                          className="mt-3 rounded-xl border border-[#12304733] px-3 py-2 text-xs font-medium text-[#123047]"
                        >
                          เพิ่มรูป
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {Object.entries(visitChecklist).map(([key, value]) => (
                        <label
                          key={key}
                          className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm text-[#123047]"
                        >
                          <input
                            type="checkbox"
                            checked={value}
                            onChange={(event) =>
                              setVisitChecklist((draft) => ({
                                ...draft,
                                [key]: event.target.checked,
                              }))
                            }
                          />
                          <span>
                            {visitChecklistLabels[key as keyof VisitChecklist]}
                          </span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void saveVisit()}
                      className="mt-4 rounded-2xl bg-[#0f766e] px-5 py-3 text-sm font-medium text-white"
                    >
                      บันทึกการเยี่ยมครั้งนี้
                    </button>
                    <SavedDataNotice
                      notice={notice}
                      canViewDailyVisits={canViewDailyVisits}
                      canViewRegistry={isHospitalBoard}
                    />
                  </div>
                  <div className="space-y-3">
                    {selectedVisits.length ? (
                      selectedVisits.map((visit) => {
                        const { patientCardPhotos, followUpPhotos } =
                          splitVisitPhotos(visit.photos);
                        return (
                          <div
                            key={visit.id}
                            className="rounded-[1.4rem] border border-[#e2edf4] p-4"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="font-medium text-[#123047]">
                                  เยี่ยมวันที่ {formatDate(visit.visitDate)}
                                </div>
                                <div className="text-xs text-[#6f8190]">
                                  โดย {visit.visitorName} · Authen{" "}
                                  {visit.authenCode || "-"}
                                </div>
                              </div>
                              <span className="inline-flex rounded-full border border-[#d9e5ec] bg-[#f7fbfd] px-3 py-1 text-xs text-[#123047]">
                                {visit.photos.length} รูป
                              </span>
                            </div>
                            <div className="mt-3 text-sm leading-7 text-[#123047]">
                              {visit.symptoms}
                            </div>
                            <div className="mt-2 text-sm leading-7 text-[#5f7486]">
                              {visit.note}
                            </div>
                            <VisitClinicalSummary clinical={visit.clinical} />
                            {visit.advanceCarePlan ? (
                              <a
                                href={visit.advanceCarePlan.url}
                                download={visit.advanceCarePlan.fileName}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex rounded-full border border-[#0f766e33] bg-[#ebfaf6] px-3 py-1 text-xs font-medium text-[#0f766e]"
                              >
                                ดาวน์โหลด PDF ACP/LW
                              </a>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              {Object.entries(visit.checklist)
                                .filter(([, active]) => active)
                                .map(([key]) => (
                                  <span
                                    key={key}
                                    className="inline-flex rounded-full border border-[#d9e5ec] bg-[#f7fbfd] px-3 py-1 text-xs text-[#123047]"
                                  >
                                    {
                                      visitChecklistLabels[
                                        key as keyof VisitChecklist
                                      ]
                                    }
                                  </span>
                                ))}
                            </div>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <div className="rounded-2xl bg-[#f7fbfd] p-3">
                                <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                                  รูปบัตรคู่กับคนไข้
                                </div>
                                <div className="mt-3 flex flex-wrap gap-3">
                                  {patientCardPhotos.length ? (
                                    patientCardPhotos.map((photo) => (
                                      <Image
                                        key={photo.id}
                                        src={photo.url}
                                        alt={photo.fileName}
                                        width={80}
                                        height={80}
                                        unoptimized
                                        className="h-20 w-20 rounded-2xl object-cover"
                                      />
                                    ))
                                  ) : (
                                    <div className="text-sm text-[#6f8190]">
                                      ไม่มีรูปในหมวดนี้
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="rounded-2xl bg-[#f7fbfd] p-3">
                                <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                                  รูปติดตามอาการคนไข้
                                </div>
                                <div className="mt-3 flex flex-wrap gap-3">
                                  {followUpPhotos.length ? (
                                    followUpPhotos.map((photo) => (
                                      <Image
                                        key={photo.id}
                                        src={photo.url}
                                        alt={photo.fileName}
                                        width={80}
                                        height={80}
                                        unoptimized
                                        className="h-20 w-20 rounded-2xl object-cover"
                                      />
                                    ))
                                  ) : (
                                    <div className="text-sm text-[#6f8190]">
                                      ไม่มีรูปในหมวดนี้
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-[#6f8190]">
                        ยังไม่มีประวัติการเยี่ยม
                      </div>
                    )}
                  </div>
                  <div className="rounded-[1.5rem] bg-[#f7fbfd] p-5">
                    <div className="grid gap-3 sm:grid-cols-[0.8fr_0.2fr]">
                      <textarea
                        value={commentDraft}
                        onChange={(event) => setCommentDraft(event.target.value)}
                        rows={4}
                        placeholder="ข้อความประสานงาน"
                        className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                      />
                      <div className="space-y-3">
                        <select
                          value={commentAudience}
                          onChange={(event) =>
                            setCommentAudience(
                              event.target.value as CommentAudience,
                            )
                          }
                          className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                        >
                          <option value="all">ทุกฝ่าย</option>
                          <option value="hospital">ให้โรงพยาบาลเห็น</option>
                          <option value="unit">ให้หน่วยเห็น</option>
                        </select>
                        <button
                          type="button"
                          onClick={saveComment}
                          className="w-full rounded-2xl bg-[#123047] px-5 py-3 text-sm font-medium text-white"
                        >
                          ส่งข้อความ
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {selectedComments.length ? (
                        selectedComments.map((comment) => (
                          <div
                            key={comment.id}
                            className="rounded-[1.4rem] bg-white p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-medium text-[#123047]">
                                  {comment.authorName}
                                </div>
                                <div className="text-xs text-[#6f8190]">
                                  {formatDateTime(comment.createdAt)}
                                </div>
                              </div>
                              <span className="inline-flex rounded-full border border-[#d9e5ec] bg-[#f7fbfd] px-3 py-1 text-xs text-[#123047]">
                                {formatAudience(comment.audience)}
                              </span>
                            </div>
                            <div className="mt-3 text-sm leading-7 text-[#123047]">
                              {comment.body}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-[#6f8190]">
                          ยังไม่มีคอมเมนต์
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </Box>
        </section>
      ) : null}

      {!isUnitNurse && !isUnitManager ? (
        <Box
          title="ผู้ใช้งาน"
          note="ตั้งชื่อผู้ใช้พื้นฐาน จัดการสมาชิก และอนุมัติคำขอเข้าใช้งาน"
        >
        <div className="grid gap-6">
          <div className="rounded-[1.5rem] bg-[#f7fbfd] p-5">
            <div className="text-sm font-medium text-[#123047]">
              ชื่อที่แสดงของผู้ใช้ปัจจุบัน
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  currentUser &&
                  renameDraft.trim() &&
                  run(
                    () =>
                      requestJson(
                        `/api/users/${currentUser.id}`,
                        {
                          method: "PATCH",
                          body: JSON.stringify({ displayName: renameDraft }),
                        },
                        authToken,
                      ),
                    "อัปเดตชื่อผู้ใช้งานแล้ว",
                  )
                }
                className="rounded-2xl bg-[#123047] px-5 py-3 text-sm font-medium text-white"
              >
                บันทึกชื่อ
              </button>
            </div>
            {canManageUsers ? (
              <div className="mt-4 rounded-2xl border border-[#dbe7ef] bg-white p-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setUserManagementTab("members")}
                    className={`rounded-xl px-3 py-2 text-sm font-medium ${
                      userManagementTab === "members"
                        ? "bg-[#123047] text-white"
                        : "border border-[#12304722] text-[#123047]"
                    }`}
                  >
                    จัดการสมาชิก
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserManagementTab("approvals")}
                    className={`rounded-xl px-3 py-2 text-sm font-medium ${
                      userManagementTab === "approvals"
                        ? "bg-[#123047] text-white"
                        : "border border-[#12304722] text-[#123047]"
                    }`}
                  >
                    อนุมัติคำขอ ({pendingRequests.length})
                  </button>
                </div>

                {userManagementTab === "approvals" ? (
                  <div className="mt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-medium text-[#123047]">
                        รายการคำขอสมัครสมาชิก
                      </div>
                      <button
                        type="button"
                        onClick={loadPendingRequests}
                        className="rounded-xl border border-[#12304733] px-3 py-1 text-xs text-[#123047]"
                      >
                        รีเฟรชคำขอ
                      </button>
                    </div>
                    <div className="space-y-2">
                      {pendingRequests.length ? (
                        pendingRequests.map((request) => (
                          <div
                            key={request.id}
                            className="rounded-xl border border-[#e4edf3] bg-[#f9fcfe] p-3 text-sm"
                          >
                            <div className="font-medium text-[#123047]">{request.displayName}</div>
                            <div className="text-xs text-[#5f7486]">
                              {request.username} · {formatRoleLabel(request.role)} ·{" "}
                              {snapshot.units.find((unit) => unit.id === request.unitId)?.name ??
                                request.unitId}
                            </div>
                            <div className="mt-1 text-xs text-[#7a8b99]">
                              ขอเมื่อ {formatDateTime(request.requestedAt)}
                            </div>
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                onClick={() => reviewRequest(request.id, true)}
                                className="rounded-xl bg-[#0f766e] px-3 py-1.5 text-xs font-medium text-white"
                              >
                                อนุมัติ
                              </button>
                              <button
                                type="button"
                                onClick={() => reviewRequest(request.id, false)}
                                className="rounded-xl bg-[#9f1239] px-3 py-1.5 text-xs font-medium text-white"
                              >
                                ไม่อนุมัติ
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-[#6f8190]">ไม่มีคำขอค้างอนุมัติ</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 rounded-2xl border border-[#dbe7ef] bg-[#f9fcfe] p-4">
                      <div className="text-sm font-medium text-[#123047]">
                        เพิ่มสมาชิกใหม่ ({isAdmin ? "Admin" : "Case Manager"})
                      </div>
                      <div className="mt-3 grid gap-2">
                        <input
                          value={newUserDraft.username}
                          onChange={(event) =>
                            setNewUserDraft((prev) => ({ ...prev, username: event.target.value }))
                          }
                          placeholder="username"
                          className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-sm outline-none"
                        />
                        <input
                          value={newUserDraft.displayName}
                          onChange={(event) =>
                            setNewUserDraft((prev) => ({ ...prev, displayName: event.target.value }))
                          }
                          placeholder="ชื่อที่แสดง"
                          className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-sm outline-none"
                        />
                        <input
                          type="password"
                          value={newUserDraft.password}
                          onChange={(event) =>
                            setNewUserDraft((prev) => ({ ...prev, password: event.target.value }))
                          }
                          placeholder="รหัสผ่าน"
                          className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-sm outline-none"
                        />
                        <select
                          value={newUserDraft.role}
                          onChange={(event) =>
                            setNewUserDraft((prev) => ({
                              ...prev,
                              role: event.target.value as UserRole,
                            }))
                          }
                          className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-sm outline-none"
                        >
                          {manageableRoleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={newUserDraft.unitId}
                          onChange={(event) =>
                            setNewUserDraft((prev) => ({ ...prev, unitId: event.target.value }))
                          }
                          className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-sm outline-none"
                        >
                          {snapshot.units.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.name}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2 text-xs text-[#5f7486]">
                          <input
                            type="checkbox"
                            checked={newUserDraft.active}
                            onChange={(event) =>
                              setNewUserDraft((prev) => ({ ...prev, active: event.target.checked }))
                            }
                          />
                          เปิดใช้งานทันที
                        </label>
                        <button
                          type="button"
                          onClick={createUserByAdminAction}
                          className="rounded-xl bg-[#123047] px-3 py-2 text-sm font-medium text-white"
                        >
                          เพิ่มสมาชิก
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {snapshot.users.map((user) => {
                        const isEditingThisUser = editingUserId === user.id;
                        return (
                          <div
                            key={user.id}
                            className="rounded-2xl bg-white px-4 py-3 text-sm text-[#123047]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-medium">{user.displayName}</div>
                                <div className="text-xs text-[#6f8190]">
                                  {user.username} · {formatRoleLabel(user.role)} ·{" "}
                                  {user.active ? "Active" : "Inactive"}
                                </div>
                                <div className="mt-1 text-xs text-[#7a8b99]">
                                  {snapshot.units.find((unit) => unit.id === user.unitId)?.name ?? user.unitId}
                                </div>
                              </div>
                              {user.id === sessionUser?.id ? (
                                <span className="rounded-full border border-[#d9e5ec] px-2 py-1 text-[11px] text-[#6f8190]">
                                  บัญชีปัจจุบัน
                                </span>
                              ) : null}
                            </div>
                            {isEditingThisUser ? (
                              <div className="mt-3 grid gap-2 rounded-2xl border border-[#dbe7ef] bg-[#f9fcfe] p-3">
                                <input
                                  value={editingUserDraft.username}
                                  onChange={(event) =>
                                    setEditingUserDraft((prev) => ({
                                      ...prev,
                                      username: event.target.value,
                                    }))
                                  }
                                  placeholder="username"
                                  className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-sm outline-none"
                                />
                                <input
                                  value={editingUserDraft.displayName}
                                  onChange={(event) =>
                                    setEditingUserDraft((prev) => ({
                                      ...prev,
                                      displayName: event.target.value,
                                    }))
                                  }
                                  placeholder="ชื่อที่แสดง"
                                  className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-sm outline-none"
                                />
                                <select
                                  value={editingUserDraft.role}
                                  onChange={(event) =>
                                    setEditingUserDraft((prev) => ({
                                      ...prev,
                                      role: event.target.value as UserRole,
                                    }))
                                  }
                                  className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-sm outline-none"
                                >
                                  {manageableRoleOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={editingUserDraft.unitId}
                                  onChange={(event) =>
                                    setEditingUserDraft((prev) => ({
                                      ...prev,
                                      unitId: event.target.value,
                                    }))
                                  }
                                  className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-sm outline-none"
                                >
                                  {snapshot.units.map((unit) => (
                                    <option key={unit.id} value={unit.id}>
                                      {unit.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="password"
                                  value={editingUserDraft.password}
                                  onChange={(event) =>
                                    setEditingUserDraft((prev) => ({
                                      ...prev,
                                      password: event.target.value,
                                    }))
                                  }
                                  placeholder="รหัสผ่านใหม่ ถ้าไม่เปลี่ยนให้เว้นว่าง"
                                  className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-sm outline-none"
                                />
                                <label className="flex items-center gap-2 text-xs text-[#5f7486]">
                                  <input
                                    type="checkbox"
                                    checked={editingUserDraft.active}
                                    onChange={(event) =>
                                      setEditingUserDraft((prev) => ({
                                        ...prev,
                                        active: event.target.checked,
                                      }))
                                    }
                                  />
                                  เปิดใช้งานบัญชีนี้
                                </label>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={saveEditingUser}
                                    className="rounded-xl bg-[#123047] px-3 py-2 text-xs font-medium text-white"
                                  >
                                    บันทึกข้อมูล
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingUserId("")}
                                    className="rounded-xl border border-[#12304733] px-3 py-2 text-xs text-[#123047]"
                                  >
                                    ยกเลิก
                                  </button>
                                </div>
                              </div>
                            ) : null}
                            {canManageUsers && user.id !== sessionUser?.id ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEditingUser(user)}
                                  className="rounded-xl border border-[#12304733] px-2 py-1 text-xs text-[#123047]"
                                >
                                  แก้ไข
                                </button>
                                <button
                                  type="button"
                                  onClick={() => quickToggleUserActive(user.id, !user.active)}
                                  className="rounded-xl border border-[#12304733] px-2 py-1 text-xs text-[#123047]"
                                >
                                  {user.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeUser(user.id)}
                                  className="rounded-xl border border-[#9f123933] px-2 py-1 text-xs text-[#9f1239]"
                                >
                                  ลบสมาชิก
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
        </Box>
      ) : null}

      <LoadingProgressOverlay
        active={working}
        title="กำลังโหลดแดชบอร์ด palliative"
        detail="กำลังบันทึกข้อมูลและรีเฟรชผลลัพธ์ล่าสุด"
      />
    </main>
  );
}
