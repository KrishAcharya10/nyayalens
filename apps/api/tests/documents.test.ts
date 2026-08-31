import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "@nyayalens/db";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = createApp();
const prisma = getPrismaClient();

const PDF_FIXTURE = path.resolve(__dirname, "fixtures/sample_residential_rental.pdf");
const DOCX_FIXTURE = path.resolve(__dirname, "fixtures/sample_land_lease.docx");
const BLANK_PDF_FIXTURE = path.resolve(__dirname, "fixtures/sample_blank_scanned.pdf");

const createdEmails: string[] = [];

afterAll(async () => {
  if (createdEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  }
  await prisma.$disconnect();
});

async function registerUser(): Promise<{ email: string; accessToken: string }> {
  const email = `test-docs-${randomUUID()}@nyayalens.local`;
  createdEmails.push(email);
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "correct-horse-battery-staple" });
  return { email, accessToken: res.body.accessToken as string };
}

interface DocumentDetail {
  id: string;
  canonicalText: string | null;
  pages: Array<{ pageNumber: number; text: string | null; extractionMethod: string | null }>;
  processingJobs: Array<{ jobType: string; status: string; errorMessage: string | null }>;
}

async function waitForExtraction(
  accessToken: string,
  documentId: string,
  timeoutMs = 15000,
): Promise<DocumentDetail> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app)
      .get(`/documents/${documentId}`)
      .set("Authorization", `Bearer ${accessToken}`);
    const document = res.body.document as DocumentDetail;
    const extractionJob = document.processingJobs.find((j) => j.jobType === "text_extraction");
    if (
      extractionJob &&
      (extractionJob.status === "SUCCEEDED" || extractionJob.status === "FAILED")
    ) {
      return document;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for extraction of document ${documentId}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe("document upload + extraction (Phase 3)", () => {
  it("uploads a PDF, extracts native text, and persists pages", async () => {
    const user = await registerUser();
    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .field("documentType", "residential_rental")
      .attach("file", readFileSync(PDF_FIXTURE), "sample_residential_rental.pdf");

    expect(upload.status).toBe(201);
    expect(upload.body.mimeType).toBe("application/pdf");

    const document = await waitForExtraction(user.accessToken, upload.body.id as string);

    const extractionJob = document.processingJobs.find((j) => j.jobType === "text_extraction");
    expect(extractionJob?.status).toBe("SUCCEEDED");
    expect(document.canonicalText).toBeTruthy();
    expect(document.canonicalText!.length).toBeGreaterThan(50);
    expect(document.pages.length).toBeGreaterThan(0);
    expect(document.pages[0].extractionMethod).toBe("NATIVE");
  });

  it("uploads a DOCX and extracts it as a single page", async () => {
    const user = await registerUser();
    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .field("documentType", "land_lease")
      .attach("file", readFileSync(DOCX_FIXTURE), "sample_land_lease.docx");

    expect(upload.status).toBe(201);
    expect(upload.body.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    const document = await waitForExtraction(user.accessToken, upload.body.id as string);

    const extractionJob = document.processingJobs.find((j) => j.jobType === "text_extraction");
    expect(extractionJob?.status).toBe("SUCCEEDED");
    expect(document.canonicalText).toBeTruthy();
    expect(document.pages).toHaveLength(1);
    expect(document.pages[0].pageNumber).toBe(1);
    expect(document.pages[0].extractionMethod).toBe("NATIVE");
  });

  it("leaves a page with no usable native text unset (extractionMethod: null), deferred to OCR", async () => {
    const user = await registerUser();
    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .field("documentType", "residential_rental")
      .attach("file", readFileSync(BLANK_PDF_FIXTURE), "sample_blank_scanned.pdf");

    expect(upload.status).toBe(201);

    const document = await waitForExtraction(user.accessToken, upload.body.id as string);

    const extractionJob = document.processingJobs.find((j) => j.jobType === "text_extraction");
    expect(extractionJob?.status).toBe("SUCCEEDED");
    expect(document.pages).toHaveLength(1);
    expect(document.pages[0].extractionMethod).toBeNull();
    expect(document.pages[0].text).toBeNull();
    expect(document.canonicalText).toBe("");
  });

  it("rejects a file that is not a recognizable PDF or DOCX", async () => {
    const user = await registerUser();
    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .field("documentType", "residential_rental")
      .attach("file", Buffer.from("not a real document"), "fake.pdf");

    expect(upload.status).toBe(400);
  });

  it("rejects an unauthenticated upload", async () => {
    const upload = await request(app)
      .post("/documents")
      .field("documentType", "residential_rental")
      .attach("file", readFileSync(PDF_FIXTURE), "sample_residential_rental.pdf");

    expect(upload.status).toBe(401);
  });

  it("does not let a user read or delete another user's document", async () => {
    const owner = await registerUser();
    const other = await registerUser();

    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .field("documentType", "residential_rental")
      .attach("file", readFileSync(PDF_FIXTURE), "sample_residential_rental.pdf");
    const documentId = upload.body.id as string;

    const getAsOther = await request(app)
      .get(`/documents/${documentId}`)
      .set("Authorization", `Bearer ${other.accessToken}`);
    expect(getAsOther.status).toBe(404);

    const deleteAsOther = await request(app)
      .delete(`/documents/${documentId}`)
      .set("Authorization", `Bearer ${other.accessToken}`);
    expect(deleteAsOther.status).toBe(404);

    const stillThere = await request(app)
      .get(`/documents/${documentId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(stillThere.status).toBe(200);
  });

  it("deletes a document and its storage file", async () => {
    const user = await registerUser();
    const upload = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .field("documentType", "residential_rental")
      .attach("file", readFileSync(PDF_FIXTURE), "sample_residential_rental.pdf");
    const documentId = upload.body.id as string;
    await waitForExtraction(user.accessToken, documentId);

    const del = await request(app)
      .delete(`/documents/${documentId}`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(del.status).toBe(204);

    const getAfterDelete = await request(app)
      .get(`/documents/${documentId}`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(getAfterDelete.status).toBe(404);
  });
});
