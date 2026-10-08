-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "risk_category" ADD VALUE 'ONE_SIDED_REMEDY';
ALTER TYPE "risk_category" ADD VALUE 'RESTRICTIVE_COVENANT';
ALTER TYPE "risk_category" ADD VALUE 'UNCAPPED_LIABILITY';
ALTER TYPE "risk_category" ADD VALUE 'FINANCIAL_CONTRADICTION';
ALTER TYPE "risk_category" ADD VALUE 'DATE_CONTRADICTION';
ALTER TYPE "risk_category" ADD VALUE 'DURATION_CONTRADICTION';
ALTER TYPE "risk_category" ADD VALUE 'PROPERTY_AREA_CONTRADICTION';
ALTER TYPE "risk_category" ADD VALUE 'PROPERTY_IDENTIFIER_CONTRADICTION';
ALTER TYPE "risk_category" ADD VALUE 'PAYMENT_TOTAL_MISMATCH';
ALTER TYPE "risk_category" ADD VALUE 'PARTY_ROLE_INCONSISTENCY';
ALTER TYPE "risk_category" ADD VALUE 'PARTY_NAME_CONTRADICTION';
ALTER TYPE "risk_category" ADD VALUE 'DEFINITION_INCONSISTENCY';

-- AlterEnum
ALTER TYPE "risk_pass" ADD VALUE 'CONSISTENCY';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "domain_detection" JSONB;

-- AlterTable
ALTER TABLE "obligations" ADD COLUMN     "action" TEXT,
ADD COLUMN     "actor_entity_id" TEXT,
ADD COLUMN     "actor_label" TEXT,
ADD COLUMN     "amount_entity_id" TEXT,
ADD COLUMN     "amount_inr" DOUBLE PRECISION,
ADD COLUMN     "condition" TEXT,
ADD COLUMN     "deadline_text" TEXT,
ADD COLUMN     "frequency" TEXT,
ADD COLUMN     "model_source" "model_source" NOT NULL DEFAULT 'rule_based',
ADD COLUMN     "object_text" TEXT,
ADD COLUMN     "source_clause_id" TEXT;

-- AlterTable
ALTER TABLE "relations" ADD COLUMN     "model_source" "model_source" NOT NULL DEFAULT 'rule_based',
ADD COLUMN     "source_clause_id" TEXT,
ADD COLUMN     "text_end" INTEGER,
ADD COLUMN     "text_start" INTEGER,
ALTER COLUMN "subject_entity_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "risks" ADD COLUMN     "review_required" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rule_id" TEXT;
