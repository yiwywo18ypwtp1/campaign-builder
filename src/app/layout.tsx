import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "sonner";
import { NavLink } from "@/components/nav-link";
import { Providers } from "./providers";
import { getCurrentUser } from "@/server/session";
import "./globals.css";

// `--font-sans` is the variable the shadcn theme in globals.css reads.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Campaign Builder", template: "%s · Campaign Builder" },
  description: "Marketing campaigns: list, builder and live metrics",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { role } = await getCurrentUser();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b">
          <nav aria-label="Main" className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="font-semibold">
              Campaign Builder
            </Link>
            <NavLink href="/campaigns">Campaigns</NavLink>
            <NavLink href="/settings">Settings</NavLink>
            <span className="ml-auto text-sm text-muted-foreground">
              Role: <span className="font-medium text-foreground capitalize">{role}</span>
            </span>
          </nav>
        </header>
        <Providers>{children}</Providers>
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
