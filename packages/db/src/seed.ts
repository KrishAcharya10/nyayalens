import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import argon2 from "argon2";
import { DocumentType, PrismaClient } from "../generated/client/index.js";

// This script inserts document *metadata only* from the synthetic dataset's
// manifest - it does not read document text, run extraction, or populate
// entities/clauses/etc. Those are later-phase concerns.
//
// Every line this script prints about the loaded data is prefixed
// [SYNTHETIC] so seed output can never be mistaken for a real-data result.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(__dirname, "../../../research/data/synthetic/manifest.jsonl");

export const SEED_USER_EMAIL = "seed-demo@nyayalens.local";

export interface ManifestEntry {
  doc_id: string;
  document_type: "residential_rental" | "land_lease";
  n_entities: number;
  n_clauses: number;
  files: {
    text: string;
    docx: string;
    pdf: string;
    labels: string;
  };
}

export function toDocumentType(value: ManifestEntry["document_type"]): DocumentType {
  switch (value) {
    case "residential_rental":
      return DocumentType.RESIDENTIAL_RENTAL;
    case "land_lease":
      return DocumentType.LAND_LEASE;
    default: {
      const exhaustiveCheck: never = value;
      throw new Error(`Unknown document_type in manifest: ${String(exhaustiveCheck)}`);
    }
  }
}

export async function readManifest(manifestPath = MANIFEST_PATH): Promise<ManifestEntry[]> {
  const entries: ManifestEntry[] = [];
  const rl = createInterface({ input: createReadStream(manifestPath, "utf-8") });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    entries.push(JSON.parse(trimmed) as ManifestEntry);
  }
  return entries;
}

export interface SeedResult {
  seedUserEmail: string;
  manifestEntryCount: number;
  inserted: number;
  countsByType: Record<string, number>;
}

// Idempotent: safe to run repeatedly. Clears this script's own previously
// seeded synthetic documents before re-inserting, so row counts never grow
// unboundedly across reruns.
export async function seedSynthetic(
  prisma: PrismaClient,
  log: (msg: string) => void = console.log,
): Promise<SeedResult> {
  const seedPassword = randomBytes(18).toString("base64url");
  const passwordHash = await argon2.hash(seedPassword, { type: argon2.argon2id });

  const seedUser = await prisma.user.upsert({
    where: { email: SEED_USER_EMAIL },
    update: { passwordHash },
    create: { email: SEED_USER_EMAIL, passwordHash, role: "USER" },
  });

  log(`[SYNTHETIC] Seed demo user: ${SEED_USER_EMAIL}`);
  log(`[SYNTHETIC] Seed demo user password (this run only, dev use only): ${seedPassword}`);

  const manifest = await readManifest();
  log(`[SYNTHETIC] Loaded manifest.jsonl: ${manifest.length} document entries`);

  const deleted = await prisma.document.deleteMany({
    where: { ownerId: seedUser.id, isSynthetic: true },
  });
  if (deleted.count > 0) {
    log(`[SYNTHETIC] Cleared ${deleted.count} previously seeded synthetic documents`);
  }

  let inserted = 0;
  const countsByType: Record<string, number> = {};

  for (const entry of manifest) {
    await prisma.document.create({
      data: {
        ownerId: seedUser.id,
        title: entry.doc_id,
        documentType: toDocumentType(entry.document_type),
        isSynthetic: true,
        sourceFilename: entry.files.text,
      },
    });
    inserted += 1;
    countsByType[entry.document_type] = (countsByType[entry.document_type] ?? 0) + 1;
  }

  log(`[SYNTHETIC] Inserted ${inserted} document metadata rows`);
  for (const [type, count] of Object.entries(countsByType)) {
    log(`[SYNTHETIC]   ${type}: ${count}`);
  }
  log(
    "[SYNTHETIC] Reminder: these rows describe the synthetic dataset only. " +
      "Do not report any statistic derived from them as evidence of real-world " +
      "performance - see research/data/synthetic/dataset_card.md.",
  );

  return {
    seedUserEmail: seedUser.email,
    manifestEntryCount: manifest.length,
    inserted,
    countsByType,
  };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedSynthetic(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when executed directly (`tsx src/seed.ts`), not when imported by tests.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  });
}
