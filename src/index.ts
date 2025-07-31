import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import importsRouter from './routes/imports';
import docsRouter from './routes/docs';
import transactionsRouter from './routes/transactions';
import reportsRouter from './routes/reports';
import { centsToTL, fmtTL } from './utils/money';

const prisma = new PrismaClient({ log: ['query', 'error'] });
const app = express();

// DTO fonksiyonları - geriye dönük uyumluluk için
const transactionDto = (t: any) => ({
  id: t.id,
  customerId: t.customerId,
  docType: t.docType,
  txnDate: t.txnDate,
  voucherNo: t.voucherNo,
  description: t.description,
  dueDate: t.dueDate,
  amountBase: centsToTL(t.amountBaseCents),
  discount: centsToTL(t.discountCents),
  amountNet: centsToTL(t.amountNetCents),
  vat: centsToTL(t.vatCents),
  debit: centsToTL(t.debitCents),
  credit: centsToTL(t.creditCents),
  currency: t.currency,
  naturalKey: t.naturalKey,
  rowHash: t.rowHash,
  lastFileId: t.lastFileId,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  sources: t.sources || []
});

const snapshotDto = (s: any) => ({
  id: s.id,
  customerId: s.customerId,
  fileId: s.fileId,
  reportedTotalDebit: fmtTL(s.reportedTotalDebitCents),
  reportedTotalCredit: fmtTL(s.reportedTotalCreditCents),
  reportedDebtBalance: fmtTL(s.reportedDebtBalanceCents),
  reportedCreditBalance: fmtTL(s.reportedCreditBalanceCents),
  calcTotalDebit: fmtTL(s.calcTotalDebitCents),
  calcTotalCredit: fmtTL(s.calcTotalCreditCents),
  calcDebtBalance: fmtTL(s.calcDebtBalanceCents),
  calcCreditBalance: fmtTL(s.calcCreditBalanceCents),
  diffTotalDebit: fmtTL(s.diffTotalDebitCents),
  diffTotalCredit: fmtTL(s.diffTotalCreditCents),
  diffDebtBalance: fmtTL(s.diffDebtBalanceCents),
  diffCreditBalance: fmtTL(s.diffCreditBalanceCents),
  createdAt: s.createdAt,
  file: s.file
});

app.use(cors());
app.get('/health', (_req: Request, res: Response) => res.send('ok'));

app.use('/docs', docsRouter);
app.use('/imports', importsRouter);
app.use('/transactions', transactionsRouter);
app.use('/reports', reportsRouter);

// Ana sayfa - Modern UI
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.get('/index.html', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Basit UI
app.use('/ui', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'ui.html'));
});

// Raporlama UI
app.get('/reports-ui', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'reports.html'));
});

app.get('/reports.html', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'reports.html'));
});

app.get('/advanced-reports', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'advanced-reports.html'));
});

app.get('/advanced-reports.html', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'advanced-reports.html'));
});

// Static dosyalar için
app.use('/modern-styles.css', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'modern-styles.css'));
});

app.use('/modern-utils.js', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'modern-utils.js'));
});

app.get('/customers/:code/balances', async (req: Request, res: Response) => {
  const code = req.params.code;
  const customer = await prisma.customer.findUnique({ where: { code } });
  if (!customer) return res.status(404).send();

  const snapshots = await prisma.customerBalanceSnapshot.findMany({
    where: { customerId: customer.id },
    include: { file: true }
  });

  res.json({ 
    customer: { code: customer.code, name: customer.name }, 
    snapshots: snapshots.map(snapshotDto)
  });
});

app.get('/customers/:code/transactions', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    const customer = await prisma.customer.findUnique({ where: { code } });
    if (!customer) {
      return res.status(404).json({ 
        error: 'Müşteri bulunamadı',
        errorType: 'NotFoundError',
        timestamp: new Date().toISOString()
      });
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { customerId: customer.id },
        include: { 
          sources: { include: { file: true } }
        },
        orderBy: { txnDate: 'desc' },
        skip: offset,
        take: limit
      }),
      prisma.transaction.count({
        where: { customerId: customer.id }
      })
    ]);

    res.json({
      customer: { 
        id: customer.id,
        code: customer.code, 
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        accountType: customer.accountType
      },
      transactions: transactions.map(transactionDto),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error: any) {
    console.error('[GET CUSTOMER TRANSACTIONS ERROR]', error);
    res.status(500).json({ 
      error: error.message,
      errorType: error.constructor.name,
      timestamp: new Date().toISOString()
    });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`http://localhost:${port}`));
