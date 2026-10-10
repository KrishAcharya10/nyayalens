import Link from "next/link";
import type { ReactNode } from "react";

const POINTS = [
  "Seven kinds of Indian agreements - rental to NDA",
  "Every value, obligation and finding linked to its exact text",
  "Inconsistencies flagged, e.g. a price stated two different ways",
  "Runs entirely on your machine - nothing leaves it",
];

// Sign-in / register frame: the form on the right, a short statement of
// what the product does on the left (hidden on narrow screens, where the
// form alone is shown).
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-paper-100 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="hidden flex-col justify-between bg-ink-900 p-12 text-paper-50 lg:flex">
        <Link href="/" className="text-sm font-semibold tracking-[0.18em]">
          NYAYALENS
        </Link>
        <div className="max-w-md">
          <p className="font-serif text-3xl leading-snug">
            Read the agreement. See the evidence. Decide what needs review.
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-sm text-ink-200">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-saffron-500"
                />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-ink-400">
          A research and decision-support tool - not legal advice.{" "}
          <Link href="/research" className="underline hover:text-paper-50">
            How it works
          </Link>
        </p>
      </section>
      <section className="flex items-center justify-center px-4 py-12">{children}</section>
    </main>
  );
}
