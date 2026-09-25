import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"

import { HelpPanel } from "@/components/shell/help-panel"
import { MobileHeader, MobileTabBar } from "@/components/shell/mobile-nav"
import { Sidebar } from "@/components/shell/sidebar"
import { ThemeProvider } from "@/components/shell/theme-provider"
import { Tour } from "@/components/shell/tour"
import { TooltipProvider } from "@/components/ui/tooltip"
import { APP_FULL_NAME } from "@/lib/brand"
import "./globals.css"

// SF Pro isn't licensed for web use; Apple devices get it via -apple-system and
// everyone else falls back to Inter (see --font-sans in globals.css).
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" })

const description =
  "Peer benchmarking, business cases for new initiatives, plain-language field definitions, and a reporting calendar, built on public California hospital data (HCAI, CMS, CDPH)."

export const metadata: Metadata = {
  title: { default: APP_FULL_NAME, template: `%s · ${APP_FULL_NAME}` },
  applicationName: APP_FULL_NAME,
  description,
  openGraph: { type: "website", siteName: APP_FULL_NAME, title: APP_FULL_NAME, description },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider>
          <TooltipProvider delay={150}>
            <div className="flex min-h-dvh">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <MobileHeader />
                <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 sm:px-8 md:pt-10 md:pb-16">
                  {children}
                </main>
              </div>
            </div>
            <MobileTabBar />
            <HelpPanel />
            <Tour />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
