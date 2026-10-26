-- CreateTable
CREATE TABLE "problem_hints" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_hints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hint_unlocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hint_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_reviews" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "review" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "problem_hints_problemId_level_key" ON "problem_hints"("problemId", "level");

-- CreateIndex
CREATE INDEX "hint_unlocks_userId_problemId_idx" ON "hint_unlocks"("userId", "problemId");

-- CreateIndex
CREATE UNIQUE INDEX "hint_unlocks_userId_problemId_level_key" ON "hint_unlocks"("userId", "problemId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "code_reviews_submissionId_key" ON "code_reviews"("submissionId");

-- AddForeignKey
ALTER TABLE "problem_hints" ADD CONSTRAINT "problem_hints_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hint_unlocks" ADD CONSTRAINT "hint_unlocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hint_unlocks" ADD CONSTRAINT "hint_unlocks_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_reviews" ADD CONSTRAINT "code_reviews_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
