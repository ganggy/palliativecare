import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Palliative Home Visit Command Center",
  description: "ระบบติดตามการเยี่ยมบ้าน Palliative สำหรับโรงพยาบาล รพ.สต. และ PCU",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
