import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Site Watch",
  description: "Employee attendance, site presence, and leave management dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body>{children}</body>
    </html>
  );
}
