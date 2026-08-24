-- AlterTable
ALTER TABLE "submissions"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "idempotencyScope" TEXT,
ADD COLUMN "lastFailureReason" TEXT,
ADD COLUMN "lastFailureAt" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "SubmissionFailurePhase" AS ENUM ('WORKER_RETRY_EXHAUSTED', 'ORPHAN_RECONCILIATION');

-- CreateTable
CREATE TABLE "submission_failure_events" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "phase" "SubmissionFailurePhase" NOT NULL,
    "reason" TEXT NOT NULL,
    "bullState" TEXT,
    "attemptsMade" INTEGER,
    "maxAttempts" INTEGER,
    "stalledCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_failure_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submissions_idempotencyKey_idx" ON "submissions"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_userId_idempotencyScope_idempotencyKey_key"
ON "submissions"("userId", "idempotencyScope", "idempotencyKey");

-- CreateIndex
CREATE INDEX "submission_failure_events_submissionId_createdAt_idx"
ON "submission_failure_events"("submissionId", "createdAt");

-- AddForeignKey
ALTER TABLE "submission_failure_events"
ADD CONSTRAINT "submission_failure_events_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "submissions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
