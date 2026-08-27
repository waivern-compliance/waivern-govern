import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Waivern Govern",
  description: "Privacy and AI governance workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
