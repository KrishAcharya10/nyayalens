/*
  Warnings:

  - Added the required column `model_source` to the `document_clauses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `model_source` to the `entities` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "extraction_method" AS ENUM ('NATIVE', 'OCR');

-- CreateEnum
CREATE TYPE "model_source" AS ENUM ('rule_based', 'generic_transformer', 'fine_tuned');

-- AlterTable
ALTER TABLE "document_clauses" ADD COLUMN     "model_source" "model_source" NOT NULL;

-- AlterTable
ALTER TABLE "document_pages" ADD COLUMN     "extraction_method" "extraction_method",
ADD COLUMN     "ocr_confidence" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "file_size_bytes" INTEGER,
ADD COLUMN     "mime_type" TEXT,
ADD COLUMN     "storage_key" TEXT;

-- AlterTable
ALTER TABLE "entities" ADD COLUMN     "model_source" "model_source" NOT NULL;

-- CreateIndex
CREATE INDEX "document_clauses_model_source_idx" ON "document_clauses"("model_source");

-- CreateIndex
CREATE INDEX "entities_model_source_idx" ON "entities"("model_source");
