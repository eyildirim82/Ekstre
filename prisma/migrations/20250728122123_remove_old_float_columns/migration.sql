/*
  Warnings:

  - You are about to drop the column `calcCreditBalance` on the `CustomerBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `calcDebtBalance` on the `CustomerBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `calcTotalCredit` on the `CustomerBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `calcTotalDebit` on the `CustomerBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `diffCreditBalance` on the `CustomerBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `diffDebtBalance` on the `CustomerBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `diffTotalCredit` on the `CustomerBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `diffTotalDebit` on the `CustomerBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `reportedCreditBalance` on the `CustomerBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `reportedDebtBalance` on the `CustomerBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `reportedTotalCredit` on the `CustomerBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `reportedTotalDebit` on the `CustomerBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `amountBase` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `amountNet` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `credit` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `debit` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `discount` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `vat` on the `Transaction` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CustomerBalanceSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "fileId" INTEGER NOT NULL,
    "reportedTotalDebitCents" INTEGER NOT NULL DEFAULT 0,
    "reportedTotalCreditCents" INTEGER NOT NULL DEFAULT 0,
    "reportedDebtBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "reportedCreditBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "calcTotalDebitCents" INTEGER NOT NULL DEFAULT 0,
    "calcTotalCreditCents" INTEGER NOT NULL DEFAULT 0,
    "calcDebtBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "calcCreditBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "diffTotalDebitCents" INTEGER NOT NULL DEFAULT 0,
    "diffTotalCreditCents" INTEGER NOT NULL DEFAULT 0,
    "diffDebtBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "diffCreditBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerBalanceSnapshot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerBalanceSnapshot_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StagingFile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CustomerBalanceSnapshot" ("calcCreditBalanceCents", "calcDebtBalanceCents", "calcTotalCreditCents", "calcTotalDebitCents", "createdAt", "customerId", "diffCreditBalanceCents", "diffDebtBalanceCents", "diffTotalCreditCents", "diffTotalDebitCents", "fileId", "id", "reportedCreditBalanceCents", "reportedDebtBalanceCents", "reportedTotalCreditCents", "reportedTotalDebitCents") SELECT "calcCreditBalanceCents", "calcDebtBalanceCents", "calcTotalCreditCents", "calcTotalDebitCents", "createdAt", "customerId", "diffCreditBalanceCents", "diffDebtBalanceCents", "diffTotalCreditCents", "diffTotalDebitCents", "fileId", "id", "reportedCreditBalanceCents", "reportedDebtBalanceCents", "reportedTotalCreditCents", "reportedTotalDebitCents" FROM "CustomerBalanceSnapshot";
DROP TABLE "CustomerBalanceSnapshot";
ALTER TABLE "new_CustomerBalanceSnapshot" RENAME TO "CustomerBalanceSnapshot";
CREATE UNIQUE INDEX "CustomerBalanceSnapshot_customerId_fileId_key" ON "CustomerBalanceSnapshot"("customerId", "fileId");
CREATE TABLE "new_Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "docType" TEXT,
    "txnDate" DATETIME NOT NULL,
    "voucherNo" TEXT,
    "description" TEXT,
    "dueDate" DATETIME,
    "amountBaseCents" INTEGER DEFAULT 0,
    "discountCents" INTEGER DEFAULT 0,
    "amountNetCents" INTEGER DEFAULT 0,
    "vatCents" INTEGER DEFAULT 0,
    "debitCents" INTEGER NOT NULL DEFAULT 0,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "naturalKey" TEXT NOT NULL,
    "rowHash" TEXT NOT NULL,
    "lastFileId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amountBaseCents", "amountNetCents", "createdAt", "creditCents", "currency", "customerId", "debitCents", "description", "discountCents", "docType", "dueDate", "id", "lastFileId", "naturalKey", "rowHash", "txnDate", "updatedAt", "vatCents", "voucherNo") SELECT "amountBaseCents", "amountNetCents", "createdAt", "creditCents", "currency", "customerId", "debitCents", "description", "discountCents", "docType", "dueDate", "id", "lastFileId", "naturalKey", "rowHash", "txnDate", "updatedAt", "vatCents", "voucherNo" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_naturalKey_key" ON "Transaction"("naturalKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
