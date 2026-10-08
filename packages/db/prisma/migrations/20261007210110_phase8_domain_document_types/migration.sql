-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "document_type" ADD VALUE 'leave_and_license';
ALTER TYPE "document_type" ADD VALUE 'agreement_to_sell';
ALTER TYPE "document_type" ADD VALUE 'sale_deed';
ALTER TYPE "document_type" ADD VALUE 'builder_buyer_agreement';
ALTER TYPE "document_type" ADD VALUE 'employment_contract';
ALTER TYPE "document_type" ADD VALUE 'offer_letter';
ALTER TYPE "document_type" ADD VALUE 'appointment_letter';
ALTER TYPE "document_type" ADD VALUE 'nda';
ALTER TYPE "document_type" ADD VALUE 'mutual_nda';
ALTER TYPE "document_type" ADD VALUE 'service_agreement';
ALTER TYPE "document_type" ADD VALUE 'msa';
