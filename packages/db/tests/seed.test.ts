import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../generated/client/index.js";
import { readManifest, seedSynthetic, SEED_USER_EMAIL } from "../src/seed.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("synthetic seed", () => {
  it("inserts one document row per manifest.jsonl entry, correctly split by type", async () => {
    const manifest = await readManifest();
    expect(manifest.length).toBe(300);

    const result = await seedSynthetic(prisma, () => {});

    expect(result.manifestEntryCount).toBe(300);
    expect(result.inserted).toBe(300);
    expect(result.countsByType.residential_rental).toBe(150);
    expect(result.countsByType.land_lease).toBe(150);

    const seedUser = await prisma.user.findUniqueOrThrow({ where: { email: SEED_USER_EMAIL } });
    const dbCount = await prisma.document.count({
      where: { ownerId: seedUser.id, isSynthetic: true },
    });
    expect(dbCount).toBe(300);
  });

  it("is idempotent - rerunning does not duplicate rows", async () => {
    await seedSynthetic(prisma, () => {});
    const seedUser = await prisma.user.findUniqueOrThrow({ where: { email: SEED_USER_EMAIL } });
    const dbCount = await prisma.document.count({
      where: { ownerId: seedUser.id, isSynthetic: true },
    });
    expect(dbCount).toBe(300);
  });

  it("marks every seeded row as synthetic", async () => {
    const seedUser = await prisma.user.findUniqueOrThrow({ where: { email: SEED_USER_EMAIL } });
    const nonSynthetic = await prisma.document.count({
      where: { ownerId: seedUser.id, isSynthetic: false },
    });
    expect(nonSynthetic).toBe(0);
  });
});
