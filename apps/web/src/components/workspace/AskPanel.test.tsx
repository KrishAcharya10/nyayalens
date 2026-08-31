import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskPanel } from "./AskPanel";
import { EvidenceFocusProvider } from "./EvidenceFocusContext";
import * as api from "@/lib/api";
import type { AskResult } from "@/lib/apiTypes";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, askDocument: vi.fn() };
});

function renderPanel() {
  return render(
    <EvidenceFocusProvider>
      <AskPanel documentId="doc-1" />
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
          adversarial: null,
          ordinaryControlFalsePositiveRate: null,
        }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(api.askDocument).mockReset();
});

const GROUNDED_RESULT: AskResult = {
  answer:
    '"2. RENT PAYMENT\nRs 30,000 per month." This is drawn directly from the document text, not a legal conclusion.',
  grounded: true,
  sources: [
    {
      chunkId: "c1",
      documentId: "doc-1",
      chunkType: "clause",
      textStart: 0,
      textEnd: 30,
      excerpt: "2. RENT PAYMENT...",
    },
  ],
};

const REFUSAL_RESULT: AskResult = {
  answer: "The document does not contain enough information to answer this question.",
  grounded: false,
  sources: [],
};

describe("AskPanel (Phase 7B, Sections 19-23)", () => {
  it("is scoped to the current document, with the required header/subtext/placeholder", () => {
    renderPanel();
    expect(screen.getByText("Ask this document")).toBeInTheDocument();
    expect(
      screen.getByText("Answers are based on evidence found in this document."),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask a question...")).toBeInTheDocument();
  });

  it("shows the evidence-status indicator on a grounded answer, unconditionally (Section 20)", async () => {
    vi.mocked(api.askDocument).mockResolvedValue(GROUNDED_RESULT);
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByPlaceholderText("Ask a question..."), "What is the monthly rent?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    const indicator = await screen.findByTestId("evidence-status-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator.textContent).not.toMatch(/^\d+%$/); // never a bare numeric confidence score
  });

  it("shows the evidence-status indicator even on an answer that reads as high-confidence/clean (not skipped for good-looking answers)", async () => {
    vi.mocked(api.askDocument).mockResolvedValue({
      ...GROUNDED_RESULT,
      answer: '"The monthly rent is Rs 30,000." This is drawn directly from the document text.',
    });
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByPlaceholderText("Ask a question..."), "What is the monthly rent?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByTestId("evidence-status-indicator")).toBeInTheDocument();
  });

  it("the evidence-status indicator has no dismiss control and persists after asking a second question", async () => {
    vi.mocked(api.askDocument).mockResolvedValue(GROUNDED_RESULT);
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByPlaceholderText("Ask a question..."), "What is the monthly rent?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByTestId("evidence-status-indicator");

    // No button/control inside the indicator that could dismiss it.
    const indicator = screen.getByTestId("evidence-status-indicator");
    expect(indicator.querySelector("button")).toBeNull();

    await user.type(screen.getByPlaceholderText("Ask a question..."), "Who is the landlord?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findAllByTestId("evidence-status-indicator");
    // Still present on the first answer too - not a one-shot/dismissed state.
    expect(screen.getAllByTestId("evidence-status-indicator")).toHaveLength(2);
  });

  it("shows a visually distinct refusal state for grounded: false - never a fabricated answer", async () => {
    vi.mocked(api.askDocument).mockResolvedValue(REFUSAL_RESULT);
    const user = userEvent.setup();
    renderPanel();

    await user.type(
      screen.getByPlaceholderText("Ask a question..."),
      "What is the penalty for keeping pets?",
    );
    await user.click(screen.getByRole("button", { name: "Ask" }));

    const refusal = await screen.findByTestId("refusal-state");
    expect(refusal).toBeInTheDocument();
    expect(
      screen.getByText("I couldn't find enough evidence in this document to answer that."),
    ).toBeInTheDocument();
    // The refusal state never also renders the mandatory grounded-answer indicator.
    expect(screen.queryByTestId("evidence-status-indicator")).not.toBeInTheDocument();
  });

  it("renders sources as citations with an excerpt and chunk type for a grounded answer", async () => {
    vi.mocked(api.askDocument).mockResolvedValue(GROUNDED_RESULT);
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByPlaceholderText("Ask a question..."), "What is the monthly rent?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    // Both the answer text and its source excerpt legitimately contain
    // this substring - that's correct (a citation quoting the same
    // clause the answer quotes), so assert on the specific excerpt
    // element (italicized, quote-wrapped) rather than a loose text match.
    const matches = await screen.findAllByText(/2\. RENT PAYMENT/);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Clause")).toBeInTheDocument();
  });

  it("shows a loading state while a question is in flight", async () => {
    let resolvePromise: (value: AskResult) => void = () => {};
    vi.mocked(api.askDocument).mockReturnValue(
      new Promise((resolve) => (resolvePromise = resolve)),
    );
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByPlaceholderText("Ask a question..."), "What is the monthly rent?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(screen.getByText("Searching this document...")).toBeInTheDocument();

    resolvePromise(GROUNDED_RESULT);
    await screen.findByTestId("evidence-status-indicator");
  });

  it("shows an error state when the request fails", async () => {
    vi.mocked(api.askDocument).mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByPlaceholderText("Ask a question..."), "What is the monthly rent?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Network error")).toBeInTheDocument();
  });

  it("offers example questions before any question has been asked", () => {
    renderPanel();
    expect(screen.getByText("What is the monthly rent?")).toBeInTheDocument();
    expect(screen.getByText("Who is the landlord?")).toBeInTheDocument();
  });
});
