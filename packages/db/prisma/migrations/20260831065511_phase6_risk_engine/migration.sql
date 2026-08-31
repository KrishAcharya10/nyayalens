/*
  Warnings:

  - Added the required column `evidence` to the `risks` table without a default value. This is not possible if the table is not empty.
  - Added the required column `model_source` to the `risks` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pass` to the `risks` table without a default value. This is not possible if the table is not empty.
  - Added the required column `severity` to the `risks` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category` to the `risks` table without a default value. This is not possible if the table is not empty.
  - Made the column `reason` on table `risks` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "risk_category" AS ENUM ('LIABILITY_SHIFT', 'ASYMMETRIC_OBLIGATION', 'UNBOUNDED_DISCRETION', 'LAND_USE_CONTRADICTION', 'MISSING_CLAUSE');

-- CreateEnum
CREATE TYPE "risk_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "risk_pass" AS ENUM ('PASS_1', 'PASS_2');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "is_adversarial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_adversarial_control" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "risks" ADD COLUMN     "evidence" JSONB NOT NULL,
ADD COLUMN     "model_source" "model_source" NOT NULL,
ADD COLUMN     "pass" "risk_pass" NOT NULL,
DROP COLUMN "severity",
ADD COLUMN     "severity" "risk_severity" NOT NULL,
DROP COLUMN "category",
ADD COLUMN     "category" "risk_category" NOT NULL,
ALTER COLUMN "reason" SET NOT NULL;

-- CreateIndex
CREATE INDEX "risks_category_idx" ON "risks"("category");
