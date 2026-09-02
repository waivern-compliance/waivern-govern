import type { Metadata } from "next";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@/lib/product";
import "./globals.css";

export const metadata: Metadata = {
  // Each page names itself and the product names itself once, so a row of
  // browser tabs is readable rather than nine identical ones.
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  description: PRODUCT_DESCRIPTION,
  icons: { icon: "/waivern-mark.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
