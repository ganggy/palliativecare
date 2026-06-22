import Link from "next/link";

export default function FsMonitorPage() {
  return (
    <main className="min-h-screen px-4 py-8 text-[#17352c] sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-[36px] border border-[#dcebe4] bg-white p-8 shadow-[0_24px_70px_rgba(19,58,47,0.09)]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6b8176]">
            FS Monitor
          </p>
          <h1 className="mt-4 text-3xl font-black text-[#17352c]">
            หน้านี้อยู่ระหว่างปรับปรุง
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#667c72]">
            หน้ารายงาน FS ชั่วคราวถูกปิดไว้เพื่อให้ระบบหลักสามารถ build และ deploy
            ได้ต่อเนื่องระหว่างการแก้ไขส่วนอื่นของแอป
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/executive"
              className="rounded-2xl bg-[#17352c] px-4 py-3 text-sm font-bold text-white"
            >
              กลับหน้าผู้บริหาร
            </Link>
            <Link
              href="/"
              className="rounded-2xl border border-[#dcebe4] px-4 py-3 text-sm font-bold text-[#17352c]"
            >
              กลับหน้าหลัก
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
