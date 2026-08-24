-- AlterTable
ALTER TABLE "submissions"
ADD COLUMN "enqueuedAt" TIMESTAMP(3),
ADD COLUMN "processingStartedAt" TIMESTAMP(3),
ADD COLUMN "terminalAt" TIMESTAMP(3),
ADD COLUMN "scorePersistedAt" TIMESTAMP(3);
