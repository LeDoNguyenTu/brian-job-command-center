import type { Metadata } from "next";
import { headers } from "next/headers";
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <html lang="en"><body data-csp-nonce={nonce}>{children}</body></html>;
}
