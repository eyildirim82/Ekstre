-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CustomerBalanceSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "fileId" INTEGER NOT NULL,
    "reportedTotalDebit" REAL NOT NULL,
    "reportedTotalCredit" REAL NOT NULL,
    "reportedDebtBalance" REAL NOT NULL,
    "reportedCreditBalance" REAL NOT NULL,
    "calcTotalDebit" REAL NOT NULL,
    "calcTotalCredit" REAL NOT NULL,
    "calcDebtBalance" REAL NOT NULL,
    "calcCreditBalance" REAL NOT NULL,
    "diffTotalDebit" REAL NOT NULL,
    "diffTotalCredit" REAL NOT NULL,
    "diffDebtBalance" REAL NOT NULL,
    "diffCreditBalance" REAL NOT NULL,
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
INSERT INTO "new_CustomerBalanceSnapshot" ("calcCreditBalance", "calcDebtBalance", "calcTotalCredit", "calcTotalDebit", "createdAt", "customerId", "diffCreditBalance", "diffDebtBalance", "diffTotalCredit", "diffTotalDebit", "fileId", "id", "reportedCreditBalance", "reportedDebtBalance", "reportedTotalCredit", "reportedTotalDebit") SELECT "calcCreditBalance", "calcDebtBalance", "calcTotalCredit", "calcTotalDebit", "createdAt", "customerId", "diffCreditBalance", "diffDebtBalance", "diffTotalCredit", "diffTotalDebit", "fileId", "id", "reportedCreditBalance", "reportedDebtBalance", "reportedTotalCredit", "reportedTotalDebit" FROM "CustomerBalanceSnapshot";
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
    "amountBase" REAL,
    "discount" REAL,
    "amountNet" REAL,
    "vat" REAL,
    "debit" REAL NOT NULL DEFAULT 0,
    "credit" REAL NOT NULL DEFAULT 0,
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
INSERT INTO "new_Transaction" ("amountBase", "amountNet", "createdAt", "credit", "currency", "customerId", "debit", "description", "discount", "docType", "dueDate", "id", "lastFileId", "naturalKey", "rowHash", "txnDate", "updatedAt", "vat", "voucherNo") SELECT "amountBase", "amountNet", "createdAt", "credit", "currency", "customerId", "debit", "description", "discount", "docType", "dueDate", "id", "lastFileId", "naturalKey", "rowHash", "txnDate", "updatedAt", "vat", "voucherNo" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_naturalKey_key" ON "Transaction"("naturalKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
