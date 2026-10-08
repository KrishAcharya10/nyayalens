import type { ReactElement } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObligationsTab } from "./ObligationsTab";
import { ConsistencyTab } from "./ConsistencyTab";
import { DetectionNotice, DomainOverviewCard } from "./DomainOverviewCard";
import { exampleQuestionsFor } from "./IntelligencePanel";
import { EvidenceFocusProvider } from "./EvidenceFocusContext";
import { AskPanel } from "./AskPanel";
import * as api from "@/lib/api";
import type { DocumentOverview, Obligation, Risk } from "@/lib/apiTypes";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, askDocument: vi.fn() };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(api.askDocument).mockReset();
});

const wrap = (ui: ReactElement) => render(<EvidenceFocusProvider>{ui}</EvidenceFocusProvider>);

const OVERVIEW: DocumentOverview = {
  domain: "sale_property",
  domainName: "Sale of Property",
  documentType: "AGREEMENT_TO_SELL",
  detection: null,
  fields: [
    {
      label: "BUYER",
      displayName: "Buyer",
      coreType: "PARTY",
      value: "Asha Rao",
      values: ["Asha Rao", "Vikram Shah"],
      normalized: null,
      evidence: { entityId: "e1", textStart: 0, textEnd: 8 },
    },
    {
      label: "SALE_CONSIDERATION",
      displayName: "Sale consideration",
      coreType: "MONEY",
      value: "Rs. 23,70,000",
      values: ["Rs. 23,70,000"],
      normalized: { amount: 2370000, currency: "INR" },
      evidence: { entityId: "e2", textStart: 20, textEnd: 33 },
    },
    {
      label: "POSSESSION_DATE",
      displayName: "Possession date",
      coreType: "DATE",
      value: null,
      values: [],
      normalized: null,
      evidence: null,
    },
  ],
};

describe("DomainOverviewCard (Phase 8)", () => {
  it("shows the pack's fields with values, and 'not found' rather than a guess for absent ones", () => {
    wrap(<DomainOverviewCard overview={OVERVIEW} />);
    expect(screen.getByText("Sale of Property")).toBeInTheDocument();
    expect(screen.getByText("Asha Rao, Vikram Shah")).toBeInTheDocument();
    expect(screen.getByText("Rs. 23,70,000")).toBeInTheDocument();
    expect(screen.getByText("Not found in the document")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "View" })).toHaveLength(2);
  });

  it("derives domain-specific example questions from fields the document has", () => {
    expect(exampleQuestionsFor(OVERVIEW)).toEqual([
      "Who is the buyer?",
      "What is the sale consideration?",
    ]);
    expect(exampleQuestionsFor(null)).toBeUndefined();
  });
});

describe("DetectionNotice (Phase 8)", () => {
  const base = {
    predictedDomain: "employment",
    predictedDocumentType: "OFFER_LETTER",
    candidateDomains: [],
    supportingSignals: ["title: offer letter"],
    method: "deterministic-signals-v1",
    declaredDomain: "residential_rental",
  };

  it("warns on a declared/detected mismatch with signals and no probability", () => {
    render(<DetectionNotice detection={{ ...base, agreesWithDeclared: false }} />);
    const notice = screen.getByTestId("detection-notice");
    expect(notice).toHaveTextContent(/Review required/);
    expect(notice).toHaveTextContent(/title: offer letter/);
    expect(notice).not.toHaveTextContent(/%/);
  });

  it("renders nothing when detection agrees", () => {
    const { container } = render(
      <DetectionNotice detection={{ ...base, agreesWithDeclared: true }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ObligationsTab (Phase 8)", () => {
  const ob: Obligation = {
    actorLabel: "BUYER",
    actorEntityId: "e1",
    actorText: "the Buyer",
    action: "PAY",
    unexpectedActor: false,
    amountEntityId: "e2",
    amountLabel: "BALANCE",
    amountInr: 2000000,
    deadlineIso: null,
    deadlineText: "within 30 days",
    frequency: null,
    condition: null,
    sourceClauseId: "c1",
    textStart: 0,
    textEnd: 50,
    evidenceText: "The Buyer shall pay the balance within 30 days.",
  };

  it("renders ACTOR must ACTION with amount, deadline and the evidence sentence", () => {
    wrap(
      <ObligationsTab
        obligations={[ob, { ...ob, actorLabel: "SELLER", unexpectedActor: true, textStart: 60 }]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("Buyer")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Pay")).toBeInTheDocument();
    expect(within(items[0]!).getByText("INR 20,00,000")).toBeInTheDocument();
    expect(within(items[0]!).getByText("within 30 days")).toBeInTheDocument();
    expect(within(items[0]!).queryByText(/unusual actor/)).toBeNull();
    expect(within(items[1]!).getByText(/Review required: unusual actor/)).toBeInTheDocument();
  });

  it("shows an empty state when nothing was extracted", () => {
    wrap(<ObligationsTab obligations={[]} />);
    expect(
      screen.getByText("No obligations were extracted from this document."),
    ).toBeInTheDocument();
  });
});

describe("ConsistencyTab (Phase 8)", () => {
  const risk = (over: Partial<Risk>): Risk => ({
    id: "r1",
    documentId: "d",
    category: "FINANCIAL_CONTRADICTION",
    severity: "HIGH",
    reason: "Potential issue: the sale consideration is stated as Rs. 23,70,000 and Rs. 33,70,000.",
    pass: "CONSISTENCY",
    modelSource: "RULE_BASED",
    evidence: [],
    textStart: null,
    textEnd: null,
    createdAt: "",
    ruleId: "sale_consideration_single",
    reviewRequired: true,
    ...over,
  });

  it("lists only consistency findings, marked for review", () => {
    wrap(
      <ConsistencyTab risks={[risk({}), risk({ id: "r2", pass: "PASS_1", reason: "other" })]} />,
    );
    expect(screen.getByText(/23,70,000 and Rs. 33,70,000/)).toBeInTheDocument();
    expect(screen.queryByText("other")).toBeNull();
    expect(screen.getByText("Review required")).toBeInTheDocument();
  });
});

describe("AskPanel (Phase 8 structured answers)", () => {
  function stubStats() {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            rag: null,
            ragSecurity: null,
            adversarial: null,
            ordinaryControlFalsePositiveRate: null,
          }),
      }),
    );
  }

  it("shows domain example questions, clause/page on sources and structured evidence wording", async () => {
    stubStats();
    vi.mocked(api.askDocument).mockResolvedValue({
      answer: "The document states: Rs. 23,70,000",
      grounded: true,
      evidenceStatus: "GROUNDED",
      method: "structured",
      sources: [
        {
          chunkId: "e2",
          documentId: "doc-1",
          chunkType: "entity",
          textStart: 20,
          textEnd: 33,
          excerpt: "Rs. 23,70,000",
          clauseId: "c3",
          clauseType: "CONSIDERATION",
          clauseNumber: "3",
          page: 1,
        },
      ],
    });
    wrap(<AskPanel documentId="doc-1" exampleQuestions={["What is the sale consideration?"]} />);
    await userEvent.click(screen.getByRole("button", { name: "What is the sale consideration?" }));
    expect(await screen.findByText(/Clause 3 - Consideration/)).toBeInTheDocument();
    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-status-indicator")).toHaveTextContent(
      /extracted from the exact text/,
    );
  });

  it("shows the backend's reason on a structured NOT_SUFFICIENT answer", async () => {
    stubStats();
    vi.mocked(api.askDocument).mockResolvedValue({
      answer:
        "This sale of property does not contain a probation period - that is a term of a different kind of document.",
      grounded: false,
      evidenceStatus: "NOT_SUFFICIENT",
      method: "structured",
      sources: [],
    });
    wrap(<AskPanel documentId="doc-1" />);
    await userEvent.type(screen.getByLabelText(/Ask a question/), "What is the probation period?");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByTestId("refusal-state")).toHaveTextContent(
      /different kind of document/,
    );
  });
});
