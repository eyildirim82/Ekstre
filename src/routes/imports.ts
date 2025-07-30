import { Router, Request, Response } from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { importExcel } from '../importer/importExcel';
import { fmtTL } from '../utils/money';

const prisma = new PrismaClient({ log: ['query', 'error'] });
const upload = multer({ dest: 'uploads/' });

// DTO fonksiyonu - geriye dönük uyumluluk için
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
  customer: s.customer
});

const router = Router();

router.post('/excel', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });

  const staging = await prisma.stagingFile.create({
    data: { originalFilename: req.file.originalname, status: 'PENDING' }
  });

  try {
    const report = await importExcel(req.file.path, req.file.originalname);
    const file = await prisma.stagingFile.findUnique({
      where: { id: staging.id },
      include: { customerBalances: { include: { customer: true } } }
    });
    res.status(201).json({ file, report });
  } catch (e: any) {
    console.error('[IMPORT ERROR]', e);
    console.error('[IMPORT ERROR STACK]', e?.stack);
    console.error('[IMPORT ERROR DETAILS]', {
      stagingId: staging.id,
      filename: req.file?.originalname,
      filepath: req.file?.path,
      timestamp: new Date().toISOString(),
      errorType: e.constructor.name,
      errorMessage: e.message,
      errorCode: e.code || 'UNKNOWN'
    });
    
    await prisma.stagingFile.update({
      where: { id: staging.id },
      data: { status: 'FAILED', error: e.message }
    });
    
    res.status(500).json({ 
      error: e.message,
      errorType: e.constructor.name,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        errorType: 'ValidationError',
        timestamp: new Date().toISOString()
      });
    }
    
    const file = await prisma.stagingFile.findUnique({
      where: { id },
      include: { customerBalances: { include: { customer: true } } }
    });
    
    if (!file) {
      return res.status(404).json({ 
        error: 'Import not found',
        errorType: 'NotFoundError',
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      ...file,
      customerBalances: file.customerBalances.map(snapshotDto)
    });
  } catch (e: any) {
    console.error('[GET IMPORT ERROR]', e);
    console.error('[GET IMPORT ERROR STACK]', e?.stack);
    console.error('[GET IMPORT ERROR DETAILS]', {
      importId: req.params.id,
      timestamp: new Date().toISOString(),
      errorType: e.constructor.name,
      errorMessage: e.message,
      errorCode: e.code || 'UNKNOWN'
    });
    
    res.status(500).json({ 
      error: e.message,
      errorType: e.constructor.name,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
