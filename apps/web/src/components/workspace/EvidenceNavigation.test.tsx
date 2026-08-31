import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentViewer } from "./DocumentViewer";
import { EvidenceButton } from "./EvidenceButton";
import { EvidenceFocusProvider } from "./EvidenceFocusContext";
import type { DocumentClause } from "@/lib/apiTypes";

function makeClause(id: string, start: number, end: number): DocumentClause {
  return {
    id,
    documentId: "doc-1",
    clauseType: "NOTICE_PERIOD",
    clauseNumber: null,
    text: null,
    textStart: start,
    textEnd: end,
    pageNumber: null,
    modelSource: "RULE_BASED",
    confidence: null,
    createdAt: "",
  };
}

// Section 12's specific, testable requirement: a Pass 2 risk finding's
// evidence click-through must highlight ALL compared spans, not just one.
describe("Multi-span evidence navigation (Phase 7B, Section 12)", () => {
  it("scrolls to and flash-highlights BOTH clauses of a two-span (Pass 2) finding when its evidence button is clicked", async () => {
    const user = userEvent.setup();
    const text = "5. NOTICE (LANDLORD)\nfifteen days.6. NOTICE (TENANT)\nsixty days.";
    const clauseA = makeClause("clause-a", 0, 34);
    const clauseB = makeClause("clause-b", 34, text.length);

    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;

    render(
      <EvidenceFocusProvider>
        <EvidenceButton
          clauseIds={["clause-a", "clause-b"]}
          label="View all evidence in document"
        />
        <DocumentViewer canonicalText={text} clauses={[clauseA, clauseB]} entities={[]} />
      </EvidenceFocusProvider>,
    );

    await user.click(screen.getByText("View all evidence in document"));

    const elA = document.getElementById("clause-clause-a");
    const elB = document.getElementById("clause-clause-b");
    expect(elA).toBeInTheDocument();
    expect(elB).toBeInTheDocument();
    // Both elements received the flash-highlight animation class - not
    // just the first one.
    expect(elA?.classList.contains("animate-flash-highlight")).toBe(true);
    expect(elB?.classList.contains("animate-flash-highlight")).toBe(true);
    // Scroll was invoked (for the first/primary target) as part of the
    // same navigation action.
    expect(scrollSpy).toHaveBeenCalled();
  });

  it("re-triggers the highlight even when the exact same evidence is clicked twice in a row", async () => {
    const user = userEvent.setup();
    const text = "1. NOTICE\nfifteen days.";
    const clause = makeClause("clause-a", 0, text.length);

    render(
      <EvidenceFocusProvider>
        <EvidenceButton clauseIds={["clause-a"]} />
        <DocumentViewer canonicalText={text} clauses={[clause]} entities={[]} />
      </EvidenceFocusProvider>,
    );

    const button = screen.getByText("View in document");
    await user.click(button);
    const el = document.getElementById("clause-clause-a")!;
    expect(el.classList.contains("animate-flash-highlight")).toBe(true);

    // Manually remove the class to simulate the CSS animation finishing,
    // then click again - it must be re-added, proving re-focus works.
    el.classList.remove("animate-flash-highlight");
    await user.click(button);
    expect(el.classList.contains("animate-flash-highlight")).toBe(true);
  });

  it("disables the evidence action and states plainly when no real document location exists (never fabricates one)", () => {
    render(
      <EvidenceFocusProvider>
        <EvidenceButton clauseIds={[]} entityIds={[]} />
      </EvidenceFocusProvider>,
    );
    const button = screen.getByText("No document location available");
    expect(button).toBeDisabled();
  });
});
