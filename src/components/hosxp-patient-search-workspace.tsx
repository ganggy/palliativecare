"use client";

import Link from "next/link";
import { startTransition, useMemo, useState } from "react";
import { LoadingProgressOverlay } from "@/components/loading-progress-overlay";
import { formatRoleLabel } from "@/lib/rules";
import type {
  AppSnapshot,
  HosPatientDetail,
  HosPatientSearchItem,
} from "@/lib/types";

function formatDate(value?: string) {
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

export function HosxpPatientSearchWorkspace({
  initialSnapshot,
}: {
  initialSnapshot: AppSnapshot;
}) {
  const managerUsers = useMemo(
    () =>
      initialSnapshot.users.filter(
        (user) =>
          user.role === "hospital_case_manager" || user.role === "hospital_admin",
      ),
    [initialSnapshot.users],
  );
  const [activeUserId, setActiveUserId] = useState(managerUsers[0]?.id ?? "");
  const currentUser =
    managerUsers.find((user) => user.id === activeUserId) ?? managerUsers[0];

  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<HosPatientSearchItem[]>([]);
  const [selectedHn, setSelectedHn] = useState("");
  const [detail, setDetail] = useState<HosPatientDetail | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadDetail = async (hn: string) => {
    if (!hn) return;
    const data = (await requestJson(
      `/api/hosxp/patient?hn=${encodeURIComponent(hn)}`,
    )) as HosPatientDetail;
    setDetail(data);
  };

  const runSearch = () => {
    const text = keyword.trim();
    if (!text) {
      setNotice("กรุณาพิมพ์คำค้นก่อน");
      return;
    }
    setWorking(true);
    setNotice(null);
    startTransition(() => {
      void (async () => {
        const result = (await requestJson(
          `/api/hosxp/search?q=${encodeURIComponent(text)}&limit=20`,
        )) as HosPatientSearchItem[];
        setRows(result);
        setSelectedHn("");
        setDetail(null);
        setNotice(`พบ ${result.length} รายการ`);
      })()
        .catch((error) =>
          setNotice(
            error instanceof Error ? error.message : "ค้นหาข้อมูลไม่สำเร็จ",
          ),
        )
        .finally(() => setWorking(false));
    });
  };

  const selectedItem = rows.find((row) => row.hn === selectedHn);

  if (!managerUsers.length) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[1.8rem] border border-[rgba(20,55,84,0.12)] bg-white p-6 shadow-[0_20px_50px_rgba(8,33,51,0.08)]">
          <h1 className="text-2xl font-semibold text-[#123047]">
            ค้นหาข้อมูลคนไข้ HOSxP
          </h1>
          <p className="mt-2 text-sm text-[#5f7486]">
            ยังไม่พบผู้ใช้บทบาท Case Manager ในระบบ
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1450px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="rounded-[2.2rem] bg-[linear-gradient(135deg,#0c3148_0%,#104a61_48%,#d1ece8_100%)] p-6 text-white shadow-[0_30px_80px_rgba(6,29,43,0.22)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/85">
              HOSxP Search
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              ค้นหาข้อมูลคนไข้รายตัวจาก HOSxP
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
              ค้นหาได้จากชื่อ, HN หรือ ICD เพื่อดูข้อมูลพื้นฐาน, ผล Lab, Diag และประวัติรับบริการ
              โดยไม่จำกัดว่าเข้าเคส palliative หรือไม่
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/case-manager"
              className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white"
            >
              กลับหน้าคัดเลือกเคส
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
        <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr]">
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
              {initialSnapshot.units.find((unit) => unit.id === currentUser?.unitId)?.name ??
                "-"}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.8rem] border border-[rgba(20,55,84,0.12)] bg-white p-5 shadow-[0_20px_50px_rgba(8,33,51,0.08)]">
        <div className="mb-4 flex flex-wrap gap-3">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                runSearch();
              }
            }}
            placeholder="ค้นหา ชื่อ / HN / ICD"
            className="min-w-[280px] flex-1 rounded-2xl border border-[#d9e5ec] px-4 py-3 text-sm outline-none"
          />
          <button
            type="button"
            onClick={runSearch}
            className="rounded-2xl bg-[#123047] px-5 py-3 text-sm font-medium text-white"
          >
            ค้นหา
          </button>
        </div>
        {notice ? (
          <div className="mb-4 rounded-2xl border border-[#d4e6ef] bg-[#f1f8fc] px-4 py-3 text-sm text-[#22445a]">
            {notice}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="overflow-hidden rounded-[1.5rem] border border-[#e2edf4]">
            <div className="max-h-[70vh] overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f5fafc] text-xs uppercase tracking-[0.2em] text-[#6f8190]">
                  <tr>
                    <th className="px-4 py-4">ผู้ป่วย</th>
                    <th className="px-4 py-4">Dx ล่าสุด</th>
                    <th className="px-4 py-4">เยี่ยมล่าสุด</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((row) => (
                      <tr
                        key={`${row.hn}-${row.cid}`}
                        className={`cursor-pointer border-t border-[#edf3f7] ${selectedHn === row.hn ? "bg-[#eef8f8]" : "hover:bg-[#f8fbfd]"}`}
                        onClick={() => {
                          setSelectedHn(row.hn);
                          setWorking(true);
                          void loadDetail(row.hn)
                            .catch((error) =>
                              setNotice(
                                error instanceof Error
                                  ? error.message
                                  : "โหลดรายละเอียดไม่สำเร็จ",
                              ),
                            )
                            .finally(() => setWorking(false));
                        }}
                      >
                        <td className="px-4 py-4">
                          <div className="font-medium text-[#123047]">{row.fullName}</div>
                          <div className="mt-1 text-xs text-[#6f8190]">
                            HN {row.hn} · CID {row.cid || "-"}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-[#123047]">
                          {row.primaryDxCode || "-"}
                        </td>
                        <td className="px-4 py-4 text-[#123047]">
                          {formatDate(row.lastVisitAt)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-[#6f8190]">
                        กรอกคำค้นและกดค้นหาเพื่อแสดงรายการคนไข้
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            {detail ? (
              <>
                <div className="rounded-[1.5rem] border border-[#e2edf4] bg-[#f7fbfd] p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-[#6f8190]">
                    ข้อมูลพื้นฐาน
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#123047]">
                    {detail.profile.fullName}
                  </div>
                  <div className="mt-2 text-sm text-[#5f7486]">
                    HN {detail.profile.hn} · CID {detail.profile.cid || "-"} · อายุ{" "}
                    {detail.profile.age} ปี · {detail.profile.sex === "M" ? "ชาย" : "หญิง"}
                  </div>
                  <div className="mt-2 text-sm text-[#5f7486]">
                    โทร {detail.profile.phone || "-"} · Dx ล่าสุด{" "}
                    {detail.profile.primaryDxCode || "-"} · มารับบริการล่าสุด{" "}
                    {formatDate(detail.profile.lastVisitAt)}
                  </div>
                  <div className="mt-2 text-sm text-[#5f7486]">
                    ที่อยู่: {detail.profile.address || "-"}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-[#e2edf4] bg-white p-4">
                  <div className="mb-2 text-sm font-semibold text-[#123047]">
                    ประวัติ Diag ({detail.diagHistory.length})
                  </div>
                  <div className="max-h-56 overflow-auto rounded-xl border border-[#e6eef3]">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-[#f5fafc] text-[#6f8190]">
                        <tr>
                          <th className="px-3 py-2">วันที่</th>
                          <th className="px-3 py-2">VN</th>
                          <th className="px-3 py-2">ICD</th>
                          <th className="px-3 py-2">รายละเอียด</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.diagHistory.length ? (
                          detail.diagHistory.map((item, index) => (
                            <tr key={`${item.vn}-${item.icd10}-${index}`} className="border-t border-[#eef3f7]">
                              <td className="px-3 py-2">{formatDate(item.visitDate)}</td>
                              <td className="px-3 py-2">{item.vn}</td>
                              <td className="px-3 py-2">{item.icd10}</td>
                              <td className="px-3 py-2">{item.diagName || "-"}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-3 py-3 text-center text-[#6f8190]">
                              ไม่พบข้อมูล diag
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-[#e2edf4] bg-white p-4">
                  <div className="mb-2 text-sm font-semibold text-[#123047]">
                    ผล Lab ({detail.labHistory.length})
                  </div>
                  <div className="max-h-56 overflow-auto rounded-xl border border-[#e6eef3]">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-[#f5fafc] text-[#6f8190]">
                        <tr>
                          <th className="px-3 py-2">วันที่</th>
                          <th className="px-3 py-2">รายการ</th>
                          <th className="px-3 py-2">ผล</th>
                          <th className="px-3 py-2">หน่วย</th>
                          <th className="px-3 py-2">ช่วงอ้างอิง</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.labHistory.length ? (
                          detail.labHistory.map((item, index) => (
                            <tr key={`${item.labDate}-${item.itemCode}-${index}`} className="border-t border-[#eef3f7]">
                              <td className="px-3 py-2">{formatDate(item.labDate)}</td>
                              <td className="px-3 py-2">
                                {item.itemCode} {item.itemName ? `- ${item.itemName}` : ""}
                              </td>
                              <td className="px-3 py-2">{item.result || "-"}</td>
                              <td className="px-3 py-2">{item.unit || "-"}</td>
                              <td className="px-3 py-2">{item.normalValue || "-"}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="px-3 py-3 text-center text-[#6f8190]">
                              ไม่พบผล Lab หรือโครงสร้างตาราง Lab ไม่พร้อมใช้งาน
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-[#e2edf4] bg-white p-4">
                  <div className="mb-2 text-sm font-semibold text-[#123047]">
                    ประวัติรับบริการ ({detail.serviceHistory.length})
                  </div>
                  <div className="max-h-56 overflow-auto rounded-xl border border-[#e6eef3]">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-[#f5fafc] text-[#6f8190]">
                        <tr>
                          <th className="px-3 py-2">วันที่</th>
                          <th className="px-3 py-2">VN</th>
                          <th className="px-3 py-2">คลินิก/หน่วย</th>
                          <th className="px-3 py-2">สิทธิ</th>
                          <th className="px-3 py-2">Pdx</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.serviceHistory.length ? (
                          detail.serviceHistory.map((item) => (
                            <tr key={`${item.visitDate}-${item.vn}`} className="border-t border-[#eef3f7]">
                              <td className="px-3 py-2">{formatDate(item.visitDate)}</td>
                              <td className="px-3 py-2">{item.vn}</td>
                              <td className="px-3 py-2">{item.mainDep || "-"}</td>
                              <td className="px-3 py-2">{item.pttype || "-"}</td>
                              <td className="px-3 py-2">
                                {item.pdx || "-"} {item.pdxName ? `- ${item.pdxName}` : ""}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="px-3 py-3 text-center text-[#6f8190]">
                              ไม่พบข้อมูลประวัติรับบริการ
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-[1.5rem] border border-[#e2edf4] bg-[#f7fbfd] p-5 text-sm text-[#6f8190]">
                เลือกคนไข้จากรายการด้านซ้ายเพื่อดูรายละเอียด
              </div>
            )}
          </div>
        </div>
      </section>

      <LoadingProgressOverlay
        active={working}
        title="กำลังโหลดข้อมูลจาก HOSxP"
        detail="กำลังค้นหาและสรุปรายละเอียดผู้ป่วย"
      />
      {selectedItem ? (
        <div className="rounded-2xl border border-[#d4e6ef] bg-[#f7fbfd] px-5 py-3 text-sm text-[#5f7486]">
          กำลังดูข้อมูลของ HN {selectedItem.hn} - {selectedItem.fullName}
        </div>
      ) : null}
    </main>
  );
}
