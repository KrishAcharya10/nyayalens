import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

// Phase 8 /research page data: the CURRENT dataset report and evaluation
// results, read from the files the generator and the evaluation harness
// write (research/data/reports/dataset_quality.json,
// research/data/reports/v3_evaluation.json, the committed copy of the
// harness output). Same rule as /api/eval-stats:
// a missing file is reported as null, never replaced by a placeholder number.
const MONOREPO_ROOT = path.resolve(process.cwd(), "..", "..");

async function readJson(relativePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path.join(MONOREPO_ROOT, relativePath), "utf-8"));
  } catch {
    return null;
  }
}

export async function GET() {
  const [dataset, evaluation] = await Promise.all([
    readJson("research/data/reports/dataset_quality.json"),
    readJson("research/data/reports/v3_evaluation.json"),
  ]);
  return NextResponse.json({ dataset, evaluation });
}
