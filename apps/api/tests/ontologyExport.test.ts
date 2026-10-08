import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { exportOntologyJson } from "../src/domains/exportOntology.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMMITTED = path.resolve(__dirname, "../../../research/generator/v3/ontology.json");

// The Python generator and dataset validator read this file; if a pack
// changes without re-exporting, generated data would silently disagree
// with the app's ontology.
describe("research/generator/v3/ontology.json", () => {
  it("matches the DomainPack registry (run `npm run export:ontology` in apps/api if not)", () => {
    expect(readFileSync(COMMITTED, "utf-8").replace(/\r\n/g, "\n")).toBe(exportOntologyJson());
  });
});
