import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import type { DomainPackSummary } from "@/lib/apiTypes";
import { UploadDocumentForm } from "./UploadDocumentForm";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, listDomainPacks: vi.fn(), uploadDocument: vi.fn() };
});

function pack(id: string, name: string, documentTypes: [string, string][]): DomainPackSummary {
  return {
    id,
    name,
    description: "",
    version: "1",
    documentTypes: documentTypes.map(([slug, label]) => ({ id: slug.toUpperCase(), slug, label })),
    entityTypes: [],
    clauseTypes: [],
    expectedClauseTypes: [],
  };
}

beforeEach(() => {
  vi.mocked(api.listDomainPacks).mockReset();
  vi.mocked(api.uploadDocument).mockReset();
});

describe("UploadDocumentForm (Phase 8: document types from /domain-packs)", () => {
  it("renders document types from the registry, grouped by domain", async () => {
    vi.mocked(api.listDomainPacks).mockResolvedValue([
      pack("residential_rental", "Residential Rental Agreement", [
        ["residential_rental", "Residential Rental"],
      ]),
      pack("sale_property", "Sale / Property", [
        ["agreement_to_sell", "Agreement to Sell"],
        ["sale_deed", "Sale Deed"],
      ]),
    ]);
    render(<UploadDocumentForm onUploaded={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Add document" }));

    expect(await screen.findByRole("option", { name: "Sale Deed" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Sale / Property" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("residential_rental");
  });

  it("uploads with the selected slug", async () => {
    vi.mocked(api.listDomainPacks).mockResolvedValue([
      pack("land_lease", "Land Lease Deed", [["land_lease", "Land Lease"]]),
    ]);
    vi.mocked(api.uploadDocument).mockResolvedValue({ id: "doc-1" });
    const onUploaded = vi.fn();
    render(<UploadDocumentForm onUploaded={onUploaded} />);
    await userEvent.click(screen.getByRole("button", { name: "Add document" }));
    await screen.findByRole("option", { name: "Land Lease" });

    const file = new File(["%PDF-1.4"], "deed.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText(/File/), file);
    // Submit the form directly: jsdom reports a `required` file input as
    // invalid even after userEvent.upload attaches a file, and so blocks a
    // click-triggered submit (browsers don't).
    fireEvent.submit(screen.getByRole("button", { name: "Upload" }).closest("form")!);

    await waitFor(() => expect(api.uploadDocument).toHaveBeenCalledWith(file, "land_lease"));
    expect(onUploaded).toHaveBeenCalled();
  });

  it("shows an error and keeps Upload disabled when document types cannot be loaded", async () => {
    vi.mocked(api.listDomainPacks).mockRejectedValue(new Error("Network down"));
    render(<UploadDocumentForm onUploaded={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Add document" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });
});
