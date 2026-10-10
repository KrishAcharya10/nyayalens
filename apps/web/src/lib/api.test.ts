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
  sessionStorage.clear();
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

  it("refreshes an expired access token once and retries the request", async () => {
    sessionStorage.setItem("nyayalens_access_token", "expired");
    sessionStorage.setItem("nyayalens_refresh_token", "refresh-1");
    const document = { id: "doc-1", title: "Real Document" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: "Token expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "fresh", refreshToken: "refresh-2" }))
      .mockResolvedValueOnce(jsonResponse(200, { document }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getDocument("doc-1")).resolves.toMatchObject({ id: "doc-1" });
    expect(fetchMock.mock.calls[1]![0]).toMatch(/\/auth\/refresh$/);
    const retried = fetchMock.mock.calls[2]![1] as RequestInit;
    expect(new Headers(retried.headers).get("Authorization")).toBe("Bearer fresh");
    expect(sessionStorage.getItem("nyayalens_refresh_token")).toBe("refresh-2");
  });

  it("still throws UnauthorizedError when the refresh token is rejected", async () => {
    sessionStorage.setItem("nyayalens_refresh_token", "revoked");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, { error: "Token expired" }))
        .mockResolvedValueOnce(jsonResponse(401, { error: "Refresh token revoked" })),
    );
    await expect(getDocument("doc-1")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
