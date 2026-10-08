"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/AuthProvider";
import { Button } from "@/components/ui/Button";

const NAV_ITEMS = [
  { href: "/documents", label: "Documents" },
  { href: "/compare", label: "Compare" },
];

// The global shell (Section 7): a compact sidebar, a slim top bar, and a
// main workspace that gets the vast majority of the screen. Deliberately
// not a wide generic-SaaS sidebar - it exists to orient, not to compete
// with the document for attention.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <div className="flex h-screen flex-col bg-paper-100">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-ink-200 bg-paper-50 px-4">
        <Link href="/documents" className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-wide text-ink-800">NYAYALENS</span>
          <span className="hidden text-xs text-ink-400 sm:inline">
            Indian Legal Document Intelligence
          </span>
        </Link>
        <Button size="sm" variant="ghost" onClick={logout}>
          Sign out
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Primary"
          className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-ink-200 bg-paper-50 p-2 md:flex"
        >
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded px-2.5 py-1.5 text-sm transition-colors ${
                  active ? "bg-ink-100 font-medium text-ink-800" : "text-ink-500 hover:bg-paper-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="mt-auto border-t border-ink-200 pt-2">
            <Link
              href="/how-it-works"
              className="block rounded px-2.5 py-1.5 text-xs text-ink-400 hover:bg-paper-200 hover:text-ink-600"
            >
              How NyayaLens works
            </Link>
            <Link
              href="/research"
              className="block rounded px-2.5 py-1.5 text-xs text-ink-400 hover:bg-paper-200 hover:text-ink-600"
            >
              Research and evaluation
            </Link>
          </div>
        </nav>
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
