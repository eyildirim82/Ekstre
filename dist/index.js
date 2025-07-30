"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const imports_1 = __importDefault(require("./routes/imports"));
const docs_1 = __importDefault(require("./routes/docs"));
const transactions_1 = __importDefault(require("./routes/transactions"));
const reports_1 = __importDefault(require("./routes/reports"));
const money_1 = require("./utils/money");
const prisma = new client_1.PrismaClient({ log: ['query', 'error'] });
const app = (0, express_1.default)();
// DTO fonksiyonları - geriye dönük uyumluluk için
const transactionDto = (t) => ({
    id: t.id,
    customerId: t.customerId,
    docType: t.docType,
    txnDate: t.txnDate,
    voucherNo: t.voucherNo,
    description: t.description,
    dueDate: t.dueDate,
    amountBase: (0, money_1.centsToTL)(t.amountBaseCents),
    discount: (0, money_1.centsToTL)(t.discountCents),
    amountNet: (0, money_1.centsToTL)(t.amountNetCents),
    vat: (0, money_1.centsToTL)(t.vatCents),
    debit: (0, money_1.centsToTL)(t.debitCents),
    credit: (0, money_1.centsToTL)(t.creditCents),
    currency: t.currency,
    naturalKey: t.naturalKey,
    rowHash: t.rowHash,
    lastFileId: t.lastFileId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    sources: t.sources || []
});
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
    file: s.file
});
app.use((0, cors_1.default)());
app.get('/health', (_req, res) => res.send('ok'));
app.use('/docs', docs_1.default);
app.use('/imports', imports_1.default);
app.use('/transactions', transactions_1.default);
app.use('/reports', reports_1.default);
// Basit UI
app.use('/ui', (_req, res) => {
    res.sendFile(path_1.default.join(process.cwd(), 'public', 'ui.html'));
});
// Raporlama UI
app.get('/reports-ui', (_req, res) => {
    res.sendFile(path_1.default.join(process.cwd(), 'public', 'reports.html'));
});
app.get('/advanced-reports', (_req, res) => {
    res.sendFile(path_1.default.join(process.cwd(), 'public', 'advanced-reports.html'));
});
app.get('/customers/:code/balances', async (req, res) => {
    const code = req.params.code;
    const customer = await prisma.customer.findUnique({ where: { code } });
    if (!customer)
        return res.status(404).send();
    const snapshots = await prisma.customerBalanceSnapshot.findMany({
        where: { customerId: customer.id },
        include: { file: true }
    });
    res.json({
        customer: { code: customer.code, name: customer.name },
        snapshots: snapshots.map(snapshotDto)
    });
});
app.get('/customers/:code/transactions', async (req, res) => {
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
    }
    catch (error) {
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
