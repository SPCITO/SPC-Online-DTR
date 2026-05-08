import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SPC DTR System",
  description: "Employee Attendance System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">

        {/* ✅ YOUR APP */}
        {children}

        {/* ✅ TOAST CONTAINER (VERY IMPORTANT) */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: "14px",
              background: "linear-gradient(135deg, #065f46, #047857)",
              color: "#fff",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            },
          }}
        />

      </body>
    </html>
  );
}