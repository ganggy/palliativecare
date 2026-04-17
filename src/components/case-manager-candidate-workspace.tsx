"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { LoadingProgressOverlay } from "@/components/loading-progress-overlay";
import type {
  AppSnapshot,
  CandidateDxGroup,
  CandidateFilterMode,
  HosCandidate,
  CandidateVisitHistory,
  HosProgressSummary,
} from "@/lib/types";
import { formatRoleLabel, REQUIRED_COMPLETE_VISITS } from "@/lib/rules";

const CANDIDATE_PAGE_SIZE = 15;

function candidateModeLabel(mode: CandidateFilterMode) {
  if (mode === "missing_both_z")
    return "ยังไม่เคยลงทั้ง Z51.5 และ Z71.8";
  if (mode === "missing_any_z")
    return "ยังไม่เคยลง Z51.5 หรือ Z71.8 อย่างใดอย่างหนึ่ง";
  if (mode === "z_done_but_visit_incomplete")
    return `ลง Z ครบแล้ว แต่เยี่ยมครบเกณฑ์ยังไม่ถึง ${REQUIRED_COMPLETE_VISITS} ครั้ง`;
  return "ทุกเคสเข้าเกณฑ์";
}

function dxGroupLabel(group: CandidateDxGroup) {
  if (group === "cancer") return "มะเร็ง/เนื้องอก";
  if (group === "stroke-neuro") return "Stroke/ระบบประสาท";
  if (group === "ckd") return "ไตวายระยะท้าย (N18.5)";
  if (group === "copd") return "COPD";
  if (group === "hiv") return "HIV/AIDS";
  if (group === "liver") return "ตับล้มเหลว";
  if (group === "heart") return "หัวใจล้มเหลว";
  if (group === "palliative-z") return "รหัส Z51.5 / Z71.8";
  if (group === "other") return "กลุ่มอื่น";
  return "ทุกกลุ่มโรค";
}

function claimChecklistItems(checklist: HosCandidate["claimChecklist"]) {
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

function formatVisitDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
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

export function CaseManagerCandidateWorkspace({
  initialSnapshot,
}: {
  initialSnapshot: AppSnapshot;
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
  const defaultUser = managerUsers[0];
  const [activeUserId, setActiveUserId] = useState(defaultUser?.id ?? "");
  const [candidateClinic, setCandidateClinic] = useState("all");
  const [candidateMode, setCandidateMode] =
    useState<CandidateFilterMode>("missing_both_z");
  const [candidateDxGroup, setCandidateDxGroup] =
    useState<CandidateDxGroup>("all");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateRows, setCandidateRows] = useState<HosCandidate[]>([]);
  const [candidatePage, setCandidatePage] = useState(1);
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<string[]>(
    [],
  );
  const [selectedCandidateKey, setSelectedCandidateKey] = useState("");
  const [candidateHistoryRows, setCandidateHistoryRows] = useState<
    CandidateVisitHistory[]
  >([]);
  const [selectedHistoryVn, setSelectedHistoryVn] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [registerUnitId, setRegisterUnitId] = useState(
    initialSnapshot.units.find((unit) => unit.kind !== "hospital")?.id ?? "",
  );
  const [registerDate, setRegisterDate] = useState(initialSnapshot.currentDate);
  const [registerNote, setRegisterNote] = useState(
    "มอบหมายเยี่ยมบ้านจากหน้า Case Manager",
  );
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [progressSummary, setProgressSummary] = useState<HosProgressSummary | null>(null);

  const currentUser =
    managerUsers.find((user) => user.id === activeUserId) ?? managerUsers[0];
  const selectedKeySet = useMemo(
    () => new Set(selectedCandidateKeys),
    [selectedCandidateKeys],
  );
  const totalPages = Math.max(
    1,
    Math.ceil(candidateRows.length / CANDIDATE_PAGE_SIZE),
  );
  const currentPage = Math.min(candidatePage, totalPages);
  const pagedCandidates = useMemo(() => {
    const startIndex = (currentPage - 1) * CANDIDATE_PAGE_SIZE;
    return candidateRows.slice(startIndex, startIndex + CANDIDATE_PAGE_SIZE);
  }, [candidateRows, currentPage]);
  const pageCandidateKeys = useMemo(
    () => pagedCandidates.map(candidateRowKey),
    [pagedCandidates],
  );
  const allPageSelected =
    pageCandidateKeys.length > 0 &&
    pageCandidateKeys.every((key) => selectedKeySet.has(key));
  const pageList = buildPageList(currentPage, totalPages);

  const selectedCandidate = candidateRows.find(
    (candidate) => candidateRowKey(candidate) === selectedCandidateKey,
  );
  const selectedHistory = candidateHistoryRows.find(
    (item) => item.vn === selectedHistoryVn,
  );

  useEffect(() => {
    if (candidatePage > totalPages) {
      setCandidatePage(totalPages);
    }
  }, [candidatePage, totalPages]);

  useEffect(() => {
    setWorking(true);
    void requestJson(
      `/api/candidates/progress?clinic=all&maxCacheMinutes=60`,
    )
      .then((payload) => setProgressSummary(payload as HosProgressSummary))
      .finally(() => setWorking(false));
  }, []);

  const loadCandidateHistory = async (hn: string) => {
    setHistoryLoading(true);
    try {
      const rows = (await requestJson(
        `/api/candidates/history?hn=${encodeURIComponent(hn)}&limit=12`,
      )) as CandidateVisitHistory[];
      setCandidateHistoryRows(rows);
      setSelectedHistoryVn(rows[0]?.vn ?? "");
    } catch {
      setCandidateHistoryRows([]);
      setSelectedHistoryVn("");
    } finally {
      setHistoryLoading(false);
    }
  };

  const refresh = async () => {
    const nextSnapshot = (await requestJson("/api/app")) as AppSnapshot;
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  };

  const loadProgressSummary = (forceRefresh = false) => {
    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void requestJson(
        `/api/candidates/progress?clinic=${candidateClinic}&maxCacheMinutes=60${forceRefresh ? "&forceRefresh=1" : ""}`,
      )
        .then((payload) => {
          const summary = payload as HosProgressSummary;
          setProgressSummary(summary);
          setNotice(
            `เคสกำลังเยี่ยม ${summary.inProgressCount} ราย · เคสครบเกณฑ์แล้ว ${summary.completedCount} ราย${summary.fromCache ? " (cache)" : ""}`,
          );
        })
        .catch((error) =>
          setNotice(
            error instanceof Error
              ? error.message
              : "โหลดสรุปเคสกำลังเยี่ยมไม่สำเร็จ",
          ),
        )
        .finally(() => setWorking(false));
    });
  };

  const syncProgressCases = () => {
    if (!currentUser) return;
    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void requestJson("/api/candidates/progress", {
        method: "POST",
        body: JSON.stringify({
          clinic: candidateClinic,
          userId: currentUser.id,
        }),
      })
        .then(async (payload) => {
          const summary = payload as HosProgressSummary;
          setProgressSummary(summary);
          await refresh();
          setNotice(
            `ซิงก์เรียบร้อย: เคสกำลังเยี่ยมนำเข้า ${summary.importedInProgress} ราย · เคสครบเกณฑ์นำเข้า ${summary.importedCompleted} ราย`,
          );
        })
        .catch((error) =>
          setNotice(
            error instanceof Error ? error.message : "ซิงก์ความคืบหน้าไม่สำเร็จ",
          ),
        )
        .finally(() => setWorking(false));
    });
  };

  const loadCandidates = () => {
    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void (async () => {
        const finalRows = (await requestJson(
          `/api/candidates?clinic=${candidateClinic}&mode=${candidateMode}&dxGroup=${candidateDxGroup}&search=${encodeURIComponent(candidateSearch)}`,
        )) as HosCandidate[];

        setCandidateRows(finalRows);
        setCandidatePage(1);
        setSelectedCandidateKeys([]);
        setSelectedCandidateKey(
          finalRows[0] ? candidateRowKey(finalRows[0]) : "",
        );
        if (finalRows[0]) {
          setRegisterUnitId(finalRows[0].unitId);
          setRegisterDate(initialSnapshot.currentDate);
          await loadCandidateHistory(finalRows[0].hn);
        } else {
          setCandidateHistoryRows([]);
          setSelectedHistoryVn("");
        }
        setNotice(
          `ดึงรายชื่อ ${finalRows.length} รายการ (${candidateModeLabel(candidateMode)} / ${dxGroupLabel(candidateDxGroup)})`,
        );
      })()
        .catch((error) =>
          setNotice(
            error instanceof Error ? error.message : "โหลดรายชื่อไม่สำเร็จ",
          ),
        )
        .finally(() => setWorking(false));
    });
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

    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void requestJson("/api/registry/register", {
        method: "POST",
        body: JSON.stringify({
          candidate: selectedCandidate,
          nextVisitAt: registerDate,
          assignedUnitId: registerUnitId,
          note: registerNote,
          userId: currentUser.id,
        }),
      })
        .then(async () => {
          await refresh();
          setCandidateRows((rows) =>
            rows.filter((candidate) => candidate.hn !== selectedCandidate.hn),
          );
          setSelectedCandidateKeys((keys) =>
            keys.filter((key) => key !== selectedCandidateKey),
          );
          setSelectedCandidateKey("");
          setCandidateHistoryRows([]);
          setSelectedHistoryVn("");
          setNotice("ลงทะเบียนเคสเรียบร้อย");
        })
        .catch((error) =>
          setNotice(error instanceof Error ? error.message : "เกิดข้อผิดพลาด"),
        )
        .finally(() => setWorking(false));
    });
  };

  const toggleCandidateSelection = (key: string, checked: boolean) => {
    setSelectedCandidateKeys((keys) => {
      const set = new Set(keys);
      if (checked) {
        set.add(key);
      } else {
        set.delete(key);
      }
      return [...set];
    });
  };

  const toggleSelectCurrentPage = (checked: boolean) => {
    setSelectedCandidateKeys((keys) => {
      const set = new Set(keys);
      for (const key of pageCandidateKeys) {
        if (checked) {
          set.add(key);
        } else {
          set.delete(key);
        }
      }
      return [...set];
    });
  };

  const registerSelectedCandidates = () => {
    if (!currentUser) return;
    if (!registerDate) {
      setNotice("กรุณาระบุวันเยี่ยมนัดแรก");
      return;
    }
    if (!selectedCandidateKeys.length) {
      setNotice("กรุณาติ๊กเลือกเคสที่ต้องการลงทะเบียน");
      return;
    }

    const selectedRows = candidateRows.filter((candidate) =>
      selectedKeySet.has(candidateRowKey(candidate)),
    );
    if (!selectedRows.length) {
      setNotice("ไม่พบรายการที่เลือก");
      return;
    }

    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void (async () => {
        let imported = 0;
        for (const candidate of selectedRows) {
          await requestJson("/api/registry/register", {
            method: "POST",
            body: JSON.stringify({
              candidate,
              nextVisitAt: registerDate,
              assignedUnitId: candidate.unitId,
              note: registerNote,
              userId: currentUser.id,
            }),
          });
          imported += 1;
        }
        await refresh();
        const selectedSet = new Set(selectedRows.map(candidateRowKey));
        const remainingRows = candidateRows.filter(
          (candidate) => !selectedSet.has(candidateRowKey(candidate)),
        );
        setCandidateRows(remainingRows);
        setSelectedCandidateKeys([]);
        if (
          selectedCandidateKey &&
          selectedSet.has(selectedCandidateKey)
        ) {
          const nextCandidate = remainingRows[0];
          setSelectedCandidateKey(nextCandidate ? candidateRowKey(nextCandidate) : "");
          if (nextCandidate) {
            setRegisterUnitId(nextCandidate.unitId);
            await loadCandidateHistory(nextCandidate.hn);
          } else {
            setCandidateHistoryRows([]);
            setSelectedHistoryVn("");
          }
        }
        setNotice(`ลงทะเบียนแบบกลุ่มเรียบร้อย ${imported} เคส`);
      })()
        .catch((error) =>
          setNotice(
            error instanceof Error ? error.message : "ลงทะเบียนแบบกลุ่มไม่สำเร็จ",
          ),
        )
        .finally(() => setWorking(false));
    });
  };

  const syncCandidates = () => {
    if (!currentUser) return;

    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void requestJson("/api/registry/sync", {
        method: "POST",
        body: JSON.stringify({
          visitDate: registerDate,
          clinic: candidateClinic,
          candidateMode,
          dxGroup: candidateDxGroup,
          userId: currentUser.id,
          note: "ซิงก์เข้า registry จากหน้า Case Manager",
        }),
      })
        .then(async (result) => {
          await refresh();
          setCandidateRows([]);
          setCandidatePage(1);
          setSelectedCandidateKeys([]);
          setSelectedCandidateKey("");
          setCandidateHistoryRows([]);
          setSelectedHistoryVn("");
          const imported = Number((result as { imported?: unknown }).imported ?? 0);
          setNotice(`ซิงก์เข้า registry แล้ว ${imported} รายการ`);
        })
        .catch((error) =>
          setNotice(error instanceof Error ? error.message : "เกิดข้อผิดพลาด"),
        )
        .finally(() => setWorking(false));
    });
  };

  if (!managerUsers.length) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[1.8rem] border border-[rgba(20,55,84,0.12)] bg-white p-6 shadow-[0_20px_50px_rgba(8,33,51,0.08)]">
          <h1 className="text-2xl font-semibold text-[#123047]">
            หน้าคัดเลือกคนไข้ (Case Manager)
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="rounded-[2.2rem] bg-[linear-gradient(135deg,#0c3148_0%,#104a61_48%,#d1ece8_100%)] p-6 text-white shadow-[0_30px_80px_rgba(6,29,43,0.22)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/85">
              Case Manager
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              หน้าคัดเลือกและลงทะเบียนคนไข้เข้าเกณฑ์
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
              ใช้คัดเลือกจากโรคเป้าหมาย และโฟกัสรายที่ยังไม่ลง Z51.5 / Z71.8
              ก่อนส่งต่อเยี่ยมบ้าน
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white"
            >
              รีเฟรช
            </button>
            <Link
              href="/case-manager/hosxp-search"
              className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white"
            >
              ค้นหาคนไข้ HOSxP
            </Link>
            <Link
              href="/case-manager/registry"
              className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white"
            >
              จัดการทะเบียน
            </Link>
            <Link
              href="/case-manager/in-progress"
              className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white"
            >
              ตรวจสอบเคสกำลังเยี่ยม
            </Link>
            <Link
              href="/case-manager/completed"
              className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white"
            >
              ตรวจสอบเคสเยี่ยมครบ
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
        <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr_1fr]">
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
          <div className="rounded-2xl border border-[#e2edf4] bg-[#f7fbfd] px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-[#6f8190]">
              หน่วยปัจจุบัน
            </div>
            <div className="mt-1 font-semibold text-[#123047]">
              {snapshot.units.find((unit) => unit.id === currentUser?.unitId)?.name ??
                "-"}
            </div>
          </div>
          <div className="rounded-2xl border border-[#e2edf4] bg-[#f7fbfd] px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-[#6f8190]">
              โหมดคัดกรอง
            </div>
            <div className="mt-1 font-semibold text-[#123047]">
              {candidateModeLabel(candidateMode)} / {dxGroupLabel(candidateDxGroup)}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.8rem] border border-[rgba(20,55,84,0.12)] bg-white p-5 shadow-[0_20px_50px_rgba(8,33,51,0.08)]">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="mb-4 flex flex-wrap gap-3">
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
              <select
                value={candidateMode}
                onChange={(event) =>
                  setCandidateMode(event.target.value as CandidateFilterMode)
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
              <select
                value={candidateDxGroup}
                onChange={(event) =>
                  setCandidateDxGroup(event.target.value as CandidateDxGroup)
                }
                className="rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
              >
                <option value="all">ทุกกลุ่มโรค</option>
                <option value="cancer">มะเร็ง/เนื้องอก</option>
                <option value="stroke-neuro">Stroke/ระบบประสาท</option>
                <option value="ckd">ไตวายระยะท้าย (N18.5)</option>
                <option value="copd">COPD</option>
                <option value="hiv">HIV/AIDS</option>
                <option value="liver">ตับล้มเหลว</option>
                <option value="heart">หัวใจล้มเหลว</option>
                <option value="palliative-z">รหัส Z51.5 / Z71.8</option>
                <option value="other">กลุ่มอื่น</option>
              </select>
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
              <button
                type="button"
                onClick={() => loadProgressSummary(true)}
                className="rounded-2xl border border-[#2563eb55] bg-[#edf4ff] px-5 py-3 text-sm font-medium text-[#1d4ed8]"
              >
                อัปเดตจำนวนเคสกำลังเยี่ยม
              </button>
              <button
                type="button"
                onClick={syncProgressCases}
                className="rounded-2xl border border-[#7c3aed55] bg-[#f2eaff] px-5 py-3 text-sm font-medium text-[#6d28d9]"
              >
                ซิงก์เคสครบ/ยังไม่ครบ 6 ครั้ง
              </button>
            </div>
            {progressSummary ? (
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#dbe7ef] bg-[#f8fcfe] px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#6f8190]">
                    เคสกำลังเยี่ยม
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-[#123047]">
                    {progressSummary.inProgressCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#dbe7ef] bg-[#f8fcfe] px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#6f8190]">
                    เคสเยี่ยมครบแล้ว
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-[#123047]">
                    {progressSummary.completedCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#dbe7ef] bg-[#f8fcfe] px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#6f8190]">
                    ข้อมูลล่าสุด
                  </div>
                  <div className="mt-1 text-sm font-medium text-[#123047]">
                    {formatVisitDate(progressSummary.refreshedAt.slice(0, 10))}
                    {progressSummary.fromCache ? " (cache)" : ""}
                  </div>
                </div>
              </div>
            ) : null}
            {notice ? (
              <div className="mb-4 rounded-2xl border border-[#d4e6ef] bg-[#f1f8fc] px-4 py-3 text-sm text-[#22445a]">
                {notice}
              </div>
            ) : null}
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[#e2edf4] bg-[#f8fcfe] px-4 py-3">
              <span className="text-sm text-[#123047]">
                เลือกแล้ว <strong>{selectedCandidateKeys.length}</strong> รายการ
              </span>
              <input
                type="date"
                value={registerDate}
                onChange={(event) => setRegisterDate(event.target.value)}
                className="rounded-2xl border border-[#d9e5ec] px-4 py-2 text-sm outline-none"
              />
              <input
                value={registerNote}
                onChange={(event) => setRegisterNote(event.target.value)}
                placeholder="หมายเหตุลงทะเบียนแบบกลุ่ม"
                className="min-w-[260px] flex-1 rounded-2xl border border-[#d9e5ec] px-4 py-2 text-sm outline-none"
              />
              <button
                type="button"
                onClick={registerSelectedCandidates}
                disabled={!selectedCandidateKeys.length || working}
                className="rounded-2xl bg-[#0f766e] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                ลงทะเบียนที่เลือก
              </button>
            </div>
            <div className="overflow-hidden rounded-[1.5rem] border border-[#e2edf4]">
              <div className="max-h-[58vh] overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f5fafc] text-xs uppercase tracking-[0.2em] text-[#6f8190]">
                    <tr>
                      <th className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={allPageSelected}
                          onChange={(event) =>
                            toggleSelectCurrentPage(event.target.checked)
                          }
                          aria-label="เลือกทุกเคสในหน้านี้"
                        />
                      </th>
                      <th className="px-4 py-4">ผู้ป่วย</th>
                      <th className="px-4 py-4">หน่วย</th>
                      <th className="px-4 py-4">Dx</th>
                      <th className="px-4 py-4">เคยเยี่ยมครบเกณฑ์แล้ว</th>
                      <th className="px-4 py-4">Z51.5 / Z71.8</th>
                      <th className="px-4 py-4">ความพร้อม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidateRows.length ? (
                      pagedCandidates.map((candidate) => {
                        const key = candidateRowKey(candidate);
                        return (
                          <tr
                            key={key}
                            className={`cursor-pointer border-t border-[#edf3f7] ${selectedCandidateKey === key ? "bg-[#eef8f8]" : "hover:bg-[#f8fbfd]"}`}
                            onClick={() => {
                              setSelectedCandidateKey(key);
                              setRegisterUnitId(candidate.unitId);
                              void loadCandidateHistory(candidate.hn);
                            }}
                          >
                            <td className="px-4 py-4">
                              <input
                                type="checkbox"
                                checked={selectedKeySet.has(key)}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) =>
                                  toggleCandidateSelection(
                                    key,
                                    event.target.checked,
                                  )
                                }
                                aria-label={`เลือกเคส ${candidate.fullName}`}
                              />
                            </td>
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
                            <td className="px-4 py-4 text-[#123047]">
                              {candidate.serviceCount} ครั้ง
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
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-[#6f8190]">
                          กดดึงรายชื่อเพื่อดูเคสเข้าเกณฑ์
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {candidateRows.length ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-[#5f7486]">
                  หน้า {currentPage} / {totalPages} · รวม {candidateRows.length} รายการ
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCandidatePage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                    className="rounded-xl border border-[#d9e5ec] bg-white px-3 py-1.5 text-sm text-[#123047] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ก่อนหน้า
                  </button>
                  {pageList.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCandidatePage(page)}
                      className={`rounded-xl px-3 py-1.5 text-sm ${page === currentPage ? "bg-[#123047] text-white" : "border border-[#d9e5ec] bg-white text-[#123047]"}`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setCandidatePage((page) => Math.min(totalPages, page + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="rounded-xl border border-[#d9e5ec] bg-white px-3 py-1.5 text-sm text-[#123047] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            ) : null}
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
                    HN {selectedCandidate.hn} · {selectedCandidate.primaryDxCode}
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
                <div className="rounded-2xl border border-[#e2edf4] bg-white p-4">
                  <div className="text-sm font-semibold text-[#123047]">
                    ประวัติการเยี่ยมย้อนหลัง (สูงสุด 12 ครั้ง)
                  </div>
                  <div className="mt-1 text-xs text-[#5f7486]">
                    เคยเยี่ยมครบเกณฑ์แล้ว {selectedCandidate.serviceCount} ครั้ง ·
                    ยังไม่ครบเกณฑ์ {selectedCandidate.incompleteVisitCount} ครั้ง
                  </div>
                  {historyLoading ? (
                    <div className="mt-2 text-sm text-[#6f8190]">
                      กำลังโหลดประวัติ...
                    </div>
                  ) : candidateHistoryRows.length ? (
                    <div className="mt-3 space-y-3">
                      <div className="max-h-44 overflow-auto rounded-xl border border-[#e6eef3]">
                        <table className="min-w-full text-left text-xs">
                          <thead className="bg-[#f5fafc] text-[#6f8190]">
                            <tr>
                              <th className="px-3 py-2">วันที่</th>
                              <th className="px-3 py-2">VN</th>
                              <th className="px-3 py-2">Dx หลัก</th>
                              <th className="px-3 py-2">สถานะ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {candidateHistoryRows.map((visit) => (
                              <tr
                                key={visit.vn}
                                className={`cursor-pointer border-t border-[#eef3f7] ${selectedHistoryVn === visit.vn ? "bg-[#eef8f8]" : "hover:bg-[#f8fbfd]"}`}
                                onClick={() => setSelectedHistoryVn(visit.vn)}
                              >
                                <td className="px-3 py-2">
                                  {formatVisitDate(visit.visitDate)}
                                </td>
                                <td className="px-3 py-2">{visit.vn}</td>
                                <td className="px-3 py-2">{visit.primaryDxCode || "-"}</td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`inline-flex rounded-full border px-2 py-0.5 ${visit.isCompleteByCriteria ? "border-[#74c69d55] bg-[#74c69d22] text-[#0f5132]" : "border-[#ef476f55] bg-[#ef476f22] text-[#8d1d3e]"}`}
                                  >
                                    {visit.isCompleteByCriteria
                                      ? "ครบเกณฑ์"
                                      : "ยังไม่ครบ"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {selectedHistory ? (
                        <div className="space-y-2 rounded-xl border border-[#e6eef3] bg-[#f9fcfe] p-3 text-xs text-[#123047]">
                          <div className="font-semibold">
                            รายละเอียดรอบ {formatVisitDate(selectedHistory.visitDate)} ({selectedHistory.vn})
                          </div>
                          <div>
                            <span className="text-[#6f8190]">Diag: </span>
                            {selectedHistory.diagCodes.length
                              ? selectedHistory.diagCodes.join(", ")
                              : "-"}
                          </div>
                          <div>
                            <span className="text-[#6f8190]">ADP Code: </span>
                            {selectedHistory.adpCodes.length
                              ? selectedHistory.adpCodes.join(", ")
                              : "-"}
                          </div>
                          <div>
                            <span className="text-[#6f8190]">สถานะ: </span>
                            {selectedHistory.isCompleteByCriteria
                              ? "ครบเกณฑ์"
                              : "ยังไม่ครบเกณฑ์"}
                            {!selectedHistory.isCompleteByCriteria &&
                            selectedHistory.missingCriteria.length ? (
                              <span className="text-[#8d1d3e]">
                                {" "}
                                (ขาด {selectedHistory.missingCriteria.join(", ")})
                              </span>
                            ) : null}
                          </div>
                          <div className="max-h-44 overflow-auto rounded-lg border border-[#e4edf2] bg-white">
                            <table className="min-w-full text-left text-xs">
                              <thead className="bg-[#f3f8fb] text-[#5f7486]">
                                <tr>
                                  <th className="px-2 py-1.5">icode</th>
                                  <th className="px-2 py-1.5">รายการ</th>
                                  <th className="px-2 py-1.5">ADP</th>
                                  <th className="px-2 py-1.5">qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedHistory.opitems.length ? (
                                  selectedHistory.opitems.map((item) => (
                                    <tr
                                      key={`${selectedHistory.vn}-${item.icode}-${item.adpCode ?? "-"}`}
                                      className="border-t border-[#eef3f7]"
                                    >
                                      <td className="px-2 py-1.5">{item.icode}</td>
                                      <td className="px-2 py-1.5">{item.itemName}</td>
                                      <td className="px-2 py-1.5">{item.adpCode ?? "-"}</td>
                                      <td className="px-2 py-1.5">{item.qty}</td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td
                                      colSpan={4}
                                      className="px-2 py-2 text-center text-[#6f8190]"
                                    >
                                      ไม่พบรายการ opitemrece
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-[#6f8190]">
                      ยังไม่พบประวัติการเยี่ยมย้อนหลังของเคสนี้
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-[#6f8190]">
                เลือกเคสจากตารางเพื่อดูรายละเอียด
              </div>
            )}
          </div>
        </div>
      </section>

      <LoadingProgressOverlay
        active={working || historyLoading}
        title="กำลังโหลดหน้าคัดเลือกเคส"
        detail={
          historyLoading
            ? "กำลังดึงประวัติการเยี่ยมย้อนหลัง"
            : "กำลังอัปเดตข้อมูลคัดกรองจากระบบ"
        }
      />
    </main>
  );
}
