-- CreateEnum
CREATE TYPE "PlaceKind" AS ENUM ('DESTINATION', 'STOP');

-- AlterTable
ALTER TABLE "SavedPlace" ADD COLUMN     "kind" "PlaceKind" NOT NULL DEFAULT 'DESTINATION';

