/*
  Warnings:

  - You are about to drop the column `roomId` on the `Round` table. All the data in the column will be lost.
  - Added the required column `gameId` to the `Round` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Round" DROP CONSTRAINT "Round_roomId_fkey";

-- AlterTable
ALTER TABLE "Round" DROP COLUMN "roomId",
ADD COLUMN     "gameId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roomId" TEXT NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
