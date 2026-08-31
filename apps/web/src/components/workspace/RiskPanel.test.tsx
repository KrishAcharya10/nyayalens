import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RiskPanel } from "./RiskPanel";
import { EvidenceFocusProvider } from "./EvidenceFocusContext";
import type { Risk } from "@/lib/apiTypes";

function makeRisk(overrides: Partial<Risk>): Risk {
  return {
    id: "risk-1",
    documentId: "doc-1",
    category: "LIABILITY_SHIFT",
    severity: "HIGH",
    reason:
      "This maintenance clause assigns structural repairs to the Tenant - normally a Landlord's responsibility. This may be a potentially unfavorable shift of liability and warrants review before signing.",
    pass: "PASS_1",
    modelSource: "RULE_BASED",
    evidence: [
      {
        sourceTable: "document_clauses",
        sourceId: "c1",
        documentId: "doc-1",
        textStart: 0,
        textEnd: 10,
        text: "clause text",
      },
    ],
    textStart: 0,
    textEnd: 10,
    createdAt: "",
    ...overrides,
  };
}

function renderPanel(risks: Risk[]) {
  return render(
    <EvidenceFocusProvider>
      <RiskPanel risks={risks} />
    </EvidenceFocusProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          rag: null,
          ragSecurity: null,
          adversarial: {
            totalDocuments: 150,
            categories: [
              { category: "LIABILITY_SHIFT", detectionRate: 1, controlFalsePositiveRate: 0 },
              { category: "ASYMMETRIC_OBLIGATION", detectionRate: 1, controlFalsePositiveRate: 0 },
            ],
          },
          ordinaryControlFalsePositiveRate: 0.19,
        }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RiskPanel (Phase 7B, Section 17)", () => {
  it("renders the backend's reason text byte-for-byte, never strengthened into a definitive conclusion", () => {
    const risk = makeRisk({});
    renderPanel([risk]);
    expect(screen.getByText(risk.reason)).toBeInTheDocument();
  });

  it("never renders definitive legal-judgment language anywhere in a risk card, for any category/severity", () => {
    const risks: Risk[] = [
      makeRisk({ id: "r1", category: "LIABILITY_SHIFT", severity: "HIGH" }),
      makeRisk({
        id: "r2",
        category: "ASYMMETRIC_OBLIGATION",
        severity: "MEDIUM",
        pass: "PASS_2",
        reason:
          "The notice periods required from each party differ substantially (15 days vs 60 days) for what appears to be the same kind of termination right. This may be a potentially unfavorable imbalance and warrants review before signing.",
        evidence: [
          {
            sourceTable: "document_clauses",
            sourceId: "c1",
            documentId: "doc-1",
            textStart: 0,
            textEnd: 5,
            text: "a",
          },
          {
            sourceTable: "document_clauses",
            sourceId: "c2",
            documentId: "doc-1",
            textStart: 5,
            textEnd: 10,
            text: "b",
          },
        ],
      }),
      makeRisk({
        id: "r3",
        category: "MISSING_CLAUSE",
        severity: "LOW",
        reason:
          "No dispute resolution clause was found in this document. This may be a potentially significant omission and warrants review before signing.",
      }),
    ];
    renderPanel(risks);

    const rendered = document.body.textContent ?? "";
    for (const phrase of [
      "is illegal",
      "is invalid",
      "is void",
      "is unenforceable",
      "is unlawful",
    ]) {
      expect(rendered.toLowerCase()).not.toContain(phrase);
    }
  });

  it("always shows the permanent 'not legal advice' notice, even with zero risks", () => {
    renderPanel([]);
    expect(
      screen.getByText(
        "Risk findings identify provisions that may warrant review. They are not legal conclusions or legal advice.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the correct empty state when there are no risk findings", () => {
    renderPanel([]);
    expect(screen.getByText("No potential issues flagged in this document.")).toBeInTheDocument();
  });

  it("never frames the adversarial benchmark result as a headline '100% accurate'/'100% risk detection' claim, even though the underlying rate is 1.00", async () => {
    renderPanel([makeRisk({})]);
    const notice = await screen.findByText(/controlled adversarial benchmark/);
    const noticeText = notice.closest("div")?.textContent?.toLowerCase() ?? "";
    expect(noticeText).not.toContain("100% accurate");
    expect(noticeText).not.toContain("100% risk detection");
    expect(noticeText).toContain("not a guarantee of accuracy");
  });

  it("groups risks by severity, high first", () => {
    renderPanel([
      makeRisk({ id: "low", severity: "LOW", category: "MISSING_CLAUSE" }),
      makeRisk({ id: "high", severity: "HIGH", category: "LIABILITY_SHIFT" }),
    ]);
    const headings = screen.getAllByText(/severity/i).map((el) => el.textContent);
    const highIndex = headings.findIndex((h) => h?.includes("High"));
    const lowIndex = headings.findIndex((h) => h?.includes("Low"));
    expect(highIndex).toBeLessThan(lowIndex);
  });
});
