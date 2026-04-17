"use client";

import Link from "next/link";
import { startTransition, useMemo, useState } from "react";
import { LoadingProgressOverlay } from "@/components/loading-progress-overlay";
import { describeEligibility, formatRoleLabel, toDateKey } from "@/lib/rules";
import type { AppSnapshot, HosCandidate, PalliativePatient } from "@/lib/types";

type StatusFilter = "all" | "in_progress" | PalliativePatient["careStatus"];
type RegistryPageMode = "all" | "in_progress" | "completed";

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function compareText(a: string, b: string) {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function statusLabel(status: PalliativePatient["careStatus"]) {
  if (status === "registered") return "ลงทะเบียนแล้ว";
  if (status === "scheduled") return "นัดเยี่ยม";
  if (status === "active") return "กำลังติดตาม";
  if (status === "completed") return "ครบเกณฑ์";
  if (status === "deceased") return "เสียชีวิต";
  if (status === "cancelled") return "ยกเลิก";
  return "รอคัดกรอง";
}

function statusClass(status: PalliativePatient["careStatus"]) {
  if (status === "cancelled") {
    return "border-[#ef476f55] bg-[#ef476f22] text-[#8d1d3e]";
  }
  if (status === "completed") {
    return "border-[#74c69d55] bg-[#74c69d22] text-[#0f5132]";
  }
  if (status === "active" || status === "scheduled" || status === "registered") {
    return "border-[#4ea8de55] bg-[#4ea8de22] text-[#123047]";
  }
  return "border-[#d6e0e7] bg-[#f6f9fb] text-[#6f8190]";
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
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

function buildManualCandidate(
  input: {
    hn: string;
    cid: string;
    fullName: string;
    age: number;
    sex: "M" | "F";
    primaryDxCode: string;
    primaryDxName: string;
    phone?: string;
    address?: string;
    assignedUnitId: string;
  },
  unitMeta?: { name: string; shortName: string },
): HosCandidate {
  const dxCode = input.primaryDxCode.toUpperCase().replaceAll(".", "").trim();
  return {
    hn: input.hn.trim(),
    cid: input.cid.trim(),
    fullName: input.fullName.trim(),
    age: Number.isFinite(input.age) ? input.age : 0,
    sex: input.sex,
    unitId: input.assignedUnitId,
    clinicName: unitMeta?.name ?? "ลงทะเบียนด้วยมือ",
    clinicShortName: unitMeta?.shortName ?? "manual",
    primaryDxCode: dxCode,
    primaryDxName: input.primaryDxName.trim() || dxCode,
    phone: input.phone?.trim() || undefined,
    address: input.address?.trim() || undefined,
    visitDate: toDateKey(),
    lastServiceAt: undefined,
    serviceCount: 0,
    incompleteVisitCount: 0,
    eligibleReason: describeEligibility(dxCode),
    claimChecklist: {
      diagZ515: false,
      diagZ718: false,
      adp30001: false,
      eva001: false,
      cons01: false,
      hasAuthentication: false,
      hasHomeVisitReport: false,
      hasPhoto: false,
      opioidEligible: false,
      readyForClaim: false,
    },
  };
}

export function CaseManagerRegistryWorkspace({
  initialSnapshot,
  defaultStatusFilter = "all",
  pageMode = "all",
}: {
  initialSnapshot: AppSnapshot;
  defaultStatusFilter?: StatusFilter;
  pageMode?: RegistryPageMode;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const managerUsers = useMemo(
    () =>
      snapshot.users.filter(
        (user) =>
          user.role === "hospital_case_manager" || user.role === "hospital_admin",
      ),
    [snapshot.users],
  );
  const [activeUserId, setActiveUserId] = useState(managerUsers[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(defaultStatusFilter);
  const [unitFilter, setUnitFilter] = useState("all");
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [editDraft, setEditDraft] = useState({
    assignedUnitId:
      initialSnapshot.units.find((unit) => unit.kind !== "hospital")?.id ?? "",
    nextVisitAt: initialSnapshot.currentDate,
    phone: "",
    relativePhone: "",
    lineId: "",
    notes: "",
  });
  const [cancelReason, setCancelReason] = useState("ยกเลิกการลงทะเบียน");

  const [createDraft, setCreateDraft] = useState({
    hn: "",
    cid: "",
    fullName: "",
    age: "",
    sex: "F" as "M" | "F",
    primaryDxCode: "",
    primaryDxName: "",
    assignedUnitId:
      initialSnapshot.units.find((unit) => unit.kind !== "hospital")?.id ?? "",
    nextVisitAt: initialSnapshot.currentDate,
    phone: "",
    address: "",
    note: "ลงทะเบียนจากหน้า Case Manager (จัดการทะเบียน)",
  });

  const currentUser =
    managerUsers.find((user) => user.id === activeUserId) ?? managerUsers[0];

  const unitOptions = snapshot.units.filter((unit) => unit.kind !== "hospital");
  const unitById = new Map(unitOptions.map((unit) => [unit.id, unit] as const));

  const patients = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return snapshot.patients
      .filter((patient) => {
        if (
          statusFilter === "in_progress" &&
          !["registered", "scheduled", "active"].includes(patient.careStatus)
        ) {
          return false;
        }
        if (
          statusFilter !== "all" &&
          statusFilter !== "in_progress" &&
          patient.careStatus !== statusFilter
        ) {
          return false;
        }
        if (unitFilter !== "all" && patient.assignedUnitId !== unitFilter) return false;
        if (!keyword) return true;
        const haystack =
          `${patient.hn} ${patient.cid} ${patient.fullName} ${patient.primaryDxCode} ${patient.assignedUnitName}`.toLowerCase();
        return haystack.includes(keyword);
      })
      .sort(
        (a, b) =>
          compareText(b.registeredAt ?? "", a.registeredAt ?? "") ||
          (a.id - b.id),
      );
  }, [snapshot.patients, search, statusFilter, unitFilter]);

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId);

  const refresh = async (preferredId?: number | null) => {
    const nextSnapshot = (await requestJson("/api/app")) as AppSnapshot;
    setSnapshot(nextSnapshot);
    const nextId =
      preferredId ??
      selectedPatientId ??
      nextSnapshot.patients[0]?.id ??
      null;
    setSelectedPatientId(nextId);
    const found = nextSnapshot.patients.find((patient) => patient.id === nextId);
    if (found) {
      setEditDraft({
        assignedUnitId: found.assignedUnitId,
        nextVisitAt: found.nextVisitAt ?? nextSnapshot.currentDate,
        phone: found.phone ?? "",
        relativePhone: found.relativePhone ?? "",
        lineId: found.lineId ?? "",
        notes: found.notes ?? "",
      });
    }
    return nextSnapshot;
  };

  const selectPatient = (patient: PalliativePatient) => {
    setSelectedPatientId(patient.id);
    setEditDraft({
      assignedUnitId: patient.assignedUnitId,
      nextVisitAt: patient.nextVisitAt ?? snapshot.currentDate,
      phone: patient.phone ?? "",
      relativePhone: patient.relativePhone ?? "",
      lineId: patient.lineId ?? "",
      notes: patient.notes ?? "",
    });
  };

  const savePatch = () => {
    if (!selectedPatient) {
      setNotice("กรุณาเลือกคนไข้ที่ต้องการแก้ไข");
      return;
    }
    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void requestJson(`/api/registry/${selectedPatient.id}`, {
        method: "PATCH",
        body: JSON.stringify(editDraft),
      })
        .then(async () => {
          await refresh(selectedPatient.id);
          setNotice("บันทึกข้อมูลคนไข้เรียบร้อย");
        })
        .catch((error) =>
          setNotice(error instanceof Error ? error.message : "บันทึกข้อมูลไม่สำเร็จ"),
        )
        .finally(() => setWorking(false));
    });
  };

  const cancelRegistration = () => {
    if (!selectedPatient) {
      setNotice("กรุณาเลือกคนไข้ก่อนยกเลิก");
      return;
    }
    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void requestJson(`/api/registry/${selectedPatient.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({
          reason: cancelReason.trim() || "ยกเลิกการลงทะเบียน",
        }),
      })
        .then(async () => {
          await refresh(selectedPatient.id);
          setNotice("ยกเลิกการลงทะเบียนแล้ว");
        })
        .catch((error) =>
          setNotice(error instanceof Error ? error.message : "ยกเลิกไม่สำเร็จ"),
        )
        .finally(() => setWorking(false));
    });
  };

  const createPatient = () => {
    if (!currentUser) {
      setNotice("ไม่พบผู้ใช้งาน Case Manager");
      return;
    }
    if (!createDraft.hn.trim() || !createDraft.fullName.trim() || !createDraft.primaryDxCode.trim()) {
      setNotice("กรุณากรอก HN, ชื่อ และรหัสโรคหลัก");
      return;
    }
    if (!createDraft.nextVisitAt) {
      setNotice("กรุณาระบุวันนัดเยี่ยม");
      return;
    }

    const unit = unitById.get(createDraft.assignedUnitId);
    if (!unit) {
      setNotice("ไม่พบหน่วยรับผิดชอบ");
      return;
    }

    const candidate = buildManualCandidate(
      {
        hn: createDraft.hn,
        cid: createDraft.cid || createDraft.hn,
        fullName: createDraft.fullName,
        age: Number.parseInt(createDraft.age || "0", 10) || 0,
        sex: createDraft.sex,
        primaryDxCode: createDraft.primaryDxCode,
        primaryDxName: createDraft.primaryDxName || createDraft.primaryDxCode,
        phone: createDraft.phone,
        address: createDraft.address,
        assignedUnitId: createDraft.assignedUnitId,
      },
      { name: unit.name, shortName: unit.shortName },
    );

    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void requestJson("/api/registry/register", {
        method: "POST",
        body: JSON.stringify({
          candidate,
          nextVisitAt: createDraft.nextVisitAt,
          assignedUnitId: createDraft.assignedUnitId,
          note: createDraft.note,
          userId: currentUser.id,
        }),
      })
        .then(async () => {
          const next = await refresh();
          const added = next.patients.find(
            (patient) => patient.hn === candidate.hn || patient.cid === candidate.cid,
          );
          if (added) {
            selectPatient(added);
          }
          setNotice("เพิ่มคนไข้เข้าทะเบียนเรียบร้อย");
        })
        .catch((error) =>
          setNotice(error instanceof Error ? error.message : "เพิ่มคนไข้ไม่สำเร็จ"),
        )
        .finally(() => setWorking(false));
    });
  };

  const syncCompletedCasesFromHosxp = () => {
    if (!currentUser) {
      setNotice("ไม่พบผู้ใช้งาน Case Manager");
      return;
    }
    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void requestJson("/api/candidates/progress", {
        method: "POST",
        body: JSON.stringify({
          clinic: unitFilter === "all" ? "all" : unitFilter,
          userId: currentUser.id,
        }),
      })
        .then(async (payload) => {
          const result = payload as {
            importedCompleted?: number;
            importedInProgress?: number;
            completedCount?: number;
            inProgressCount?: number;
          };
          await refresh();
          setStatusFilter(pageMode === "completed" ? "completed" : "in_progress");
          setNotice(
            `ซิงก์จาก HOSxP แล้ว: เพิ่ม/อัปเดตเคสครบเกณฑ์ ${Number(result.importedCompleted ?? 0)} ราย · กำลังเยี่ยม ${Number(result.importedInProgress ?? 0)} ราย`,
          );
        })
        .catch((error) =>
          setNotice(
            error instanceof Error
              ? error.message
              : "ซิงก์เคสเยี่ยมครบจาก HOSxP ไม่สำเร็จ",
          ),
        )
        .finally(() => setWorking(false));
    });
  };

  if (!managerUsers.length) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[1.8rem] border border-[rgba(20,55,84,0.12)] bg-white p-6 shadow-[0_20px_50px_rgba(8,33,51,0.08)]">
          <h1 className="text-2xl font-semibold text-[#123047]">
            จัดการทะเบียนคนไข้ (Case Manager)
          </h1>
          <p className="mt-2 text-sm text-[#5f7486]">
            ยังไม่พบผู้ใช้บทบาท Case Manager ในระบบ
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-2xl bg-[#123047] px-4 py-2.5 text-sm font-medium text-white"
          >
            กลับหน้าหลัก
          </Link>
        </section>
      </main>
    );
  }

  const pageTitle =
    pageMode === "completed"
      ? "ตรวจสอบเคสเยี่ยมครบเกณฑ์"
      : pageMode === "in_progress"
        ? "ตรวจสอบเคสกำลังเยี่ยม"
        : "จัดการทะเบียนคนไข้ทั้งหมด";
  const pageDescription =
    pageMode === "completed"
      ? "ดูเฉพาะเคสที่เยี่ยมครบเกณฑ์แล้ว แยกจากเคสที่ยังติดตามอยู่"
      : pageMode === "in_progress"
        ? "ดูเฉพาะเคสที่กำลังเยี่ยมและยังไม่ครบ 6 ครั้ง พร้อมติดตามวันเยี่ยมย้อนหลัง"
        : "ดูคนไข้ที่ลงทะเบียนแล้วทั้งหมด และจัดการเพิ่ม แก้ไข หรือยกเลิกการลงทะเบียนได้จากหน้าเดียว";
  const syncButtonLabel =
    pageMode === "completed" ? "ดึงเคสเยี่ยมครบจาก HOSxP" : "ดึงเคสกำลังเยี่ยมจาก HOSxP";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="rounded-[2.2rem] bg-[linear-gradient(135deg,#0c3148_0%,#104a61_48%,#d1ece8_100%)] p-6 text-white shadow-[0_30px_80px_rgba(6,29,43,0.22)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/85">
              Case Manager
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              {pageTitle}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
              {pageDescription}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white"
            >
              รีเฟรช
            </button>
            <button
              type="button"
              onClick={syncCompletedCasesFromHosxp}
              className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white"
            >
              {syncButtonLabel}
            </button>
            <Link
              href="/case-manager"
              className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white"
            >
              ไปหน้าคัดเลือกเคส
            </Link>
            <Link
              href="/case-manager/in-progress"
              className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white"
            >
              ดูเคสกำลังเยี่ยม
            </Link>
            <Link
              href="/case-manager/completed"
              className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white"
            >
              ดูเคสเยี่ยมครบ
            </Link>
            <Link
              href="/"
              className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white"
            >
              กลับหน้าหลัก
            </Link>
          </div>
        </div>
      </header>

      <section className="rounded-[1.8rem] border border-[rgba(20,55,84,0.12)] bg-white p-5 shadow-[0_20px_50px_rgba(8,33,51,0.08)]">
        <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <div className="mb-1 text-xs uppercase tracking-[0.2em] text-[#6f8190]">
              ผู้ใช้งาน
            </div>
            <select
              value={activeUserId}
              onChange={(event) => setActiveUserId(event.target.value)}
              className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
            >
              {managerUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} - {formatRoleLabel(user.role)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs uppercase tracking-[0.2em] text-[#6f8190]">
              สถานะคนไข้
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
            >
              <option value="all">ทั้งหมด</option>
              <option value="in_progress">กำลังเยี่ยมทั้งหมด</option>
              <option value="registered">ลงทะเบียนแล้ว</option>
              <option value="scheduled">นัดเยี่ยม</option>
              <option value="active">กำลังติดตาม</option>
              <option value="completed">ครบเกณฑ์</option>
              <option value="cancelled">ยกเลิก</option>
              <option value="deceased">เสียชีวิต</option>
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs uppercase tracking-[0.2em] text-[#6f8190]">
              หน่วยรับผิดชอบ
            </div>
            <select
              value={unitFilter}
              onChange={(event) => setUnitFilter(event.target.value)}
              className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
            >
              <option value="all">ทุกหน่วย</option>
              {unitOptions.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-[1.8rem] border border-[rgba(20,55,84,0.12)] bg-white p-5 shadow-[0_20px_50px_rgba(8,33,51,0.08)]">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหา HN / CID / ชื่อ / Dx"
                className="w-full max-w-[400px] rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              />
              <span className="rounded-full bg-[#eef6fb] px-3 py-1 text-xs text-[#446075]">
                ทั้งหมด {patients.length} รายการ
              </span>
            </div>
            <div className="overflow-hidden rounded-[1.5rem] border border-[#e2edf4]">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f5fafc] text-xs uppercase tracking-[0.2em] text-[#6f8190]">
                    <tr>
                      <th className="px-4 py-4">ผู้ป่วย</th>
                      <th className="px-4 py-4">Dx</th>
                      <th className="px-4 py-4">หน่วย</th>
                      <th className="px-4 py-4">สถานะ</th>
                      <th className="px-4 py-4">นัดเยี่ยม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.length ? (
                      patients.map((patient) => (
                        <tr
                          key={patient.id}
                          className={`cursor-pointer border-t border-[#edf3f7] ${selectedPatientId === patient.id ? "bg-[#eef8f8]" : "hover:bg-[#f8fbfd]"}`}
                          onClick={() => selectPatient(patient)}
                        >
                          <td className="px-4 py-4">
                            <div className="font-medium text-[#123047]">{patient.fullName}</div>
                            <div className="mt-1 text-xs text-[#6f8190]">
                              HN {patient.hn} · CID {patient.cid}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-[#123047]">{patient.primaryDxCode}</td>
                          <td className="px-4 py-4 text-[#123047]">{patient.assignedUnitName}</td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs ${statusClass(patient.careStatus)}`}
                            >
                              {statusLabel(patient.careStatus)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-[#123047]">{formatDate(patient.nextVisitAt)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-[#6f8190]">
                          ไม่พบข้อมูลคนไข้ตามเงื่อนไขที่เลือก
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[1.5rem] border border-[#e2edf4] bg-[#f7fbfd] p-5">
              <div className="text-sm font-semibold text-[#123047]">แก้ไข / ยกเลิกคนไข้ที่เลือก</div>
              {selectedPatient ? (
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-[#e2edf4] bg-white p-3">
                    <div className="font-medium text-[#123047]">{selectedPatient.fullName}</div>
                    <div className="mt-1 text-xs text-[#6f8190]">
                      HN {selectedPatient.hn} · ลงทะเบียน {formatDate(selectedPatient.registeredAt)}
                    </div>
                  </div>

                  <select
                    value={editDraft.assignedUnitId}
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, assignedUnitId: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  >
                    {unitOptions.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={editDraft.nextVisitAt}
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, nextVisitAt: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  />
                  <input
                    value={editDraft.phone}
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, phone: event.target.value }))
                    }
                    placeholder="เบอร์ผู้ป่วย"
                    className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  />
                  <input
                    value={editDraft.relativePhone}
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, relativePhone: event.target.value }))
                    }
                    placeholder="เบอร์ญาติ"
                    className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  />
                  <input
                    value={editDraft.lineId}
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, lineId: event.target.value }))
                    }
                    placeholder="LINE ID"
                    className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  />
                  <textarea
                    value={editDraft.notes}
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, notes: event.target.value }))
                    }
                    rows={3}
                    placeholder="หมายเหตุ"
                    className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={savePatch}
                    className="w-full rounded-2xl bg-[#123047] px-5 py-3 text-sm font-medium text-white"
                  >
                    บันทึกการแก้ไข
                  </button>

                  <input
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={cancelRegistration}
                    className="w-full rounded-2xl border border-[#ef476f55] bg-[#fff0f3] px-5 py-3 text-sm font-medium text-[#8d1d3e]"
                  >
                    ยกเลิกการลงทะเบียน
                  </button>
                </div>
              ) : (
                <div className="mt-3 text-sm text-[#6f8190]">
                  เลือกคนไข้จากตารางก่อนเพื่อแก้ไขหรือยกเลิก
                </div>
              )}
            </div>

            <div className="rounded-[1.5rem] border border-[#e2edf4] bg-white p-5">
              <div className="text-sm font-semibold text-[#123047]">เพิ่มคนไข้เข้าทะเบียน</div>
              <div className="mt-3 space-y-3">
                <input
                  value={createDraft.hn}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({ ...draft, hn: event.target.value }))
                  }
                  placeholder="HN *"
                  className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
                <input
                  value={createDraft.cid}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({ ...draft, cid: event.target.value }))
                  }
                  placeholder="CID (ถ้าไม่กรอกจะใช้ HN)"
                  className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
                <input
                  value={createDraft.fullName}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({ ...draft, fullName: event.target.value }))
                  }
                  placeholder="ชื่อ-นามสกุล *"
                  className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={createDraft.age}
                    onChange={(event) =>
                      setCreateDraft((draft) => ({ ...draft, age: event.target.value }))
                    }
                    placeholder="อายุ"
                    className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  />
                  <select
                    value={createDraft.sex}
                    onChange={(event) =>
                      setCreateDraft((draft) => ({
                        ...draft,
                        sex: event.target.value as "M" | "F",
                      }))
                    }
                    className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                  >
                    <option value="F">หญิง</option>
                    <option value="M">ชาย</option>
                  </select>
                </div>
                <input
                  value={createDraft.primaryDxCode}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({ ...draft, primaryDxCode: event.target.value }))
                  }
                  placeholder="รหัสโรคหลัก (เช่น N185) *"
                  className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
                <input
                  value={createDraft.primaryDxName}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({ ...draft, primaryDxName: event.target.value }))
                  }
                  placeholder="ชื่อโรคหลัก"
                  className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
                <select
                  value={createDraft.assignedUnitId}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({ ...draft, assignedUnitId: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                >
                  {unitOptions.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={createDraft.nextVisitAt}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({ ...draft, nextVisitAt: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
                <input
                  value={createDraft.phone}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({ ...draft, phone: event.target.value }))
                  }
                  placeholder="เบอร์ผู้ป่วย"
                  className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
                <textarea
                  value={createDraft.address}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({ ...draft, address: event.target.value }))
                  }
                  rows={2}
                  placeholder="ที่อยู่"
                  className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
                <textarea
                  value={createDraft.note}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({ ...draft, note: event.target.value }))
                  }
                  rows={2}
                  placeholder="หมายเหตุการลงทะเบียน"
                  className="w-full rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={createPatient}
                  className="w-full rounded-2xl bg-[#0f766e] px-5 py-3 text-sm font-medium text-white"
                >
                  เพิ่มเข้าทะเบียน
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {notice ? (
        <div className="rounded-2xl border border-[#d4e6ef] bg-[#f1f8fc] px-5 py-3 text-sm text-[#22445a]">
          {notice}
        </div>
      ) : null}

      <LoadingProgressOverlay
        active={working}
        title="กำลังโหลดหน้าทะเบียนผู้ป่วย"
        detail="กำลังบันทึกหรือรีเฟรชข้อมูลทะเบียน"
      />
    </main>
  );
}
