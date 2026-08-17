-- AlterTable
ALTER TABLE "problems" ADD COLUMN     "constraints" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "examples" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "inputFormat" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "outputFormat" TEXT NOT NULL DEFAULT '';
