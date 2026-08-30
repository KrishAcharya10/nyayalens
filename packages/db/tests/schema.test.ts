import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../generated/client/index.js";

const prisma = new PrismaClient();
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      email: `schema-test-${randomUUID()}@nyayalens.local`,
      passwordHash: "not-a-real-hash",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

describe("document_type constraint", () => {
  it("accepts residential_rental and land_lease", async () => {
    const user = await makeUser();

    const rental = await prisma.document.create({
      data: { ownerId: user.id, title: "t1", documentType: "RESIDENTIAL_RENTAL" },
    });
    const lease = await prisma.document.create({
      data: { ownerId: user.id, title: "t2", documentType: "LAND_LEASE" },
    });

    expect(rental.documentType).toBe("RESIDENTIAL_RENTAL");
    expect(lease.documentType).toBe("LAND_LEASE");

    await prisma.document.deleteMany({ where: { id: { in: [rental.id, lease.id] } } });
  });

  it("rejects a document_type value outside the enum at the database level", async () => {
    const user = await makeUser();

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO documents (id, owner_id, title, document_type, is_synthetic, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'bad-type-doc', 'commercial_lease', false, now(), now())`,
        user.id,
      ),
    ).rejects.toThrow();
  });
});

describe("document_id grouping columns", () => {
  it("every derived-sample table carries a document_id foreign key", async () => {
    const user = await makeUser();
    const doc = await prisma.document.create({
      data: { ownerId: user.id, title: "grouping-test", documentType: "LAND_LEASE" },
    });

    const clause = await prisma.documentClause.create({
      data: { documentId: doc.id, clauseType: "TEST_CLAUSE" },
    });
    const entity = await prisma.entity.create({
      data: { documentId: doc.id, label: "TEST_ENTITY" },
    });
    const embedding = await prisma.embedding.create({
      data: { documentId: doc.id, sourceTable: "entities", sourceId: entity.id },
    });

    expect(clause.documentId).toBe(doc.id);
    expect(entity.documentId).toBe(doc.id);
    expect(embedding.documentId).toBe(doc.id);

    // Cascade delete keeps grouped samples consistent with their source document.
    await prisma.document.delete({ where: { id: doc.id } });
    expect(await prisma.documentClause.findUnique({ where: { id: clause.id } })).toBeNull();
    expect(await prisma.entity.findUnique({ where: { id: entity.id } })).toBeNull();
    expect(await prisma.embedding.findUnique({ where: { id: embedding.id } })).toBeNull();
  });
});
