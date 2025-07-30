"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const client_1 = require("@prisma/client");
const importExcel_1 = require("../importer/importExcel");
const money_1 = require("../utils/money");
const prisma = new client_1.PrismaClient({ log: ['query', 'error'] });
const upload = (0, multer_1.default)({ dest: 'uploads/' });
// DTO fonksiyonu - geriye dönük uyumluluk için
const snapshotDto = (s) => ({
    id: s.id,
    customerId: s.customerId,
    fileId: s.fileId,
    reportedTotalDebit: (0, money_1.fmtTL)(s.reportedTotalDebitCents),
    reportedTotalCredit: (0, money_1.fmtTL)(s.reportedTotalCreditCents),
    reportedDebtBalance: (0, money_1.fmtTL)(s.reportedDebtBalanceCents),
    reportedCreditBalance: (0, money_1.fmtTL)(s.reportedCreditBalanceCents),
    calcTotalDebit: (0, money_1.fmtTL)(s.calcTotalDebitCents),
    calcTotalCredit: (0, money_1.fmtTL)(s.calcTotalCreditCents),
    calcDebtBalance: (0, money_1.fmtTL)(s.calcDebtBalanceCents),
    calcCreditBalance: (0, money_1.fmtTL)(s.calcCreditBalanceCents),
    diffTotalDebit: (0, money_1.fmtTL)(s.diffTotalDebitCents),
    diffTotalCredit: (0, money_1.fmtTL)(s.diffTotalCreditCents),
    diffDebtBalance: (0, money_1.fmtTL)(s.diffDebtBalanceCents),
    diffCreditBalance: (0, money_1.fmtTL)(s.diffCreditBalanceCents),
    createdAt: s.createdAt,
    customer: s.customer
});
const router = (0, express_1.Router)();
router.post('/excel', upload.single('file'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'file is required' });
    const staging = await prisma.stagingFile.create({
        data: { originalFilename: req.file.originalname, status: 'PENDING' }
    });
    try {
        const report = await (0, importExcel_1.importExcel)(req.file.path, req.file.originalname);
        const file = await prisma.stagingFile.findUnique({
            where: { id: staging.id },
            include: { customerBalances: { include: { customer: true } } }
        });
        res.status(201).json({ file, report });
    }
    catch (e) {
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
router.get('/:id', async (req, res) => {
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
    }
    catch (e) {
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
exports.default = router;
