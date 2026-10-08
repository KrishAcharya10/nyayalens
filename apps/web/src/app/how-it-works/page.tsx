"use client";

import { AppShell } from "@/components/shell/AppShell";
import { useRequireAuth } from "@/lib/AuthProvider";
import { PermanentNotice } from "@/components/ui/PermanentNotice";

const STEPS = [
  {
    title: "Document processed",
    body: "Your PDF or DOCX is converted to canonical text, page by page.",
  },
  {
    title: "Domain checked",
    body: "The document's title and wording are compared with the type you chose. If they point to a different kind of agreement, you are told - nothing is silently re-labelled.",
  },
  {
    title: "Entities and clauses extracted",
    body: "Rule-based extraction, scoped to the document's domain, identifies parties, amounts, dates, and clauses using patterns grounded in the underlying document structure.",
  },
  {
    title: "Facts and obligations built",
    body: 'Values are normalized (amounts in rupees, dates, durations) and linked into relations and obligations such as "the Buyer must pay the balance within 30 days".',
  },
  {
    title: "Risks and inconsistencies identified",
    body: "A two-pass risk engine checks individual clauses and compares clauses/entities against each other; a consistency engine checks values the document states more than once.",
  },
  {
    title: "Evidence linked to source text",
    body: "Every entity, clause, and risk finding carries exact character offsets back into the document - nothing is presented without a real source location.",
  },
  {
    title: "Answers grounded in document evidence",
    body: "Questions are answered only from retrieved passages of this document, never from general knowledge - and only when supporting text was actually found.",
  },
];

// Section 29: additive to, never a replacement for, the permanent
// per-instance indicators in the risk panel and Ask panel - this page
// explains the pipeline; it doesn't carry the mandatory notices itself.
export default function HowItWorksPage() {
  const { isReady } = useRequireAuth();
  if (!isReady) return null;

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-2xl overflow-y-auto px-6 py-10">
        <h1 className="text-page-title text-ink-900">How NyayaLens works</h1>
        <p className="mt-1 text-sm text-ink-500">
          A short explanation of the pipeline behind entity extraction, risk findings, and grounded
          answers.
        </p>
        <ol className="mt-6 flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-medium text-ink-600">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-ink-800">{step.title}</p>
                <p className="mt-0.5 text-sm text-ink-500">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8">
          <PermanentNotice>
            NyayaLens supports seven domains: residential rental, leave and licence, land lease,
            sale of property, builder-buyer, employment, and NDA/service agreements. It identifies
            provisions that may warrant review and answers questions grounded in document evidence -
            it does not provide legal advice or definitive legal conclusions.
          </PermanentNotice>
        </div>
      </div>
    </AppShell>
  );
}
