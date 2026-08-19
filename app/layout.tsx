import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brian Job Command Center",
  description: "Brian's private job search, application, resume, and sponsorship dashboard.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
