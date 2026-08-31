import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { EmptyState, ErrorState, LoadingState } from "./States";

// Section 28: proper empty/loading/error states everywhere - never a
// blank area.
describe("EmptyState / LoadingState / ErrorState (Phase 7B, Section 28)", () => {
  it("EmptyState renders a real, specific title (never blank)", () => {
    render(<EmptyState title="No entities were extracted." />);
    expect(screen.getByText("No entities were extracted.")).toBeInTheDocument();
  });

  it("LoadingState renders a status role and a specific label", () => {
    render(<LoadingState label="Analyzing document..." />);
    expect(screen.getByRole("status")).toHaveTextContent("Analyzing document...");
  });

  it("ErrorState renders an alert role with the real error message and an optional retry action", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState message="Could not load this document" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load this document");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("ErrorState omits the retry button when no retry handler is given", () => {
    render(<ErrorState message="Fatal" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
