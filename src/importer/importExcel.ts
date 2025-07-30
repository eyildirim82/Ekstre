import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { hash, hashJson } from '../utils/hash';
import { formatDate } from '../utils/date';
import { toCents } from '../utils/money';
import {
  readCustomerHeader,
  buildTxHeaderMap,
  isTxHeaderRow,
  isTotalsRow,
  rowContains,
  rowIsEmpty,
  parseTxRow
} from './parser';

const prisma = new PrismaClient();

// Enhanced importExcel with batch processing
export async function importExcel(filePath: string, originalFilename: string) {
  const stagingFile = await prisma.stagingFile.create({
    data: {
      originalFilename,
      uploadedAt: new Date(),
      status: 'PROCESSING',
      rowCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0
    }
  });

  try {
    // First, parse all data without database operations
    // Pass the actual filePath string and stagingFile.id
    const allData = await parseExcelFile(filePath, stagingFile.id);
    
    // Process in batches
    const BATCH_SIZE = 100; // Process 100 transactions at a time
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    
    for (let i = 0; i < allData.transactions.length; i += BATCH_SIZE) {
      const batch = allData.transactions.slice(i, i + BATCH_SIZE);
      
      const batchStats = await prisma.$transaction(async (tx) => {
        return await processBatch(tx, batch, stagingFile.id);
      }, {
        timeout: 15000, // 15 seconds per batch
        maxWait: 20000
      });
      
      totalInserted += batchStats.inserted;
      totalUpdated += batchStats.updated;
      totalSkipped += batchStats.skipped;
      
      // Optional: Update progress
      console.log(`Processed ${Math.min(i + BATCH_SIZE, allData.transactions.length)}/${allData.transactions.length} records`);
    }

    // Process balance snapshots
    const warnings = await processBalanceSnapshots(allData.balances, stagingFile.id);

    // Update staging file with success status
    await prisma.stagingFile.update({
      where: { id: stagingFile.id },
      data: {
        status: 'PROCESSED',
        insertedCount: totalInserted,
        updatedCount: totalUpdated,
        skippedCount: totalSkipped,
        rowCount: allData.transactions.length
      }
    });

    return {
      total: allData.transactions.length,
      inserted: totalInserted,
      updated: totalUpdated,
      skipped: totalSkipped,
      warnings
    };
  } catch (error: any) {
    await prisma.stagingFile.update({
      where: { id: stagingFile.id },
      data: {
        status: 'FAILED',
        error: error.message
      }
    });
    
    throw error;
  }
}

// Legacy function for backward compatibility
export async function importExcelLegacy(fileId: number, filePath: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  // 1) Sheet'i otomatik bul
  const sheet = wb.worksheets.find(ws => sheetHasText(ws, /cari\s*kodu/i)) ?? wb.worksheets[0];
  const ws = sheet;

  if (process.env.DEBUG_IMPORT === '1') {
    console.log('[DEBUG] Sheets:', wb.worksheets.map((w: any) => w.name));
    dumpFirstRows(ws, 30);
  }

  let i = 2;
  let state: 'SEEK_CUSTOMER'|'SEEK_TX_HEADER'|'READ_TX_ROWS' = 'SEEK_CUSTOMER';
  let currentCustomer: { id: number; code: string } | null = null;

  let inserted = 0, updated = 0, skipped = 0, total = 0;

  const balances: Array<{
    customerId: number,
    reported: {
      totalDebit: number, totalCredit: number, debtBalance: number, creditBalance: number
    }
  }> = [];

  const txHeaderMap: Record<string, number> = {};

  await prisma.$transaction(async (db) => {
    while (i <= ws.rowCount) {
      const row = ws.getRow(i);

      if (state === 'SEEK_CUSTOMER') {
        if (rowContains(row, 'Cari Kodu')) {
          const { header, nextRow } = readCustomerHeader(ws, i);
          i = nextRow;
          const cust = await db.customer.upsert({
            where: { code: header.code },
            create: {
              code: header.code, name: header.name, phone: header.phone,
              address: header.address, accountType: header.accountType,
              tag1: header.tag1, tag2: header.tag2
            },
            update: {
              name: header.name, phone: header.phone,
              address: header.address, accountType: header.accountType,
              tag1: header.tag1, tag2: header.tag2
            }
          });
          currentCustomer = { id: cust.id, code: cust.code };

          balances.push({
            customerId: cust.id,
            reported: {
              totalDebit: header.reportedTotalDebit ?? 0,
              totalCredit: header.reportedTotalCredit ?? 0,
              debtBalance: header.reportedDebtBalance ?? 0,
              creditBalance: header.reportedCreditBalance ?? 0
            }
          });

          state = 'SEEK_TX_HEADER';
          continue;
        }
        i++;
      }

      else if (state === 'SEEK_TX_HEADER') {
        if (isTxHeaderRow(row)) {
          buildTxHeaderMap(row, txHeaderMap);
          console.log('[DEBUG] txHeaderMap:', txHeaderMap);
          i++;
          state = 'READ_TX_ROWS';
          continue;
        }
        i++;
      }

      else if (state === 'READ_TX_ROWS') {
        if (rowContains(row, 'Cari Kodu')) {
          state = 'SEEK_CUSTOMER';
          continue;
        }
        if (isTotalsRow(row, txHeaderMap)) { i++; continue; }
        if (rowIsEmpty(row)) { i++; continue; }

        if (!currentCustomer) throw new Error('Customer context lost');

        const txr = parseTxRow(row, txHeaderMap);
        
        // Bozuk satırları ele
        if (!txr.txnDate || isNaN(txr.txnDate.getTime())) { i++; continue; }
        if ((txr.debit ?? 0) === 0 && (txr.credit ?? 0) === 0) { i++; continue; }
        
        console.log('[DEBUG] parseTxRow:', txr);
        total++;

        const naturalKey = makeNaturalKey(currentCustomer.code, txr);
        const rowHash = hashJson({ ...txr, customer: currentCustomer.code });

        const existing = await db.transaction.findUnique({ where: { naturalKey } });
        if (!existing) {
          await db.transaction.create({
            data: {
              ...mapTxToDb(txr),
              naturalKey, rowHash,
              lastFileId: fileId,
              customer: { connect: { id: currentCustomer.id } },
              sources: { create: { fileId } }
            }
          });
          inserted++;
        } else {
          if (existing.rowHash !== rowHash) {
            await db.transaction.update({
              where: { id: existing.id },
              data: { ...mapTxToDb(txr), rowHash, lastFileId: fileId }
            });
            await db.transactionAudit.create({
              data: { oldTxnId: existing.id, newTxnId: existing.id, fileId, reason: 'OVERWRITE' }
            });
            updated++;
          } else {
            skipped++;
          }
        }

        i++;
      }
    }

    // balance snapshots
    for (const b of balances) {
      const sums = await db.transaction.aggregate({
        _sum: { debitCents: true, creditCents: true },
        where: { customerId: b.customerId }
      });
      const dC = Number(sums._sum?.debitCents ?? 0);
      const cC = Number(sums._sum?.creditCents ?? 0);
      const d = dC / 100;
      const c = cC / 100;
      const calcDebt = Math.max(d - c, 0);
      const calcCredit = Math.max(c - d, 0);

      await db.customerBalanceSnapshot.upsert({
        where: { customerId_fileId: { customerId: b.customerId, fileId } },
        create: {
          customerId: b.customerId, fileId,
          reportedTotalDebitCents:    Math.round(b.reported.totalDebit * 100),
          reportedTotalCreditCents:   Math.round(b.reported.totalCredit * 100),
          reportedDebtBalanceCents:   Math.round(b.reported.debtBalance * 100),
          reportedCreditBalanceCents: Math.round(b.reported.creditBalance * 100),
          calcTotalDebitCents:        dC,
          calcTotalCreditCents:       cC,
          calcDebtBalanceCents:       Math.round(calcDebt * 100),
          calcCreditBalanceCents:     Math.round(calcCredit * 100),
          diffTotalDebitCents:        Math.round((d - b.reported.totalDebit) * 100),
          diffTotalCreditCents:       Math.round((c - b.reported.totalCredit) * 100),
          diffDebtBalanceCents:       Math.round((calcDebt - b.reported.debtBalance) * 100),
          diffCreditBalanceCents:     Math.round((calcCredit - b.reported.creditBalance) * 100)
        },
        update: {}
      });
    }

    await db.stagingFile.update({
      where: { id: fileId },
      data: {
        status: 'PROCESSED',
        rowCount: total,
        insertedCount: inserted,
        updatedCount: updated,
        skippedCount: skipped
      }
    });
  });

  return { total, inserted, updated, skipped };
}

async function parseExcelFile(filePath: string, fileId: number) {
  // Ensure filePath is a string
  if (typeof filePath !== 'string') {
    throw new Error(`Expected filePath to be a string, but received ${typeof filePath}: ${filePath}`);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  // 1) Sheet'i otomatik bul
  const sheet = wb.worksheets.find(ws => sheetHasText(ws, /cari\s*kodu/i)) ?? wb.worksheets[0];
  const ws = sheet;

  if (process.env.DEBUG_IMPORT === '1') {
    console.log('[DEBUG] Sheets:', wb.worksheets.map((w: any) => w.name));
    dumpFirstRows(ws, 30);
  }

  let i = 2;
  let state: 'SEEK_CUSTOMER'|'SEEK_TX_HEADER'|'READ_TX_ROWS' = 'SEEK_CUSTOMER';
  let currentCustomer: { id: number; code: string } | null = null;

  const transactions: Array<{
    naturalKey: string;
    rowHash: string;
    data: any;
    customerId: number;
  }> = [];

  const balances: Array<{
    customerId: number,
    reported: {
      totalDebit: number, totalCredit: number, debtBalance: number, creditBalance: number
    }
  }> = [];

  const txHeaderMap: Record<string, number> = {};

  // First pass: Parse all data and create customers
  while (i <= ws.rowCount) {
    const row = ws.getRow(i);

    if (state === 'SEEK_CUSTOMER') {
      if (rowContains(row, 'Cari Kodu')) {
        const { header, nextRow } = readCustomerHeader(ws, i);
        i = nextRow;
        
        // Create customer first
        const cust = await prisma.customer.upsert({
          where: { code: header.code },
          create: {
            code: header.code, name: header.name, phone: header.phone,
            address: header.address, accountType: header.accountType,
            tag1: header.tag1, tag2: header.tag2
          },
          update: {
            name: header.name, phone: header.phone,
            address: header.address, accountType: header.accountType,
            tag1: header.tag1, tag2: header.tag2
          }
        });
        currentCustomer = { id: cust.id, code: cust.code };

        balances.push({
          customerId: cust.id,
          reported: {
            totalDebit: header.reportedTotalDebit ?? 0,
            totalCredit: header.reportedTotalCredit ?? 0,
            debtBalance: header.reportedDebtBalance ?? 0,
            creditBalance: header.reportedCreditBalance ?? 0
          }
        });

        state = 'SEEK_TX_HEADER';
        continue;
      }
      i++;
    }

    else if (state === 'SEEK_TX_HEADER') {
      if (isTxHeaderRow(row)) {
        buildTxHeaderMap(row, txHeaderMap);
        console.log('[DEBUG] txHeaderMap:', txHeaderMap);
        i++;
        state = 'READ_TX_ROWS';
        continue;
      }
      i++;
    }

    else if (state === 'READ_TX_ROWS') {
      if (rowContains(row, 'Cari Kodu')) {
        state = 'SEEK_CUSTOMER';
        continue;
      }
      if (isTotalsRow(row, txHeaderMap)) { i++; continue; }
      if (rowIsEmpty(row)) { i++; continue; }

      if (!currentCustomer) throw new Error('Customer context lost');

      const txr = parseTxRow(row, txHeaderMap);
      
      // Bozuk satırları ele
      if (!txr.txnDate || isNaN(txr.txnDate.getTime())) { i++; continue; }
      if ((txr.debit ?? 0) === 0 && (txr.credit ?? 0) === 0) { i++; continue; }
      
      console.log('[DEBUG] parseTxRow:', txr);

      const naturalKey = makeNaturalKey(currentCustomer.code, txr);
      const rowHash = hashJson({ ...txr, customer: currentCustomer.code });

      transactions.push({
        naturalKey,
        rowHash,
        data: {
          ...mapTxToDb(txr),
          naturalKey,
          rowHash,
          lastFileId: fileId,
          customer: { connect: { id: currentCustomer.id } },
          sources: { create: { fileId } }
        },
        customerId: currentCustomer.id
      });

      i++;
    }
  }

  return { transactions, balances };
}

async function processBatch(tx: any, batch: any[], fileId: number) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  
  for (const item of batch) {
    try {
      // Process each transaction in the batch
      const existing = await tx.transaction.findUnique({
        where: { naturalKey: item.naturalKey }
      });
      
      if (existing) {
        if (existing.rowHash !== item.rowHash) {
          await tx.transaction.update({
            where: { id: existing.id },
            data: { 
              ...item.data,
              customer: undefined, // Remove connect object for update
              sources: undefined
            }
          });
          
          await tx.transactionAudit.create({
            data: { oldTxnId: existing.id, newTxnId: existing.id, fileId, reason: 'OVERWRITE' }
          });
          
          updated++;
        } else {
          skipped++;
        }
      } else {
        await tx.transaction.create({
          data: item.data
        });
        inserted++;
      }
    } catch (error: any) {
      console.warn(`Error processing item: ${error.message}`);
      skipped++;
    }
  }
  
  return { inserted, updated, skipped };
}

async function processBalanceSnapshots(balances: any[], fileId: number) {
  const warnings: string[] = [];
  const abs = (x: number) => Math.abs(x);
  const thr = Number(process.env.DIFF_ABS_TL || 0);

  for (const b of balances) {
    const sums = await prisma.transaction.aggregate({
      _sum: { debitCents: true, creditCents: true },
      where: { customerId: b.customerId }
    });
    
    // Cents bazında hesaplamalar
    const dC = Number(sums._sum?.debitCents ?? 0);
    const cC = Number(sums._sum?.creditCents ?? 0);
    const d = dC / 100;
    const c = cC / 100;
    const calcDebt = Math.max(d - c, 0);
    const calcCredit = Math.max(c - d, 0);
    const calcDebtC = Math.round(calcDebt * 100);
    const calcCreditC = Math.round(calcCredit * 100);

    // Raporlanan değerler TL olarak geliyor, cents'e çevir
    const reportedTDC = Math.round(b.reported.totalDebit * 100);
    const reportedTCC = Math.round(b.reported.totalCredit * 100);
    const reportedDBC = Math.round(b.reported.debtBalance * 100);
    const reportedCBC = Math.round(b.reported.creditBalance * 100);

    // Diff hesaplamaları (cents bazında)
    const diffTDC = dC - reportedTDC;
    const diffTCC = cC - reportedTCC;
    const diffDBC = calcDebtC - reportedDBC;
    const diffCBC = calcCreditC - reportedCBC;

    // Uyarı kontrolü (cents bazında)
    if (thr > 0 && (abs(diffTDC) >= thr * 100 || abs(diffTCC) >= thr * 100 || abs(diffDBC) >= thr * 100 || abs(diffCBC) >= thr * 100)) {
      warnings.push(`Cari ${b.customerId}: TD:${(diffTDC/100).toFixed(2)}, TC:${(diffTCC/100).toFixed(2)}, DB:${(diffDBC/100).toFixed(2)}, CB:${(diffCBC/100).toFixed(2)}`);
    }

    await prisma.customerBalanceSnapshot.upsert({
      where: { customerId_fileId: { customerId: b.customerId, fileId } },
      create: {
        customerId: b.customerId, fileId,
        // Cents alanları
        reportedTotalDebitCents:     reportedTDC,
        reportedTotalCreditCents:    reportedTCC,
        reportedDebtBalanceCents:    reportedDBC,
        reportedCreditBalanceCents:  reportedCBC,
        calcTotalDebitCents:         dC,
        calcTotalCreditCents:        cC,
        calcDebtBalanceCents:        calcDebtC,
        calcCreditBalanceCents:      calcCreditC,
        diffTotalDebitCents:         diffTDC,
        diffTotalCreditCents:        diffTCC,
        diffDebtBalanceCents:        diffDBC,
        diffCreditBalanceCents:      diffCBC,
      },
      update: {}
    });
  }

  return warnings;
}

function d2s(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return null; // nullable ise null
  return Number(Number(n).toFixed(2));           // Decimal için güvenli number
}

function roundTo2Decimals(n?: number | null) {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100; // 2 ondalık basamağa yuvarla
}

function makeNaturalKey(code: string, tx: any) {
  return hash(`${code}|${tx.docType||''}|${formatDate(tx.txnDate)}|${tx.voucherNo||''}`);
}

function mapTxToDb(tx: any) {
  return {
    docType: tx.docType,
    txnDate: tx.txnDate,
    voucherNo: tx.voucherNo || null,
    description: tx.description || null,
    dueDate: tx.dueDate ?? null,

    amountBaseCents: toCents(tx.amountBase),
    discountCents:   toCents(tx.discount),
    amountNetCents:  toCents(tx.amountNet),
    vatCents:        toCents(tx.vat),
    debitCents:      Math.round((tx.debit ?? 0) * 100),
    creditCents:     Math.round((tx.credit ?? 0) * 100),

    currency: 'TRY',
    // eski decimal/float alanları SET ETME
  };
}

function cellToString(v: any): string {
  if (v == null) return '';
  if (typeof v === 'object' && (v as any).richText) {
    return (v as any).richText.map((p: any) => p.text).join('');
  }
  return String(v);
}

function sheetHasText(ws: ExcelJS.Worksheet, regex: RegExp): boolean {
  for (let i = 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const values = Array.isArray(row.values) ? row.values : [];
    const txt = values.map((v: any) => cellToString(v)).join(' | ').toLowerCase();
    if (regex.test(txt)) return true;
  }
  return false;
}

function dumpFirstRows(ws: ExcelJS.Worksheet, n: number) {
  for (let i = 1; i <= Math.min(ws.rowCount, n); i++) {
    const row = ws.getRow(i);
    const values = Array.isArray(row.values) ? row.values : [];
    const vals = values.map((v: any) => cellToString(v));
    console.log(`[R${i}]`, vals);
  }
}