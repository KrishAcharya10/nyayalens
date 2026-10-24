import { describe, expect, it } from "vitest";
import { getDomainPackRegistry } from "../src/domains/index.js";
// The web app keeps a small static copy of the registry's display data, so
// list views and the landing page can show domains without a network round
// trip. This test is what keeps that copy honest.
import { domainForDocumentType } from "../../web/src/lib/domains.js";
import { formatDocumentType } from "../../web/src/lib/format.js";

const registry = getDomainPackRegistry();

describe("web display tables agree with the DomainPack registry", () => {
  it("assigns every registered document type to its pack's domain", () => {
    for (const pack of registry.list()) {
      for (const dt of pack.documentTypes) {
        const shown = domainForDocumentType(dt.id);
        expect(shown.id, `${dt.id} belongs to ${pack.id}`).toBe(pack.id);
      }
    }
  });

  it("labels every registered document type exactly as the registry does", () => {
    for (const pack of registry.list()) {
      for (const dt of pack.documentTypes) {
        expect(formatDocumentType(dt.id), dt.id).toBe(dt.label);
      }
    }
  });

  it("names every registered domain, and has a display entry for no unregistered one", () => {
    const names = new Set(
      registry.list().map((p) => domainForDocumentType(p.documentTypes[0]!.id).name),
    );
    expect(names.size).toBe(registry.list().length);
    expect(domainForDocumentType("NOT_A_TYPE").id).toBe("other");
  });
});
