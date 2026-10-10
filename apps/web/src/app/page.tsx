"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import { Spinner } from "@/components/ui/States";

const DOMAINS = [
  "Residential rental",
  "Leave and licence",
  "Land lease",
  "Sale of property",
  "Builder-buyer",
  "Employment",
  "NDA / services",
];

const FEATURES = [
  {
    title: "Key terms, with their source",
    body: "Parties, amounts, dates and durations for the document's own domain - sale consideration for a sale, CTC for an offer letter - each one a click away from the sentence it came from.",
  },
  {
    title: "Who must do what",
    body: "Obligations read as “Buyer must pay ₹19,00,000 by 16 April 2025”, with the condition and the evidence sentence.",
  },
  {
    title: "Inconsistencies and potential issues",
    body: "The same price stated two ways, instalments that don't add up, one-sided termination or uncapped liability - flagged for review, never as a legal conclusion.",
  },
  {
    title: "Questions answered from the document",
    body: "Ask “How much remains after the advance?” and get the figure with its evidence - or a clear “not enough evidence” when the document doesn't say.",
  },
];

// Public landing page. Signed-in users go straight to their documents.
export default function HomePage() {
  const { isAuthenticated, isReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isReady && isAuthenticated) router.replace("/documents");
  }, [isReady, isAuthenticated, router]);

  if (!isReady || isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper-100">
        <Spinner className="h-5 w-5" />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-paper-100">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <span className="text-sm font-semibold tracking-[0.18em] text-ink-800">NYAYALENS</span>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/research" className="rounded px-3 py-1.5 text-ink-500 hover:bg-paper-200">
            Research
          </Link>
          <Link href="/login" className="rounded px-3 py-1.5 text-ink-700 hover:bg-paper-200">
            Sign in
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid gap-10 py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:py-20">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-saffron-600">
              Indian legal document intelligence
            </p>
            <h1 className="mt-3 font-serif text-4xl leading-tight text-ink-900 sm:text-5xl">
              Understand an agreement before you sign it.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-500">
              NyayaLens reads rental, sale, employment and other agreements, pulls out the terms
              that matter, flags what deserves a second look, and shows you exactly where each
              finding comes from. It runs on your own machine.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="inline-flex h-10 items-center rounded bg-ink-800 px-5 text-sm font-medium text-paper-50 hover:bg-ink-700"
              >
                Create an account
              </Link>
              <Link
                href="/login"
                className="inline-flex h-10 items-center rounded border border-ink-200 bg-paper-50 px-5 text-sm font-medium text-ink-800 hover:bg-paper-200"
              >
                Sign in
              </Link>
            </div>
          </div>

          {/* A static preview of what a finding looks like. */}
          <div
            aria-hidden="true"
            className="rounded-lg border border-ink-200 bg-paper-50 p-5 shadow-panel"
          >
            <p className="text-xs font-medium text-ink-400">Agreement to Sell - consistency</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-sm border border-risk-border bg-risk-bg px-1.5 py-0.5 text-xs font-medium text-risk-text">
                HIGH
              </span>
              <span className="rounded-sm border border-review-border bg-review-bg px-1.5 py-0.5 text-xs font-medium text-review-text">
                Review required
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              The document states the sale consideration as &ldquo;₹23,70,000&rdquo; and
              &ldquo;₹33,70,000&rdquo;. This is a potential inconsistency - review which value is
              intended.
            </p>
            <div className="mt-4 space-y-2 border-t border-ink-100 pt-4 font-serif text-sm text-ink-600">
              <p>
                3. CONSIDERATION - &hellip; a total sale consideration of{" "}
                <mark className="rounded-sm bg-saffron-100 px-0.5 text-ink-800">₹23,70,000</mark>{" "}
                &hellip;
              </p>
              <p>
                SCHEDULE - &hellip; for a price of{" "}
                <mark className="rounded-sm bg-saffron-100 px-0.5 text-ink-800">₹33,70,000</mark>{" "}
                &hellip;
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-ink-200 py-12">
          <ul className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <h2 className="text-section-title text-ink-800">{f.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-ink-200 py-12">
          <h2 className="text-section-title text-ink-800">Supported agreements</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {DOMAINS.map((d) => (
              <li
                key={d}
                className="rounded-full border border-ink-200 bg-paper-50 px-3 py-1 text-sm text-ink-600"
              >
                {d}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-ink-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-ink-400 sm:px-6">
          <span>A research and decision-support tool. It does not provide legal advice.</span>
          <Link href="/research" className="hover:text-ink-600">
            Research and evaluation
          </Link>
        </div>
      </footer>
    </div>
  );
}
