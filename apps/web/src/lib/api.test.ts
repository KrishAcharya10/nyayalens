import { afterEach, describe, expect, it, vi } from "vitest";
import { getDocument, NotFoundError, UnauthorizedError } from "./api";

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api.ts response classification", () => {
  it("throws UnauthorizedError on a 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(401, { error: "Missing bearer token" })),
    );
    await expect(getDocument("doc-1")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError on a 403 (ownership denial without confirming existence)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(403, { error: "Insufficient role" })),
    );
    await expect(getDocument("doc-1")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws NotFoundError on a 404, never returning fabricated document data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(404, { error: "Document not found" })),
    );
    await expect(getDocument("doc-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("resolves with the real document on a 200", async () => {
    const document = { id: "doc-1", title: "Real Document" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { document })));
    await expect(getDocument("doc-1")).resolves.toMatchObject({
      id: "doc-1",
      title: "Real Document",
    });
  });
});
