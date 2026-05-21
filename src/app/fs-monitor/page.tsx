import Link from "next/link";
import { connection } from "next/server";
import { getFsFundReport } from "@/lib/data-service";
import type { FsFundGroupRow, FsFundReport } from "@/lib/types";

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  });
}

function formatNumber(value: number) {
  return value.toLocaleString("th-TH");
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatMonth(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}-01T00:00:00`));
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/65 bg-white/86 p-5 shadow-[0_24px_70px_rgba(31,64,55,0.10)]">
      <p className="text-[0.7rem] font-black uppercase tracking-[0.28em] text-[#6b8176]">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black text-[#17352c]">{value}</p>
      <p className="mt-2 text-sm text-[#657970]">{hint}</p>
    </div>
  );
}

function ProgressRows({
  title,
  subtitle,
  rows,
  formatter = formatMoney,
}: {
  title: string;
  subtitle: string;
  rows: FsFundGroupRow[];
  formatter?: (value: number) => string;
}) {
  const max = Math.max(...rows.map((row) => row.totalAmount), 1);
  return (
    <section className="rounded-[30px] border border-[#dcebe4] bg-white/92 p-6 shadow-[0_18px_55px_rgba(19,58,47,0.09)]">
      <div className="mb-5">
        <h2 className="text-xl font-black text-[#17352c]">{title}</h2>
        <p className="mt-1 text-sm text-[#667c72]">{subtitle}</p>
      </div>
      <div className="space-y-4">
        {rows.length ? (
          rows.map((row, index) => (
            <div key={`${row.code}-${row.name}`} className="grid gap-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-[#17352c]">
                    {index + 1}. {row.name}
                  </p>
                  <p className="text-xs text-[#74877f]">
                    code {row.code || "-"} · {formatNumber(row.visitCount)} visit ·{" "}
                    {formatNumber(row.patientCount)} คน · {formatNumber(row.itemCount)} รายการ
                  </p>
                </div>
                <p className="shrink-0 font-black text-[#0f766e]">
                  {formatter(row.totalAmount)}
                </p>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-[#e8f2ed]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0f766e] via-[#6ea35e] to-[#e0ae3e]"
                  style={{ width: `${Math.max(4, (row.totalAmount / max) * 100)}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl bg-[#f5faf7] p-5 text-sm text-[#667c72]">
            ไม่พบข้อมูลในช่วงวันที่ที่เลือก
          </p>
        )}
      </div>
    </section>
  );
}

function MonthChart({ report }: { report: FsFundReport }) {
  const max = Math.max(...report.byMonth.map((row) => row.totalAmount), 1);
  return (
    <section className="rounded-[30px] border border-[#dcebe4] bg-[#17352c] p-6 text-white shadow-[0_24px_70px_rgba(19,58,47,0.16)]">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">แนวโน้มยอด FS รายเดือน</h2>
          <p className="mt-1 text-sm text-white/70">
            ใช้ดูจังหวะการเกิดรายการและยอดเงินในแต่ละเดือน
          </p>
        </div>
      </div>
      <div className="flex h-56 items-end gap-3 overflow-x-auto pb-2">
        {report.byMonth.map((row) => (
          <div key={row.code} className="flex min-w-20 flex-1 flex-col items-center gap-2">
            <div className="flex h-40 w-full items-end rounded-2xl bg-white/10 p-1">
              <div
                className="w-full rounded-xl bg-gradient-to-t from-[#f1b94e] to-[#7fe4c8]"
                style={{
                  height: `${Math.max(8, (row.totalAmount / max) * 100)}%`,
                }}
              />
            </div>
            <p className="text-center text-[0.68rem] font-bold text-white/80">
              {formatMonth(row.code)}
            </p>
            <p className="text-center text-[0.68rem] text-white/60">
              {formatMoney(row.totalAmount)}
            </p>
          </div>
        ))}
        {!report.byMonth.length && (
          <p className="w-full rounded-2xl bg-white/10 p-5 text-sm text-white/70">
            ยังไม่มีข้อมูลรายเดือน
          </p>
        )}
      </div>
    </section>
  );
}

export default async function FsMonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const report = await getFsFundReport(params);

  return (
    <main className="min-h-screen px-4 py-8 text-[#17352c] sm:px-8">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <section className="overflow-hidden rounded-[36px] bg-gradient-to-br from-[#123047] via-[#1f614f] to-[#e6ddbd] p-8 text-white shadow-[0_30px_90px_rgba(18,48,71,0.18)]">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-1 text-xs font-black uppercase tracking-[0.32em] text-white/80">
                FS Fund Monitor
              </p>
              <h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl">
                มอนิเตอร์กองทุน FS
              </h1>
              <p className="mt-4 max-w-2xl text-base font-medium leading-8 text-white/82">
                สรุปยอดเงินจากรายการบริการที่ระบุ FS พร้อมแยกสิทธิ์จริงจาก hipdata,
                สิทธิ์ปัจจุบันจาก patient.pttype, top รายการบริการ และแผนกที่เกิดรายการ
              </p>
            </div>
            <div className="rounded-[28px] border border-white/20 bg-white/12 p-4 backdrop-blur">
              <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.18em] text-white/72">
                  เริ่มวันที่
                  <input
                    type="date"
                    name="startDate"
                    defaultValue={report.startDate}
                    className="rounded-2xl border border-white/25 px-4 py-3 text-[#17352c]"
                  />
                </label>
                <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.18em] text-white/72">
                  ถึงวันที่
                  <input
                    type="date"
                    name="endDate"
                    defaultValue={report.endDate}
                    className="rounded-2xl border border-white/25 px-4 py-3 text-[#17352c]"
                  />
                </label>
                <button className="self-end rounded-2xl bg-white px-5 py-3 font-black text-[#123047] shadow-lg">
                  ดูรายงาน
                </button>
              </form>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/executive"
                  className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white/82"
                >
                  กลับหน้าผู้บริหาร
                </Link>
                <Link
                  href="/"
                  className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white/82"
                >
                  กลับหน้าหลัก
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="ยอดเงิน FS รวม"
            value={formatMoney(report.summary.totalAmount)}
            hint={`${formatDate(report.startDate)} - ${formatDate(report.endDate)}`}
          />
          <StatCard
            label="จำนวน visit"
            value={formatNumber(report.summary.visitCount)}
            hint="นับจาก VN ที่มีรายการ FS"
          />
          <StatCard
            label="จำนวนคนไข้"
            value={formatNumber(report.summary.patientCount)}
            hint="นับ HN ไม่ซ้ำ"
          />
          <StatCard
            label="จำนวนรายการ"
            value={formatNumber(report.summary.itemCount)}
            hint="จำนวนแถว opitemrece ที่เป็น FS"
          />
        </section>

        <MonthChart report={report} />

        <section className="grid gap-6 xl:grid-cols-2">
          <ProgressRows
            title="แยกตามสิทธิ์จริงจาก hipdata"
            subtitle="อิง maininscl / subinscl / pttype จากตาราง hipdata ล่าสุดของ CID"
            rows={report.byHipdata}
          />
          <ProgressRows
            title="แยกตาม patient.pttype"
            subtitle="อิงสิทธิ์ปัจจุบันที่บันทึกในตาราง patient และชื่อสิทธิ์จาก pttype"
            rows={report.byPatientPttype}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <ProgressRows
            title="Top รายการบริการ FS"
            subtitle="จัดอันดับตามยอดเงินรวมของรายการบริการ"
            rows={report.byServiceItem}
          />
          <ProgressRows
            title="Top แผนก/จุดบริการ"
            subtitle="อิง dep_code ของรายการ หรือ main_dep/cur_dep ของ visit"
            rows={report.byDepartment}
          />
        </section>

        <section className="overflow-hidden rounded-[30px] border border-[#dcebe4] bg-white/92 p-6 shadow-[0_18px_55px_rgba(19,58,47,0.09)]">
          <div className="mb-5">
            <h2 className="text-xl font-black text-[#17352c]">รายการล่าสุด</h2>
            <p className="mt-1 text-sm text-[#667c72]">
              แสดง 80 รายการล่าสุดในช่วงวันที่ที่เลือก ใช้ตรวจสอบ HN และสิทธิ์รายคนได้เร็ว
            </p>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#e1eee8]">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-[#f3faf7] text-xs uppercase tracking-[0.16em] text-[#60766d]">
                <tr>
                  <th className="px-4 py-3">วันที่</th>
                  <th className="px-4 py-3">HN / CID</th>
                  <th className="px-4 py-3">ผู้ป่วย</th>
                  <th className="px-4 py-3">รายการ</th>
                  <th className="px-4 py-3">patient.pttype</th>
                  <th className="px-4 py-3">hipdata</th>
                  <th className="px-4 py-3">แผนก</th>
                  <th className="px-4 py-3 text-right">ยอดเงิน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e7f0eb]">
                {report.recentRows.map((row, index) => (
                  <tr key={`${row.hn}-${row.itemCode}-${row.visitDate}-${index}`}>
                    <td className="px-4 py-3 font-bold">{formatDate(row.visitDate)}</td>
                    <td className="px-4 py-3 text-[#61786f]">
                      <div>HN {row.hn}</div>
                      <div className="text-xs">CID {row.cid || "-"}</div>
                    </td>
                    <td className="px-4 py-3 font-bold">{row.patientName}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold">{row.itemCode}</div>
                      <div className="max-w-md text-xs text-[#61786f]">{row.itemName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold">{row.patientPttypeCode || "-"}</div>
                      <div className="text-xs text-[#61786f]">{row.patientPttypeName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold">{row.hipdataCode || "-"}</div>
                      <div className="text-xs text-[#61786f]">{row.hipdataName}</div>
                    </td>
                    <td className="px-4 py-3">{row.departmentName}</td>
                    <td className="px-4 py-3 text-right font-black text-[#0f766e]">
                      {formatMoney(row.amount)}
                    </td>
                  </tr>
                ))}
                {!report.recentRows.length && (
                  <tr>
                    <td className="px-4 py-8 text-center text-[#667c72]" colSpan={8}>
                      ไม่พบรายการ FS ในช่วงวันที่ที่เลือก
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
