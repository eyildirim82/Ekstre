-- CreateTable
CREATE TABLE "StagingRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fileId" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "rawJson" TEXT NOT NULL,
    "rowHash" TEXT NOT NULL,
    CONSTRAINT "StagingRow_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StagingFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "accountType" TEXT,
    "tag1" TEXT,
    "tag2" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Transaction" (
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
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "naturalKey" TEXT NOT NULL,
    "rowHash" TEXT NOT NULL,
    "lastFileId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransactionSource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "transactionId" INTEGER NOT NULL,
    "fileId" INTEGER NOT NULL,
    CONSTRAINT "TransactionSource_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransactionSource_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StagingFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransactionAudit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "oldTxnId" INTEGER,
    "newTxnId" INTEGER,
    "fileId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransactionAudit_oldTxnId_fkey" FOREIGN KEY ("oldTxnId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransactionAudit_newTxnId_fkey" FOREIGN KEY ("newTxnId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransactionAudit_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StagingFile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerBalanceSnapshot" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerBalanceSnapshot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerBalanceSnapshot_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StagingFile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StagingFile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "originalFilename" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "insertedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "StagingRow_fileId_index_key" ON "StagingRow"("fileId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_naturalKey_key" ON "Transaction"("naturalKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerBalanceSnapshot_customerId_fileId_key" ON "CustomerBalanceSnapshot"("customerId", "fileId");
