-- AlterTable
ALTER TABLE "Todo" ADD COLUMN "dueDate" DATETIME;
ALTER TABLE "Todo" ADD COLUMN "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "TodoDependency" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "todoId" INTEGER NOT NULL,
    "dependsOnId" INTEGER NOT NULL,
    CONSTRAINT "TodoDependency_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TodoDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TodoDependency_todoId_dependsOnId_key" ON "TodoDependency"("todoId", "dependsOnId");
