"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/AuthProvider";
import { Icon, type IconName } from "@/components/ui/Icon";

const NAV_ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/documents", label: "Documents", icon: "documents" },
  { href: "/compare", label: "Compare", icon: "compare" },
];

const SECONDARY_ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/how-it-works", label: "How NyayaLens works", icon: "book" },
  { href: "/research", label: "Research and evaluation", icon: "flask" },
];

// The signed-in frame: a dark navigation sidebar and the page. `compact`
// (used by the document workspace) narrows the sidebar to an icon rail so
// the document and its analysis get the width; labels stay available as
// tooltips and to screen readers.
export function AppShell({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const { logout } = useAuth();

  const item = (href: string, label: string, icon: IconName, active: boolean) => (
    <Link
      key={href}
      href={href}
      title={compact ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-md text-sm transition-colors ${
        compact ? "h-10 w-10 justify-center" : "px-3 py-2"
      } ${
        active ? "bg-ink-700 text-paper-50" : "text-ink-300 hover:bg-ink-800 hover:text-paper-50"
      }`}
    >
      <Icon name={icon} size={18} />
      <span className={compact ? "sr-only" : ""}>{label}</span>
    </Link>
  );

  // Below tablet width the sidebar becomes a compact bar across the top.
  const barLink = (href: string, label: string, icon: IconName, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
        active ? "bg-ink-700 text-paper-50" : "text-ink-300 hover:bg-ink-800 hover:text-paper-50"
      }`}
    >
      <Icon name={icon} size={18} />
      <span className="sr-only">{label}</span>
    </Link>
  );

  return (
    <div className="flex h-dvh flex-col bg-paper-100 md:flex-row">
      <header className="flex shrink-0 items-center justify-between bg-ink-900 px-3 py-2 md:hidden">
        <Link href="/documents" className="flex items-center gap-2" title="NyayaLens">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-saffron-500 font-serif text-sm font-semibold text-ink-900">
            N
          </span>
          <span className="text-sm font-semibold tracking-[0.16em] text-paper-50">NYAYALENS</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-0.5">
          {NAV_ITEMS.map((n) => barLink(n.href, n.label, n.icon, !!pathname?.startsWith(n.href)))}
          {SECONDARY_ITEMS.map((n) => barLink(n.href, n.label, n.icon, pathname === n.href))}
          <button
            type="button"
            onClick={logout}
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-300 hover:bg-ink-800 hover:text-paper-50"
          >
            <Icon name="logout" size={18} />
            <span className="sr-only">Sign out</span>
          </button>
        </nav>
      </header>
      <nav
        aria-label="Primary"
        className={`hidden shrink-0 flex-col bg-ink-900 py-4 md:flex ${compact ? "w-16 items-center px-3" : "w-60 px-3"}`}
      >
        <Link
          href="/documents"
          className={`mb-6 flex items-center gap-2.5 ${compact ? "justify-center" : "px-3"}`}
          title="NyayaLens"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-saffron-500 font-serif text-base font-semibold text-ink-900">
            N
          </span>
          {!compact && (
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-[0.16em] text-paper-50">
                NYAYALENS
              </span>
              <span className="text-[11px] text-ink-300">Legal document intelligence</span>
            </span>
          )}
        </Link>

        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map((n) => item(n.href, n.label, n.icon, !!pathname?.startsWith(n.href)))}
        </div>

        <div className="mt-auto flex flex-col gap-1 border-t border-ink-800 pt-3">
          {SECONDARY_ITEMS.map((n) => item(n.href, n.label, n.icon, pathname === n.href))}
          <button
            type="button"
            onClick={logout}
            title={compact ? "Sign out" : undefined}
            className={`flex items-center gap-3 rounded-md text-sm text-ink-300 transition-colors hover:bg-ink-800 hover:text-paper-50 ${
              compact ? "h-10 w-10 justify-center" : "px-3 py-2"
            }`}
          >
            <Icon name="logout" size={18} />
            <span className={compact ? "sr-only" : ""}>Sign out</span>
          </button>
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
