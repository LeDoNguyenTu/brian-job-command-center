import type { Metadata } from "next";
import { headers } from "next/headers";
import DiscoveryStatusPanel from "./components/DiscoveryStatusPanel";
import SettingsFunctionListEnhancer from "./settings-function-list";
import SourceFirstUiEnhancer from "./source-first-ui-enhancer";
import "./globals.css";
import "./settings-function-list.css";
import "./visual-polish.css";

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
  return <html lang="en"><body data-csp-nonce={nonce}>{children}<DiscoveryStatusPanel /><SettingsFunctionListEnhancer /><SourceFirstUiEnhancer /></body></html>;
}
