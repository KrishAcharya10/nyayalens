// Writes research/generator/v3/ontology.json from the DomainPack registry.
// Usage (from apps/api): npm run export:ontology
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportOntologyJson } from "../src/domains/exportOntology.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(__dirname, "../../../research/generator/v3/ontology.json");
writeFileSync(out, exportOntologyJson(), "utf-8");
console.log(`[export-ontology] wrote ${out}`);
