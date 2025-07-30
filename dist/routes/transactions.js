"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const money_1 = require("../utils/money");
const prisma = new client_1.PrismaClient();
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    const { code, // customer code
    from, to, // ISO: YYYY-MM-DD
    type, // docType
    voucher, // voucherNo like
    min, max, // TL
    page = '1', pageSize = '50', sort = 'date_desc' // date_asc|date_desc|amount_desc|amount_asc
     } = req.query;
    const where = {};
    if (code)
        where.customer = { code: String(code) };
    if (type)
        where.docType = String(type);
    if (voucher)
        where.voucherNo = { contains: String(voucher) };
    if (from || to) {
        where.txnDate = {};
        if (from)
            where.txnDate.gte = new Date(`${from}T00:00:00`);
        if (to)
            where.txnDate.lte = new Date(`${to}T23:59:59`);
    }
    // min/max TL → kuruş'a çevirip debit+credit "net" için filtre örneği:
    if (min || max) {
        const minC = min ? Math.round(Number(min) * 100) : undefined;
        const maxC = max ? Math.round(Number(max) * 100) : undefined;
        // Basit yaklaşım: debitCents veya creditCents üstünden OR
        where.OR = [
            { debitCents: { gte: minC ?? undefined, lte: maxC ?? undefined } },
            { creditCents: { gte: minC ?? undefined, lte: maxC ?? undefined } },
        ];
    }
    const skip = (Number(page) - 1) * Number(pageSize);
    const take = Math.min(Number(pageSize), 200);
    const orderBy = sort === 'date_asc' ? [{ txnDate: 'asc' }] :
        sort === 'amount_asc' ? [{ debitCents: 'asc' }, { creditCents: 'asc' }] :
            sort === 'amount_desc' ? [{ debitCents: 'desc' }, { creditCents: 'desc' }] :
                [{ txnDate: 'desc' }];
    const [items, total] = await Promise.all([
        prisma.transaction.findMany({
            where, skip, take, orderBy,
            include: { customer: { select: { code: true, name: true } } }
        }),
        prisma.transaction.count({ where })
    ]);
    const data = items.map((t) => ({
        id: t.id,
        customer: t.customer,
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
    }));
    res.json({ total, page: Number(page), pageSize: take, data });
});
router.get('/by-customer/:code', async (req, res) => {
    // Aynı handler'ı çağır
    const originalQuery = req.query;
    req.query = { ...originalQuery, code: req.params.code };
    // Ana handler'ı çağır
    const { code, // customer code
    from, to, // ISO: YYYY-MM-DD
    type, // docType
    voucher, // voucherNo like
    min, max, // TL
    page = '1', pageSize = '50', sort = 'date_desc' // date_asc|date_desc|amount_desc|amount_asc
     } = req.query;
    const where = {};
    if (code)
        where.customer = { code: String(code) };
    if (type)
        where.docType = String(type);
    if (voucher)
        where.voucherNo = { contains: String(voucher) };
    if (from || to) {
        where.txnDate = {};
        if (from)
            where.txnDate.gte = new Date(`${from}T00:00:00`);
        if (to)
            where.txnDate.lte = new Date(`${to}T23:59:59`);
    }
    if (min || max) {
        const minC = min ? Math.round(Number(min) * 100) : undefined;
        const maxC = max ? Math.round(Number(max) * 100) : undefined;
        where.OR = [
            { debitCents: { gte: minC ?? undefined, lte: maxC ?? undefined } },
            { creditCents: { gte: minC ?? undefined, lte: maxC ?? undefined } },
        ];
    }
    const skip = (Number(page) - 1) * Number(pageSize);
    const take = Math.min(Number(pageSize), 200);
    const orderBy = sort === 'date_asc' ? [{ txnDate: 'asc' }] :
        sort === 'amount_asc' ? [{ debitCents: 'asc' }, { creditCents: 'asc' }] :
            sort === 'amount_desc' ? [{ debitCents: 'desc' }, { creditCents: 'desc' }] :
                [{ txnDate: 'desc' }];
    const [items, total] = await Promise.all([
        prisma.transaction.findMany({
            where, skip, take, orderBy,
            include: { customer: { select: { code: true, name: true } } }
        }),
        prisma.transaction.count({ where })
    ]);
    const data = items.map((t) => ({
        id: t.id,
        customer: t.customer,
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
    }));
    res.json({ total, page: Number(page), pageSize: take, data });
});
exports.default = router;
