import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const thaiSans = Noto_Sans_Thai({
  variable: "--font-thai-sans",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
});

const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Palliative Home Visit Command Center",
  description: "ระบบติดตามการเยี่ยมบ้าน Palliative สำหรับโรงพยาบาล รพ.สต. และ PCU",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={`${thaiSans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
