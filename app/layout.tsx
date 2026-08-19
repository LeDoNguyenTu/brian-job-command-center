import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brian Job Command Center",
  description: "Brian's private job search, application, resume, and sponsorship dashboard.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/brian-logo.png",
    shortcut: "/brian-logo.png",
    apple: "/brian-logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
