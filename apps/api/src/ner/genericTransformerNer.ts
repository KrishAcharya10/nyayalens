import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import type { ExtractedEntityCandidate } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_NER_SCRIPT = path.resolve(__dirname, "../../../../services/ml/baseline_ner.py");

export class GenericTransformerNerUnavailableError extends Error {}

interface PythonEntity {
  label: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
  modelName: string;
}

// Runs the stock pretrained NER baseline (services/ml/baseline_ner.py) as
// a subprocess. Stateless request/response over stdin/stdout - see that
// script's docstring for why this baseline's output labels are prefixed
// GENERIC_ and are not NyayaLens's domain ontology.
export async function runGenericTransformerNer(text: string): Promise<ExtractedEntityCandidate[]> {
  if (!env.ML_SERVICE_PYTHON) {
    throw new GenericTransformerNerUnavailableError(
      "ML_SERVICE_PYTHON is not configured - see services/ml/README.md",
    );
  }
  if (!text.trim()) return [];

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(env.ML_SERVICE_PYTHON, [BASELINE_NER_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString("utf-8")));
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString("utf-8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`baseline_ner.py exited with code ${code}: ${err}`));
        return;
      }
      resolve(out);
    });

    child.stdin.write(JSON.stringify({ text }));
    child.stdin.end();
  });

  const parsed = JSON.parse(stdout) as PythonEntity[];
  return parsed.map((e) => ({
    label: e.label,
    text: e.text,
    textStart: e.start,
    textEnd: e.end,
    confidence: e.confidence,
    modelName: e.modelName,
  }));
}
