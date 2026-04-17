"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoadingProgressOverlay } from "@/components/loading-progress-overlay";
import type {
  AppSnapshot,
  AuthSessionUser,
  CandidateFilterMode,
  CommentAudience,
  HosCandidate,
  PendingUserRequest,
  PalliativePatient,
  UserRole,
  VisitChecklist,
} from "@/lib/types";
import { formatRoleLabel, REQUIRED_COMPLETE_VISITS } from "@/lib/rules";

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

type ImportSource = "REP" | "STM";

type ImportFileOption = {
  source: ImportSource;
  name: string;
  fullPath: string;
  size: number;
  modifiedAt: string;
};

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
  { value: "hospital_pcu", label: "PCU โรงพยาบาล" },
  { value: "unit_manager", label: "หัวหน้าหน่วย" },
  { value: "unit_nurse", label: "พยาบาลหน่วย" },
];

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
  if (!response.ok) throw new Error(text || "Request failed");
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
}: {
  initialSnapshot: AppSnapshot;
}) {
  const router = useRouter();
  const initialUser = initialSnapshot.users[1] ?? initialSnapshot.users[0];
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
  const [visitFiles, setVisitFiles] = useState<FileList | null>(null);
  const [visitFileInputKey, setVisitFileInputKey] = useState(0);
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
  const [loginUsername, setLoginUsername] = useState("hosadmin");
  const [loginPassword, setLoginPassword] = useState("admin123");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerDisplayName, setRegisterDisplayName] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerRole, setRegisterRole] = useState<UserRole>("unit_nurse");
  const [registerUnitId, setRegisterUnitId] = useState(
    initialSnapshot.units.find((unit) => unit.kind !== "hospital")?.id ?? "",
  );
  const [pendingRequests, setPendingRequests] = useState<PendingUserRequest[]>([]);
  const [newUserDraft, setNewUserDraft] = useState({
    username: "",
    displayName: "",
    password: "",
    role: "unit_nurse" as UserRole,
    unitId: initialSnapshot.units.find((unit) => unit.kind !== "hospital")?.id ?? "",
    active: true,
  });

  const refresh = async () => {
    const nextSnapshot = (await requestJson("/api/app", undefined, authToken)) as AppSnapshot;
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  };
  const currentUser =
    snapshot.users.find((user) => user.id === (sessionUser?.id ?? activeUserId)) ??
    snapshot.users.find((user) => user.id === activeUserId) ??
    snapshot.users[0];
  const isHospitalBoard =
    currentUser?.role === "hospital_admin" ||
    currentUser?.role === "hospital_case_manager";
  const isCaseManager = currentUser?.role === "hospital_case_manager";
  const visiblePatients = useMemo(
    () =>
      isHospitalBoard
        ? snapshot.patients
        : snapshot.patients.filter(
            (patient) => patient.assignedUnitId === currentUser?.unitId,
          ),
    [currentUser?.unitId, isHospitalBoard, snapshot.patients],
  );
  const selectedPatient =
    visiblePatients.find((patient) => patient.id === selectedPatientId) ??
    visiblePatients[0];
  const selectedVisits = snapshot.visits.filter(
    (visit) => visit.patientId === selectedPatient?.id,
  );
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
  const canApproveUsers =
    sessionUser?.role === "hospital_admin" ||
    sessionUser?.role === "hospital_case_manager";
  const isAdmin = sessionUser?.role === "hospital_admin";
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
      if (patient.nextVisitAt && completed.length < 6) {
        rounds[completed.length] = patient.nextVisitAt;
      }
      return {
        order: index + 1,
        patient,
        rounds,
      };
    });
  }, [snapshot.visits, visiblePatients]);

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
      if (nextUser.role === "hospital_case_manager") {
        router.push("/case-manager");
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
    if (!sessionUser || !authToken || !isAdmin) return;
    if (
      !newUserDraft.username.trim() ||
      !newUserDraft.displayName.trim() ||
      !newUserDraft.password.trim() ||
      !newUserDraft.unitId
    ) {
      setNotice("กรุณากรอกข้อมูลผู้ใช้ใหม่ให้ครบ");
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
    if (!sessionUser || !authToken || !isAdmin) return;
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

  const removeUser = (targetUserId: string) => {
    if (!sessionUser || !authToken || !isAdmin) return;
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
    setVisitFiles(null);
    setVisitFileInputKey((value) => value + 1);
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
          const nextSnapshot = await refresh();
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
    if (!visitFiles?.length) {
      setNotice("กรุณาแนบภาพผู้ป่วยอย่างน้อย 1 รูป");
      return;
    }

    const photos = await filesToPayload(visitFiles);
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
            photos,
          }),
        }),
      "บันทึกการเยี่ยมแล้ว",
      () => {
        setVisitChecklist(defaultVisitChecklistState);
        setVisitFiles(null);
        setVisitFileInputKey((value) => value + 1);
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
          <p className="mt-2 text-xs text-white/75">
            บัญชีเริ่มต้น: `hosadmin` รหัสผ่าน `admin123`
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
                {roleOptions.map((option) => (
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="rounded-[2.4rem] bg-[linear-gradient(135deg,#0c3148_0%,#104a61_46%,#cfe9e8_100%)] p-6 text-white shadow-[0_30px_80px_rgba(6,29,43,0.22)] sm:p-8">
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
              ไปจนถึงสรุป STM เพื่อแบ่งเงินแต่ละหน่วย
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
                  <button
                    type="button"
                    onClick={() => router.push("/case-manager")}
                    className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-xs text-white"
                  >
                    ไปหน้า Case Manager
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/case-manager/registry")}
                    className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-xs text-white"
                  >
                    ไปหน้าทะเบียนเคส
                  </button>
                </div>
              ) : null}
            </div>
            {notice ? (
              <div className="mt-3 text-sm text-white/90">{notice}</div>
            ) : null}
          </div>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.6rem] border border-white/20 bg-white/12 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/70">
              ทะเบียนทั้งหมด
            </div>
            <div className="mt-3 text-3xl font-semibold">
              {snapshot.dashboard.registeredCount}
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-white/20 bg-white/12 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/70">
              ครบเงื่อนไขเบิก
            </div>
            <div className="mt-3 text-3xl font-semibold">
              {snapshot.dashboard.claimReadyCount}
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-white/20 bg-white/12 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/70">
              เยี่ยมใน 7 วัน
            </div>
            <div className="mt-3 text-3xl font-semibold">
              {snapshot.dashboard.dueThisWeek}
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-white/20 bg-white/12 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/70">
              Opioid / STM
            </div>
            <div className="mt-3 text-3xl font-semibold">
              {snapshot.dashboard.opioidCount} / {snapshot.stmBatches.length}
            </div>
          </div>
        </div>
      </header>

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

      {isHospitalBoard && !isCaseManager ? (
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
                  <select
                    value={registerUnitId}
                    onChange={(event) => setRegisterUnitId(event.target.value)}
                    className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  >
                    {snapshot.units
                      .filter((unit) => unit.kind !== "hospital")
                      .map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                  </select>
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
      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Box
          title={
            isHospitalBoard
              ? "ทะเบียนผู้ป่วยทั้งเครือข่าย"
              : "ผู้ป่วยในหน่วยของฉัน"
          }
          note="คลิกแต่ละแถวเพื่อเปิดรายละเอียดเคสและประวัติการเยี่ยม"
        >
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
                  {visiblePatients.map((patient) => (
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
                  ))}
                </tbody>
              </table>
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
                    {visitSixTableRows.length ? (
                      visitSixTableRows.slice(0, 20).map((row) => (
                        <tr
                          key={row.patient.id}
                          className={`border-t border-[#edf3f7] ${selectedPatient?.id === row.patient.id ? "bg-[#eaf6ff]" : "bg-white hover:bg-[#f8fbfd]"}`}
                        >
                          <td className="px-4 py-3 text-[#123047]">
                            {row.order}
                          </td>
                          <td
                            className="cursor-pointer px-4 py-3 text-[#123047]"
                            onClick={() => selectPatient(row.patient)}
                          >
                            <div className="font-medium">
                              {row.patient.fullName}
                            </div>
                            <div className="text-xs text-[#6f8190]">
                              HN {row.patient.hn}
                            </div>
                          </td>
                          {row.rounds.map((date, index) => (
                            <td
                              key={`${row.patient.id}-${index}`}
                              className="px-4 py-3 text-[#123047]"
                            >
                              {date ? formatRoundDate(date) : "-"}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-8 text-center text-[#6f8190]"
                        >
                          ยังไม่มีข้อมูลตารางเยี่ยมบ้านในมุมมองนี้
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
                  <select
                    value={patientDraft.assignedUnitId}
                    onChange={(event) =>
                      setPatientDraft((draft) => ({
                        ...draft,
                        assignedUnitId: event.target.value,
                      }))
                    }
                    className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none sm:col-span-2"
                  >
                    {snapshot.units
                      .filter((unit) => unit.kind !== "hospital")
                      .map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                  </select>
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
                  <input
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
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
                </div>
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
          note="การบันทึกเยี่ยมต้องมี Authen code อาการติดตาม และภาพผู้ป่วยทุกครั้ง เพื่อให้ข้อมูลครบพร้อมเบิก"
        >
          <div className="space-y-6">
            {selectedPatient ? (
              <>
                <div className="rounded-[1.5rem] bg-[#f7fbfd] p-5">
                  <div className="mb-4 rounded-[1.3rem] border border-[#0f766e22] bg-[#ebfaf6] p-4 text-sm leading-7 text-[#0b4d47]">
                    ก่อนบันทึกการเยี่ยม ต้องมี 4 อย่างทุกครั้ง: วันที่เยี่ยม,
                    Authen code, อาการติดตาม และภาพผู้ป่วยอย่างน้อย 1 รูป
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
                    <input
                      key={visitFileInputKey}
                      type="file"
                      multiple
                      accept="image/*"
                      capture="environment"
                      onChange={(event) => setVisitFiles(event.target.files)}
                      className="rounded-2xl border border-dashed border-[#c9d9e3] bg-white px-4 py-3 text-sm outline-none sm:col-span-2"
                    />
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
                </div>
                <div className="space-y-3">
                  {selectedVisits.length ? (
                    selectedVisits.map((visit) => (
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
                        {visit.photos.length ? (
                          <div className="mt-3 flex flex-wrap gap-3">
                            {visit.photos.map((photo) => (
                              <Image
                                key={photo.id}
                                src={photo.url}
                                alt={photo.fileName}
                                width={80}
                                height={80}
                                unoptimized
                                className="h-20 w-20 rounded-2xl object-cover"
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))
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

      <Box
        title="ผู้ใช้งานและ STM/REP"
        note="ตั้งชื่อผู้ใช้พื้นฐาน และนำเข้าข้อมูลการเงินเพื่อแบ่งยอดให้แต่ละหน่วย"
      >
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
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
            {canApproveUsers ? (
              <div className="mt-4 rounded-2xl border border-[#dbe7ef] bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium text-[#123047]">
                    คำขอสมัครสมาชิก ({pendingRequests.length})
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
            ) : null}

            {isAdmin ? (
              <div className="mt-4 rounded-2xl border border-[#dbe7ef] bg-white p-4">
                <div className="text-sm font-medium text-[#123047]">เพิ่มผู้ใช้ใหม่ (Admin)</div>
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
                      setNewUserDraft((prev) => ({ ...prev, role: event.target.value as UserRole }))
                    }
                    className="rounded-xl border border-[#d9e5ec] px-3 py-2 text-sm outline-none"
                  >
                    {roleOptions.map((option) => (
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
                    เพิ่มผู้ใช้
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {snapshot.users.map((user) => (
                <div
                  key={user.id}
                  className="rounded-2xl bg-white px-4 py-3 text-sm text-[#123047]"
                >
                  <div className="font-medium">{user.displayName}</div>
                  <div className="text-xs text-[#6f8190]">
                    {user.username} · {formatRoleLabel(user.role)} ·{" "}
                    {user.active ? "Active" : "Inactive"}
                  </div>
                  {isAdmin && user.id !== sessionUser?.id ? (
                    <div className="mt-2 flex gap-2">
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
                        ลบ
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[1.5rem] bg-[#fff9ef] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium text-[#123047]">
                  นำเข้า REP / STM
                </div>
                <div className="mt-1 text-sm text-[#6f8190]">
                  รูปแบบ `HN,ชื่อ,ยอดเงิน,unitId,claimMonth,note`
                  และตั้งเปอร์เซ็นต์แบ่งให้หน่วยได้
                </div>
              </div>
              <input
                type="number"
                value={stmPercent}
                onChange={(event) =>
                  setStmPercent(Number.parseInt(event.target.value || "50", 10))
                }
                className="w-24 rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
            </div>
            <div className="mt-4 grid gap-3">
              <div className="grid gap-3 rounded-2xl border border-[#e7d5aa] bg-[#fff4dc] p-4 sm:grid-cols-[0.28fr_0.42fr_0.3fr]">
                <select
                  value={importSource}
                  onChange={(event) => {
                    setImportSource(event.target.value as ImportSource);
                    setImportFiles([]);
                    setSelectedImportPath("");
                  }}
                  className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                >
                  <option value="REP">โฟลเดอร์ REP</option>
                  <option value="STM">โฟลเดอร์ STM</option>
                </select>
                <select
                  value={selectedImportPath}
                  onChange={(event) =>
                    setSelectedImportPath(event.target.value)
                  }
                  className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                >
                  <option value="">เลือกไฟล์จากโฟลเดอร์</option>
                  {importFiles.map((file) => (
                    <option key={file.fullPath} value={file.fullPath}>
                      {file.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={loadImportFiles}
                    className="w-full rounded-2xl border border-[#12304744] bg-white px-3 py-3 text-sm font-medium text-[#123047]"
                  >
                    โหลดรายชื่อไฟล์
                  </button>
                  <button
                    type="button"
                    onClick={readSelectedImportFile}
                    className="w-full rounded-2xl bg-[#123047] px-3 py-3 text-sm font-medium text-white"
                  >
                    อ่านไฟล์
                  </button>
                </div>
              </div>
              <input
                value={stmFileName}
                onChange={(event) => setStmFileName(event.target.value)}
                className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
              <input
                type="file"
                accept=".csv,.txt,.rep,.stm,.xls,.xlsx"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setStmFileName(file.name);
                  void file.text().then((text) => setStmText(text));
                }}
                className="rounded-2xl border border-dashed border-[#c9d9e3] bg-white px-4 py-3 text-sm"
              />
              <textarea
                value={stmText}
                onChange={(event) => setStmText(event.target.value)}
                rows={6}
                className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
              <button
                type="button"
                onClick={importStm}
                className="rounded-2xl bg-[#8c6a19] px-5 py-3 text-sm font-medium text-white"
              >
                นำเข้าข้อมูลการเงิน
              </button>
            </div>
            {latestStm ? (
              <div className="mt-4 space-y-2">
                {latestStm.allocations.map((allocation) => (
                  <div
                    key={allocation.unitId}
                    className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm"
                  >
                    <div>
                      <div className="font-medium text-[#123047]">
                        {allocation.unitName}
                      </div>
                      <div className="text-xs text-[#6f8190]">
                        {allocation.rowCount} รายการ · {allocation.percent}%
                      </div>
                    </div>
                    <div className="text-right text-[#123047]">
                      <div className="font-medium">
                        {formatMoney(allocation.allocatedAmount)}
                      </div>
                      <div className="text-xs text-[#6f8190]">
                        จากทั้งหมด {formatMoney(allocation.totalAmount)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Box>

      <LoadingProgressOverlay
        active={working}
        title="กำลังโหลดแดชบอร์ด palliative"
        detail="กำลังบันทึกข้อมูลและรีเฟรชผลลัพธ์ล่าสุด"
      />
    </main>
  );
}
