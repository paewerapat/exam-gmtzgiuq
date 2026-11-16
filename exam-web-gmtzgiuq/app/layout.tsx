import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/layout/Navbar";

// ฟอนต์เนื้อหาข้อสอบ (โจทย์ ตัวเลือก เฉลย คำใบ้ บทอ่าน) ใช้ผ่าน class `font-question` (globals.css)
// ส่วนอื่นของเว็บยังเป็น Prompt — variable font ครอบทุก weight; ไม่ preload เพราะใช้เฉพาะหน้าข้อสอบ/ทบทวน
const notoSans = Noto_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-noto-sans",
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai"],
  display: "swap",
  preload: false,
  variable: "--font-noto-sans-thai",
});

export const metadata: Metadata = {
  title: "LUMO - Online Exam Practice Platform",
  description: "Practice and prepare for your exams with our comprehensive online platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${notoSans.variable} ${notoSansThai.variable} antialiased`}>
        <Providers>
          <Navbar />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
