"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** A header link that highlights itself on its section. Client-only because it needs the current path. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn("text-sm text-muted-foreground hover:text-foreground", isActive && "font-medium text-foreground")}
    >
      {children}
    </Link>
  );
}
