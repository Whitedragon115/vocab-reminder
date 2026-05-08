-- CreateTable
CREATE TABLE "Vocabulary" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "word" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "stageIndex" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "NotionCache" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "partOfSpeech" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "sentences" TEXT NOT NULL,
    "transformations" TEXT NOT NULL,
    "synonyms" TEXT NOT NULL,
    "antonyms" TEXT NOT NULL,
    "commonPhrases" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Vocabulary_pageId_key" ON "Vocabulary"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "NotionCache_pageId_key" ON "NotionCache"("pageId");
