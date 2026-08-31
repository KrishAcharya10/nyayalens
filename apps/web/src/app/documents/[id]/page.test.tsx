import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DocumentWorkspacePage from "./page";
import * as api from "@/lib/api";
import { NotFoundError } from "@/lib/api";
import { AuthProvider } from "@/lib/AuthProvider";

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "doc-1" }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => "/documents/doc-1",
}));

vi.mock("@/lib/AuthProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/AuthProvider")>();
  return {
    ...actual,
    useRequireAuth: () => ({ isReady: true }),
    useHandleUnauthorized: () => (err: unknown) =>
      err instanceof Error && err.name === "UnauthorizedError",
  };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDocument: vi.fn(),
    getEntities: vi.fn(),
    getClauses: vi.fn(),
    getRisks: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(api.getEntities).mockResolvedValue([]);
  vi.mocked(api.getClauses).mockResolvedValue([]);
  vi.mocked(api.getRisks).mockResolvedValue([]);
});

// Section 14 / DoD: ownership errors are handled correctly - no partial
// render of stale/empty document data on a 403/404.
describe("DocumentWorkspacePage ownership handling (Phase 7B)", () => {
  it("renders ONLY a not-found state on a 404 (cross-user access), never a partial workspace", async () => {
    vi.mocked(api.getDocument).mockRejectedValue(new NotFoundError());

    render(
      <AuthProvider>
        <DocumentWorkspacePage />
      </AuthProvider>,
    );

    expect(await screen.findByText("Document not found.")).toBeInTheDocument();
    // None of the workspace chrome (viewer, intelligence panel tabs) renders.
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Ask this document")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("renders the full workspace only once the document actually loads successfully", async () => {
    vi.mocked(api.getDocument).mockResolvedValue({
      id: "doc-1",
      ownerId: "user-1",
      title: "Test Lease",
      documentType: "RESIDENTIAL_RENTAL",
      isSynthetic: true,
      isAdversarial: false,
      isAdversarialControl: false,
      sourceFilename: null,
      storageKey: null,
      mimeType: "application/pdf",
      fileSizeBytes: 1000,
      canonicalText: "1. RENT PAYMENT\nRs 30000 per month.",
      keyFindings: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      pages: [],
      processingJobs: [],
    });

    render(
      <AuthProvider>
        <DocumentWorkspacePage />
      </AuthProvider>,
    );
    expect(await screen.findByRole("tablist")).toBeInTheDocument();
    expect(screen.getByText("Test Lease")).toBeInTheDocument();
  });
});
