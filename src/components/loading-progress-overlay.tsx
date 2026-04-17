"use client";

import { useEffect, useMemo, useState } from "react";

function stageByProgress(progress: number) {
  if (progress < 30) return "กำลังเตรียมคำขอข้อมูล";
  if (progress < 65) return "กำลังดึงข้อมูลจากระบบ";
  if (progress < 90) return "กำลังประมวลผลและจัดรูปแบบ";
  if (progress < 100) return "ใกล้เสร็จแล้ว";
  return "เสร็จสมบูรณ์";
}

export function LoadingProgressOverlay({
  active,
  title = "กำลังโหลดข้อมูล",
  detail,
}: {
  active: boolean;
  title?: string;
  detail?: string;
}) {
  const [visible, setVisible] = useState(active);
  const [progress, setProgress] = useState(active ? 12 : 0);

  useEffect(() => {
    if (active) {
      const showTimer = window.setTimeout(() => {
        setVisible(true);
        setProgress((prev) => (prev < 12 ? 12 : prev));
      }, 0);
      const timer = window.setInterval(() => {
        setProgress((prev) => {
          if (prev >= 92) return prev;
          const step = Math.max(1, Math.round((100 - prev) / 14));
          return Math.min(92, prev + step);
        });
      }, 220);
      return () => {
        window.clearTimeout(showTimer);
        window.clearInterval(timer);
      };
    }

    if (!visible) return;
    const completeTimer = window.setTimeout(() => setProgress(100), 0);
    const hideTimer = window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 450);
    return () => {
      window.clearTimeout(completeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [active, visible]);

  const stageText = useMemo(() => stageByProgress(progress), [progress]);
  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[90] w-[min(92vw,360px)] rounded-3xl border border-[#b9d8e8] bg-[linear-gradient(140deg,#f8fdff_0%,#eef7fc_50%,#e6f2f8_100%)] p-4 shadow-[0_20px_50px_rgba(8,33,51,0.2)] backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#2f6f9740] bg-white">
          <div className="text-base font-semibold text-[#123047]">{Math.round(progress)}%</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#123047]">{title}</div>
          <div className="mt-1 text-xs text-[#567082]">{detail || stageText}</div>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#d7eaf4]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-label={title}
          >
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#1d4ed8_55%,#0ea5e9_100%)] transition-[width] duration-200 ease-out"
              style={{ width: `${Math.max(6, progress)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
