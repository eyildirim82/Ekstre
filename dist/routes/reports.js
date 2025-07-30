"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const money_1 = require("../utils/money");
const puppeteer_1 = __importDefault(require("puppeteer"));
const prisma = new client_1.PrismaClient();
const router = (0, express_1.Router)();
// PDF generation helper
async function generatePDF(html) {
    const browser = await puppeteer_1.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({
            format: 'A4',
            margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
            printBackground: true
        });
        return Buffer.from(pdf);
    }
    finally {
        await browser.close();
    }
}
// Excel export helper (temporarily disabled - requires xlsx package)
function generateExcel(data, filename) {
    // TODO: Implement when xlsx package is available
    throw new Error('Excel export requires xlsx package');
}
// Genel özet raporu - Tüm sistem için
router.get('/dashboard', async (req, res) => {
    try {
        const { from, to } = req.query;
        // Tarih filtresi
        const dateFilter = {};
        if (from || to) {
            dateFilter.txnDate = {};
            if (from)
                dateFilter.txnDate.gte = new Date(`${from}T00:00:00`);
            if (to)
                dateFilter.txnDate.lte = new Date(`${to}T23:59:59`);
        }
        // Genel istatistikler
        const [totalCustomers, totalTransactions, transactionStats, customerStats] = await Promise.all([
            prisma.customer.count(),
            prisma.transaction.count({ where: dateFilter }),
            prisma.transaction.aggregate({
                where: dateFilter,
                _sum: {
                    debitCents: true,
                    creditCents: true
                }
            }),
            prisma.customer.findMany({
                include: {
                    transactions: {
                        where: dateFilter,
                        select: {
                            debitCents: true,
                            creditCents: true
                        }
                    }
                }
            })
        ]);
        // Müşteri bakiye analizi
        const customerBalances = customerStats.map(customer => {
            const totalDebitCents = customer.transactions.reduce((sum, t) => sum + Number(t.debitCents), 0);
            const totalCreditCents = customer.transactions.reduce((sum, t) => sum + Number(t.creditCents), 0);
            const balanceCents = totalDebitCents - totalCreditCents;
            return {
                customerId: customer.id,
                code: customer.code,
                name: customer.name,
                balance: (0, money_1.centsToTL)(balanceCents),
                balanceCents,
                transactionCount: customer.transactions.length
            };
        });
        // Bakiye dağılımı
        const debtCustomers = customerBalances.filter(c => c.balanceCents > 0);
        const creditCustomers = customerBalances.filter(c => c.balanceCents < 0);
        const zeroCustomers = customerBalances.filter(c => c.balanceCents === 0);
        const totalDebitCents = Number(transactionStats._sum?.debitCents ?? 0);
        const totalCreditCents = Number(transactionStats._sum?.creditCents ?? 0);
        // En büyük borçlu/alacaklı müşteriler
        const topDebtCustomers = debtCustomers
            .sort((a, b) => b.balanceCents - a.balanceCents)
            .slice(0, 10);
        const topCreditCustomers = creditCustomers
            .sort((a, b) => a.balanceCents - b.balanceCents)
            .slice(0, 10);
        // Aylık trend
        const monthlyTrend = await prisma.transaction.groupBy({
            by: ['txnDate'],
            where: dateFilter,
            _sum: {
                debitCents: true,
                creditCents: true
            },
            _count: true
        });
        const monthlyData = monthlyTrend
            .sort((a, b) => new Date(a.txnDate).getTime() - new Date(b.txnDate).getTime())
            .map(item => ({
            date: item.txnDate,
            debit: (0, money_1.centsToTL)(Number(item._sum?.debitCents ?? 0)),
            credit: (0, money_1.centsToTL)(Number(item._sum?.creditCents ?? 0)),
            count: item._count
        }));
        // Belge türü dağılımı
        const docTypeStats = await prisma.transaction.groupBy({
            by: ['docType'],
            where: dateFilter,
            _sum: {
                debitCents: true,
                creditCents: true
            },
            _count: true
        });
        const report = {
            period: {
                from: from || null,
                to: to || null
            },
            summary: {
                totalCustomers,
                totalTransactions,
                totalDebit: (0, money_1.centsToTL)(totalDebitCents),
                totalCredit: (0, money_1.centsToTL)(totalCreditCents),
                netAmount: (0, money_1.centsToTL)(totalDebitCents - totalCreditCents)
            },
            customerAnalysis: {
                totalCustomers,
                debtCustomers: debtCustomers.length,
                creditCustomers: creditCustomers.length,
                zeroCustomers: zeroCustomers.length,
                totalDebtAmount: (0, money_1.centsToTL)(debtCustomers.reduce((sum, c) => sum + c.balanceCents, 0)),
                totalCreditAmount: (0, money_1.centsToTL)(creditCustomers.reduce((sum, c) => sum + c.balanceCents, 0))
            },
            topCustomers: {
                topDebt: topDebtCustomers.map(c => ({
                    code: c.code,
                    name: c.name,
                    balance: c.balance,
                    transactionCount: c.transactionCount
                })),
                topCredit: topCreditCustomers.map(c => ({
                    code: c.code,
                    name: c.name,
                    balance: c.balance,
                    transactionCount: c.transactionCount
                }))
            },
            monthlyTrend: monthlyData,
            docTypeBreakdown: docTypeStats.map((stat) => ({
                docType: stat.docType || 'Belirsiz',
                count: stat._count,
                totalDebit: (0, money_1.centsToTL)(Number(stat._sum?.debitCents ?? 0)),
                totalCredit: (0, money_1.centsToTL)(Number(stat._sum?.creditCents ?? 0)),
                netAmount: (0, money_1.centsToTL)(Number(stat._sum?.debitCents ?? 0) - Number(stat._sum?.creditCents ?? 0))
            })),
            generatedAt: new Date().toISOString()
        };
        res.json(report);
    }
    catch (error) {
        console.error('[DASHBOARD REPORT ERROR]', error);
        res.status(500).json({
            error: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString()
        });
    }
});
// Yaşlandırma analizi raporu
router.get('/aging-analysis', async (req, res) => {
    try {
        const { customerCode, format = 'json' } = req.query;
        // Müşteri filtresi
        const customerFilter = {};
        if (customerCode) {
            customerFilter.code = String(customerCode);
        }
        const customers = await prisma.customer.findMany({
            where: customerFilter,
            include: {
                transactions: {
                    where: {
                        debitCents: { gt: 0 } // Sadece borç işlemleri
                    },
                    orderBy: { txnDate: 'asc' }
                }
            }
        });
        const agingData = customers.map(customer => {
            const now = new Date();
            const agingBuckets = {
                current: 0, // 0-30 gün
                days30: 0, // 31-60 gün
                days60: 0, // 61-90 gün
                days90: 0, // 91-180 gün
                over180: 0 // 180+ gün
            };
            let totalDebt = 0;
            customer.transactions.forEach(tx => {
                const daysDiff = Math.floor((now.getTime() - tx.txnDate.getTime()) / (1000 * 60 * 60 * 24));
                const amount = Number(tx.debitCents) / 100;
                totalDebt += amount;
                if (daysDiff <= 30) {
                    agingBuckets.current += amount;
                }
                else if (daysDiff <= 60) {
                    agingBuckets.days30 += amount;
                }
                else if (daysDiff <= 90) {
                    agingBuckets.days60 += amount;
                }
                else if (daysDiff <= 180) {
                    agingBuckets.days90 += amount;
                }
                else {
                    agingBuckets.over180 += amount;
                }
            });
            return {
                customerId: customer.id,
                code: customer.code,
                name: customer.name,
                totalDebt,
                agingBuckets,
                oldestTransaction: customer.transactions.length > 0 ? customer.transactions[0].txnDate : null
            };
        }).filter(c => c.totalDebt > 0); // Sadece borçlu müşteriler
        // Toplam yaşlandırma özeti
        const totalAging = agingData.reduce((acc, customer) => {
            acc.current += customer.agingBuckets.current;
            acc.days30 += customer.agingBuckets.days30;
            acc.days60 += customer.agingBuckets.days60;
            acc.days90 += customer.agingBuckets.days90;
            acc.over180 += customer.agingBuckets.over180;
            return acc;
        }, { current: 0, days30: 0, days60: 0, days90: 0, over180: 0 });
        const report = {
            summary: {
                totalCustomers: agingData.length,
                totalDebt: agingData.reduce((sum, c) => sum + c.totalDebt, 0),
                agingBreakdown: totalAging
            },
            customers: agingData,
            generatedAt: new Date().toISOString()
        };
        if (format === 'excel') {
            const excelData = agingData.map(customer => ({
                'Müşteri Kodu': customer.code,
                'Müşteri Adı': customer.name,
                'Toplam Borç': customer.totalDebt,
                '0-30 Gün': customer.agingBuckets.current,
                '31-60 Gün': customer.agingBuckets.days30,
                '61-90 Gün': customer.agingBuckets.days60,
                '91-180 Gün': customer.agingBuckets.days90,
                '180+ Gün': customer.agingBuckets.over180,
                'En Eski İşlem': customer.oldestTransaction ? customer.oldestTransaction.toLocaleDateString('tr-TR') : '-'
            }));
            const buffer = generateExcel(excelData, 'yaslandirma-analizi');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="yaslandirma-analizi.xlsx"');
            res.send(buffer);
        }
        else {
            res.json(report);
        }
    }
    catch (error) {
        console.error('[AGING ANALYSIS ERROR]', error);
        res.status(500).json({
            error: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString()
        });
    }
});
// Trend analizi raporu
router.get('/trend-analysis', async (req, res) => {
    try {
        const { from, to, customerCode, groupBy = 'month' } = req.query;
        // Tarih filtresi
        const dateFilter = {};
        if (from || to) {
            dateFilter.txnDate = {};
            if (from)
                dateFilter.txnDate.gte = new Date(`${from}T00:00:00`);
            if (to)
                dateFilter.txnDate.lte = new Date(`${to}T23:59:59`);
        }
        // Müşteri filtresi
        if (customerCode) {
            dateFilter.customer = { code: String(customerCode) };
        }
        let groupByField;
        let dateFormat;
        switch (groupBy) {
            case 'day':
                groupByField = 'txnDate';
                dateFormat = 'YYYY-MM-DD';
                break;
            case 'week':
                groupByField = 'txnDate';
                dateFormat = 'YYYY-WW';
                break;
            case 'month':
            default:
                groupByField = 'txnDate';
                dateFormat = 'YYYY-MM';
                break;
        }
        // İşlem verilerini al
        const transactions = await prisma.transaction.findMany({
            where: dateFilter,
            include: {
                customer: {
                    select: {
                        code: true,
                        name: true
                    }
                }
            },
            orderBy: { txnDate: 'asc' }
        });
        // Trend verilerini hesapla
        const trendData = transactions.reduce((acc, tx) => {
            let period;
            if (groupBy === 'day') {
                period = tx.txnDate.toISOString().split('T')[0];
            }
            else if (groupBy === 'week') {
                const date = new Date(tx.txnDate);
                const week = Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7);
                period = `${date.getFullYear()}-W${week.toString().padStart(2, '0')}`;
            }
            else {
                period = tx.txnDate.toISOString().substring(0, 7);
            }
            if (!acc[period]) {
                acc[period] = {
                    period,
                    count: 0,
                    totalDebit: 0,
                    totalCredit: 0,
                    customers: new Set(),
                    docTypes: new Set()
                };
            }
            acc[period].count++;
            acc[period].totalDebit += Number(tx.debitCents) / 100;
            acc[period].totalCredit += Number(tx.creditCents) / 100;
            acc[period].customers.add(tx.customer.code);
            acc[period].docTypes.add(tx.docType || 'Belirsiz');
            return acc;
        }, {});
        // Trend verilerini diziye çevir ve sırala
        const trendArray = Object.values(trendData).map((item) => ({
            period: item.period,
            count: item.count,
            totalDebit: item.totalDebit,
            totalCredit: item.totalCredit,
            netAmount: item.totalDebit - item.totalCredit,
            uniqueCustomers: item.customers.size,
            uniqueDocTypes: item.docTypes.size
        })).sort((a, b) => a.period.localeCompare(b.period));
        // Büyüme oranları hesapla
        const growthRates = trendArray.map((item, index) => {
            if (index === 0)
                return { ...item, growthRate: 0 };
            const prevItem = trendArray[index - 1];
            const growthRate = prevItem.netAmount !== 0
                ? ((item.netAmount - prevItem.netAmount) / Math.abs(prevItem.netAmount)) * 100
                : 0;
            return { ...item, growthRate };
        });
        const report = {
            filters: {
                from, to, customerCode, groupBy
            },
            summary: {
                totalPeriods: trendArray.length,
                totalTransactions: trendArray.reduce((sum, item) => sum + item.count, 0),
                totalDebit: trendArray.reduce((sum, item) => sum + item.totalDebit, 0),
                totalCredit: trendArray.reduce((sum, item) => sum + item.totalCredit, 0),
                averageGrowthRate: growthRates.reduce((sum, item) => sum + item.growthRate, 0) / growthRates.length
            },
            trend: growthRates,
            generatedAt: new Date().toISOString()
        };
        res.json(report);
    }
    catch (error) {
        console.error('[TREND ANALYSIS ERROR]', error);
        res.status(500).json({
            error: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString()
        });
    }
});
// Karşılaştırmalı rapor
router.get('/comparison', async (req, res) => {
    try {
        const { period1From, period1To, period2From, period2To, customerCodes, format = 'json' } = req.query;
        if (!period1From || !period1To || !period2From || !period2To) {
            return res.status(400).json({
                error: 'Her iki dönem için başlangıç ve bitiş tarihleri gerekli',
                errorType: 'ValidationError',
                timestamp: new Date().toISOString()
            });
        }
        const customerFilter = {};
        if (customerCodes) {
            const codes = String(customerCodes).split(',').map((c) => c.trim());
            customerFilter.code = { in: codes };
        }
        // Her iki dönem için veri al
        const [period1Data, period2Data] = await Promise.all([
            prisma.customer.findMany({
                where: customerFilter,
                include: {
                    transactions: {
                        where: {
                            txnDate: {
                                gte: new Date(`${period1From}T00:00:00`),
                                lte: new Date(`${period1To}T23:59:59`)
                            }
                        }
                    }
                }
            }),
            prisma.customer.findMany({
                where: customerFilter,
                include: {
                    transactions: {
                        where: {
                            txnDate: {
                                gte: new Date(`${period2From}T00:00:00`),
                                lte: new Date(`${period2To}T23:59:59`)
                            }
                        }
                    }
                }
            })
        ]);
        // Müşteri bazında karşılaştırma
        const comparison = period1Data.map(customer1 => {
            const customer2 = period2Data.find(c => c.id === customer1.id);
            const p1Debit = customer1.transactions.reduce((sum, t) => sum + Number(t.debitCents), 0);
            const p1Credit = customer1.transactions.reduce((sum, t) => sum + Number(t.creditCents), 0);
            const p1Net = p1Debit - p1Credit;
            const p2Debit = customer2 ? customer2.transactions.reduce((sum, t) => sum + Number(t.debitCents), 0) : 0;
            const p2Credit = customer2 ? customer2.transactions.reduce((sum, t) => sum + Number(t.creditCents), 0) : 0;
            const p2Net = p2Debit - p2Credit;
            const change = p2Net - p1Net;
            const changePercent = p1Net !== 0 ? (change / Math.abs(p1Net)) * 100 : 0;
            return {
                customerId: customer1.id,
                code: customer1.code,
                name: customer1.name,
                period1: {
                    debit: (0, money_1.centsToTL)(p1Debit),
                    credit: (0, money_1.centsToTL)(p1Credit),
                    net: (0, money_1.centsToTL)(p1Net),
                    transactionCount: customer1.transactions.length
                },
                period2: {
                    debit: (0, money_1.centsToTL)(p2Debit),
                    credit: (0, money_1.centsToTL)(p2Credit),
                    net: (0, money_1.centsToTL)(p2Net),
                    transactionCount: customer2 ? customer2.transactions.length : 0
                },
                change: {
                    amount: (0, money_1.centsToTL)(change),
                    percent: changePercent,
                    direction: change > 0 ? 'artış' : change < 0 ? 'azalış' : 'değişim yok'
                }
            };
        });
        const report = {
            periods: {
                period1: { from: period1From, to: period1To },
                period2: { from: period2From, to: period2To }
            },
            summary: {
                totalCustomers: comparison.length,
                increasedCustomers: comparison.filter(c => (c.change.amount || 0) > 0).length,
                decreasedCustomers: comparison.filter(c => (c.change.amount || 0) < 0).length,
                unchangedCustomers: comparison.filter(c => (c.change.amount || 0) === 0).length,
                averageChange: comparison.reduce((sum, c) => sum + (c.change.amount || 0), 0) / comparison.length
            },
            comparison,
            generatedAt: new Date().toISOString()
        };
        if (format === 'excel') {
            const excelData = comparison.map(item => ({
                'Müşteri Kodu': item.code,
                'Müşteri Adı': item.name,
                'Dönem 1 Borç': item.period1.debit,
                'Dönem 1 Alacak': item.period1.credit,
                'Dönem 1 Net': item.period1.net,
                'Dönem 1 İşlem Sayısı': item.period1.transactionCount,
                'Dönem 2 Borç': item.period2.debit,
                'Dönem 2 Alacak': item.period2.credit,
                'Dönem 2 Net': item.period2.net,
                'Dönem 2 İşlem Sayısı': item.period2.transactionCount,
                'Değişim Tutarı': item.change.amount,
                'Değişim Yüzdesi': item.change.percent,
                'Değişim Yönü': item.change.direction
            }));
            const buffer = generateExcel(excelData, 'karsilastirma-raporu');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="karsilastirma-raporu.xlsx"');
            res.send(buffer);
        }
        else {
            res.json(report);
        }
    }
    catch (error) {
        console.error('[COMPARISON REPORT ERROR]', error);
        res.status(500).json({
            error: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString()
        });
    }
});
// Müşteri özet raporu
router.get('/customer-summary/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const { from, to } = req.query;
        // Müşteri bilgilerini al
        const customer = await prisma.customer.findUnique({
            where: { code: String(code) }
        });
        if (!customer) {
            return res.status(404).json({
                error: 'Müşteri bulunamadı',
                errorType: 'NotFoundError',
                timestamp: new Date().toISOString()
            });
        }
        // Tarih filtresi
        const where = { customerId: customer.id };
        if (from || to) {
            where.txnDate = {};
            if (from)
                where.txnDate.gte = new Date(`${from}T00:00:00`);
            if (to)
                where.txnDate.lte = new Date(`${to}T23:59:59`);
        }
        // İşlem istatistikleri
        const [transactions, totals] = await Promise.all([
            prisma.transaction.findMany({
                where,
                orderBy: { txnDate: 'desc' },
                take: 10 // Son 10 işlem
            }),
            prisma.transaction.aggregate({
                where,
                _sum: {
                    debitCents: true,
                    creditCents: true
                },
                _count: true
            })
        ]);
        // Güncel bakiye hesapla
        const totalDebitCents = Number(totals._sum?.debitCents ?? 0);
        const totalCreditCents = Number(totals._sum?.creditCents ?? 0);
        const balanceCents = totalDebitCents - totalCreditCents;
        // Belge türü dağılımı
        const docTypeStats = await prisma.transaction.groupBy({
            by: ['docType'],
            where,
            _sum: {
                debitCents: true,
                creditCents: true
            },
            _count: true
        });
        // Aylık trend
        const monthlyTrend = await prisma.transaction.groupBy({
            by: ['txnDate'],
            where,
            _sum: {
                debitCents: true,
                creditCents: true
            }
        });
        // Rapor verilerini hazırla
        const report = {
            customer: {
                id: customer.id,
                code: customer.code,
                name: customer.name,
                phone: customer.phone,
                address: customer.address,
                accountType: customer.accountType
            },
            period: {
                from: from || null,
                to: to || null
            },
            summary: {
                totalTransactions: totals._count,
                totalDebit: (0, money_1.centsToTL)(totalDebitCents),
                totalCredit: (0, money_1.centsToTL)(totalCreditCents),
                balance: (0, money_1.centsToTL)(balanceCents),
                balanceType: balanceCents > 0 ? 'BORÇ' : balanceCents < 0 ? 'ALACAK' : 'SIFIR'
            },
            recentTransactions: transactions.map((t) => ({
                id: t.id,
                docType: t.docType,
                txnDate: t.txnDate,
                voucherNo: t.voucherNo,
                description: t.description,
                debit: (0, money_1.centsToTL)(t.debitCents),
                credit: (0, money_1.centsToTL)(t.creditCents),
                amount: (0, money_1.centsToTL)(t.debitCents > 0 ? t.debitCents : t.creditCents)
            })),
            docTypeBreakdown: docTypeStats.map((stat) => ({
                docType: stat.docType || 'Belirsiz',
                count: stat._count,
                totalDebit: (0, money_1.centsToTL)(Number(stat._sum?.debitCents ?? 0)),
                totalCredit: (0, money_1.centsToTL)(Number(stat._sum?.creditCents ?? 0)),
                netAmount: (0, money_1.centsToTL)(Number(stat._sum?.debitCents ?? 0) - Number(stat._sum?.creditCents ?? 0))
            })),
            monthlyTrend: monthlyTrend
                .sort((a, b) => new Date(a.txnDate).getTime() - new Date(b.txnDate).getTime())
                .map((item) => ({
                date: item.txnDate,
                debit: (0, money_1.centsToTL)(Number(item._sum?.debitCents ?? 0)),
                credit: (0, money_1.centsToTL)(Number(item._sum?.creditCents ?? 0)),
                net: (0, money_1.centsToTL)(Number(item._sum?.debitCents ?? 0) - Number(item._sum?.creditCents ?? 0))
            })),
            generatedAt: new Date().toISOString()
        };
        res.json(report);
    }
    catch (error) {
        console.error('[CUSTOMER SUMMARY REPORT ERROR]', error);
        res.status(500).json({
            error: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString()
        });
    }
});
// Müşteri listesi raporu
router.get('/customer-list', async (req, res) => {
    try {
        const { from, to, minBalance, maxBalance, accountType, page = '1', pageSize = '50', sort = 'balance_desc' } = req.query;
        // Tarih filtresi
        const dateFilter = {};
        if (from || to) {
            dateFilter.txnDate = {};
            if (from)
                dateFilter.txnDate.gte = new Date(`${from}T00:00:00`);
            if (to)
                dateFilter.txnDate.lte = new Date(`${to}T23:59:59`);
        }
        // Müşteri filtresi
        const customerFilter = {};
        if (accountType)
            customerFilter.accountType = String(accountType);
        // Tüm müşterileri al
        const customers = await prisma.customer.findMany({
            where: customerFilter,
            include: {
                transactions: {
                    where: dateFilter,
                    select: {
                        debitCents: true,
                        creditCents: true
                    }
                }
            }
        });
        // Bakiye hesapla ve filtrele
        const customersWithBalance = customers.map(customer => {
            const totalDebitCents = customer.transactions.reduce((sum, t) => sum + Number(t.debitCents), 0);
            const totalCreditCents = customer.transactions.reduce((sum, t) => sum + Number(t.creditCents), 0);
            const balanceCents = totalDebitCents - totalCreditCents;
            return {
                id: customer.id,
                code: customer.code,
                name: customer.name,
                phone: customer.phone,
                address: customer.address,
                accountType: customer.accountType,
                totalDebit: (0, money_1.centsToTL)(totalDebitCents),
                totalCredit: (0, money_1.centsToTL)(totalCreditCents),
                balance: (0, money_1.centsToTL)(balanceCents),
                balanceType: balanceCents > 0 ? 'BORÇ' : balanceCents < 0 ? 'ALACAK' : 'SIFIR',
                transactionCount: customer.transactions.length
            };
        });
        // Bakiye filtresi
        let filteredCustomers = customersWithBalance;
        if (minBalance || maxBalance) {
            filteredCustomers = customersWithBalance.filter(customer => {
                const balance = customer.balance || 0;
                if (minBalance && balance < Number(minBalance))
                    return false;
                if (maxBalance && balance > Number(maxBalance))
                    return false;
                return true;
            });
        }
        // Sıralama
        filteredCustomers.sort((a, b) => {
            switch (sort) {
                case 'balance_asc':
                    return (a.balance || 0) - (b.balance || 0);
                case 'balance_desc':
                    return (b.balance || 0) - (a.balance || 0);
                case 'name_asc':
                    return a.name.localeCompare(b.name);
                case 'name_desc':
                    return b.name.localeCompare(a.name);
                case 'code_asc':
                    return a.code.localeCompare(b.code);
                case 'code_desc':
                    return b.code.localeCompare(a.code);
                default:
                    return (b.balance || 0) - (a.balance || 0);
            }
        });
        // Sayfalama
        const pageNum = Number(page);
        const pageSizeNum = Number(pageSize);
        const skip = (pageNum - 1) * pageSizeNum;
        const take = Math.min(pageSizeNum, 200);
        const paginatedCustomers = filteredCustomers.slice(skip, skip + take);
        // Özet istatistikler
        const totalBalance = filteredCustomers.reduce((sum, c) => sum + (c.balance || 0), 0);
        const totalDebit = filteredCustomers.reduce((sum, c) => sum + (c.totalDebit || 0), 0);
        const totalCredit = filteredCustomers.reduce((sum, c) => sum + (c.totalCredit || 0), 0);
        const debtCustomers = filteredCustomers.filter(c => (c.balance || 0) > 0).length;
        const creditCustomers = filteredCustomers.filter(c => (c.balance || 0) < 0).length;
        const zeroCustomers = filteredCustomers.filter(c => (c.balance || 0) === 0).length;
        const report = {
            summary: {
                totalCustomers: filteredCustomers.length,
                totalBalance: (0, money_1.fmtTL)(totalBalance),
                totalDebit: (0, money_1.fmtTL)(totalDebit),
                totalCredit: (0, money_1.fmtTL)(totalCredit),
                debtCustomers,
                creditCustomers,
                zeroCustomers
            },
            pagination: {
                page: pageNum,
                pageSize: take,
                total: filteredCustomers.length,
                totalPages: Math.ceil(filteredCustomers.length / take),
                hasNext: skip + take < filteredCustomers.length,
                hasPrev: pageNum > 1
            },
            customers: paginatedCustomers,
            filters: {
                from, to, minBalance, maxBalance, accountType, sort
            },
            generatedAt: new Date().toISOString()
        };
        res.json(report);
    }
    catch (error) {
        console.error('[CUSTOMER LIST REPORT ERROR]', error);
        res.status(500).json({
            error: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString()
        });
    }
});
// Basit müşteri listesi (seçim için)
router.get('/customers', async (req, res) => {
    try {
        const { search, accountType, balanceType } = req.query;
        const where = {};
        if (search) {
            where.OR = [
                { code: { contains: String(search), mode: 'insensitive' } },
                { name: { contains: String(search), mode: 'insensitive' } }
            ];
        }
        if (accountType) {
            where.accountType = String(accountType);
        }
        // Tüm müşterileri al ve bakiye hesapla
        const customers = await prisma.customer.findMany({
            where,
            include: {
                transactions: {
                    select: {
                        debitCents: true,
                        creditCents: true
                    }
                }
            },
            orderBy: [
                { name: 'asc' },
                { code: 'asc' }
            ]
        });
        // Bakiye hesapla ve filtrele
        const customersWithBalance = customers.map(customer => {
            const totalDebitCents = customer.transactions.reduce((sum, t) => sum + Number(t.debitCents), 0);
            const totalCreditCents = customer.transactions.reduce((sum, t) => sum + Number(t.creditCents), 0);
            const balanceCents = totalDebitCents - totalCreditCents;
            return {
                id: customer.id,
                code: customer.code,
                name: customer.name,
                phone: customer.phone,
                address: customer.address,
                accountType: customer.accountType,
                totalDebit: (0, money_1.centsToTL)(totalDebitCents),
                totalCredit: (0, money_1.centsToTL)(totalCreditCents),
                balance: (0, money_1.centsToTL)(balanceCents),
                balanceType: balanceCents > 0 ? 'BORÇ' : balanceCents < 0 ? 'ALACAK' : 'SIFIR',
                transactionCount: customer.transactions.length
            };
        });
        // Bakiye tipine göre filtrele
        let filteredCustomers = customersWithBalance;
        if (balanceType) {
            filteredCustomers = customersWithBalance.filter(customer => {
                const balance = customer.balance || 0;
                switch (balanceType) {
                    case 'debt':
                        return balance > 0;
                    case 'credit':
                        return balance < 0;
                    case 'zero':
                        return balance === 0;
                    default:
                        return true;
                }
            });
        }
        res.json({
            customers: filteredCustomers,
            total: filteredCustomers.length,
            generatedAt: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('[GET CUSTOMERS ERROR]', error);
        res.status(500).json({
            error: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString()
        });
    }
});
// Detaylı müşteri raporu (PDF için hazır)
router.get('/customer-detail/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const { from, to, format = 'json' } = req.query;
        // Müşteri bilgileri
        const customer = await prisma.customer.findUnique({
            where: { code: String(code) }
        });
        if (!customer) {
            return res.status(404).json({
                error: 'Müşteri bulunamadı',
                errorType: 'NotFoundError',
                timestamp: new Date().toISOString()
            });
        }
        // Tarih filtresi
        const where = { customerId: customer.id };
        if (from || to) {
            where.txnDate = {};
            if (from)
                where.txnDate.gte = new Date(`${from}T00:00:00`);
            if (to)
                where.txnDate.lte = new Date(`${to}T23:59:59`);
        }
        // Tüm işlemler
        const transactions = await prisma.transaction.findMany({
            where,
            orderBy: { txnDate: 'desc' },
            include: {
                sources: {
                    include: {
                        file: true
                    }
                }
            }
        });
        // İstatistikler
        const totalDebitCents = transactions.reduce((sum, t) => sum + Number(t.debitCents), 0);
        const totalCreditCents = transactions.reduce((sum, t) => sum + Number(t.creditCents), 0);
        const balanceCents = totalDebitCents - totalCreditCents;
        // Belge türü analizi
        const docTypeAnalysis = transactions.reduce((acc, t) => {
            const docType = t.docType || 'Belirsiz';
            if (!acc[docType]) {
                acc[docType] = { count: 0, totalDebit: 0, totalCredit: 0 };
            }
            acc[docType].count++;
            acc[docType].totalDebit += Number(t.debitCents);
            acc[docType].totalCredit += Number(t.creditCents);
            return acc;
        }, {});
        // Aylık özet
        const monthlySummary = transactions.reduce((acc, t) => {
            const month = t.txnDate.toISOString().substring(0, 7); // YYYY-MM
            if (!acc[month]) {
                acc[month] = { count: 0, totalDebit: 0, totalCredit: 0 };
            }
            acc[month].count++;
            acc[month].totalDebit += Number(t.debitCents);
            acc[month].totalCredit += Number(t.creditCents);
            return acc;
        }, {});
        const report = {
            customer: {
                id: customer.id,
                code: customer.code,
                name: customer.name,
                phone: customer.phone,
                address: customer.address,
                accountType: customer.accountType,
                tag1: customer.tag1,
                tag2: customer.tag2
            },
            period: {
                from: from || null,
                to: to || null
            },
            summary: {
                totalTransactions: transactions.length,
                totalDebit: (0, money_1.centsToTL)(totalDebitCents),
                totalCredit: (0, money_1.centsToTL)(totalCreditCents),
                balance: (0, money_1.centsToTL)(balanceCents),
                balanceType: balanceCents > 0 ? 'BORÇ' : balanceCents < 0 ? 'ALACAK' : 'SIFIR'
            },
            transactions: transactions.map((t) => ({
                id: t.id,
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
                sources: t.sources.map((s) => ({
                    fileId: s.fileId,
                    filename: s.file.originalFilename
                }))
            })),
            docTypeAnalysis: Object.entries(docTypeAnalysis).map(([docType, data]) => ({
                docType,
                count: data.count,
                totalDebit: (0, money_1.centsToTL)(data.totalDebit),
                totalCredit: (0, money_1.centsToTL)(data.totalCredit),
                netAmount: (0, money_1.centsToTL)(data.totalDebit - data.totalCredit)
            })),
            monthlySummary: Object.entries(monthlySummary)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([month, data]) => ({
                month,
                count: data.count,
                totalDebit: (0, money_1.centsToTL)(data.totalDebit),
                totalCredit: (0, money_1.centsToTL)(data.totalCredit),
                netAmount: (0, money_1.centsToTL)(data.totalDebit - data.totalCredit)
            })),
            generatedAt: new Date().toISOString()
        };
        if (format === 'pdf') {
            // PDF formatında döndür
            const html = generateHTMLReport(report);
            const pdf = await generatePDF(html);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="musteri-${code}-rapor.pdf"`);
            res.send(pdf);
        }
        else {
            res.json(report);
        }
    }
    catch (error) {
        console.error('[CUSTOMER DETAIL REPORT ERROR]', error);
        res.status(500).json({
            error: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString()
        });
    }
});
// HTML rapor oluşturma fonksiyonu
function generateHTMLReport(report) {
    const { customer, transactions, docTypeAnalysis, monthlySummary, summary } = report;
    return `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Müşteri Raporu - ${customer.name}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            color: #333;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #007bff;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .customer-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 30px;
        }
        .section {
            margin-bottom: 30px;
        }
        .section h2 {
            color: #007bff;
            border-bottom: 1px solid #dee2e6;
            padding-bottom: 10px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        th, td {
            border: 1px solid #dee2e6;
            padding: 8px 12px;
            text-align: left;
        }
        th {
            background-color: #007bff;
            color: white;
        }
        tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        .amount {
            text-align: right;
            font-family: monospace;
        }
        .positive { color: #28a745; }
        .negative { color: #dc3545; }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .summary-card {
            background: #e9ecef;
            padding: 15px;
            border-radius: 5px;
            text-align: center;
        }
        .summary-card h3 {
            margin: 0 0 10px 0;
            color: #495057;
        }
        .summary-card .value {
            font-size: 1.5em;
            font-weight: bold;
            color: #007bff;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Müşteri Detay Raporu</h1>
        <p>Oluşturulma Tarihi: ${new Date().toLocaleDateString('tr-TR')}</p>
    </div>

    <div class="customer-info">
        <h2>Müşteri Bilgileri</h2>
        <p><strong>Müşteri Kodu:</strong> ${customer.code}</p>
        <p><strong>Müşteri Adı:</strong> ${customer.name}</p>
        <p><strong>Telefon:</strong> ${customer.phone || '-'}</p>
        <p><strong>Adres:</strong> ${customer.address || '-'}</p>
        <p><strong>Hesap Türü:</strong> ${customer.accountType || '-'}</p>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <h3>Toplam İşlem</h3>
            <div class="value">${summary.totalTransactions}</div>
        </div>
        <div class="summary-card">
            <h3>Toplam Borç</h3>
            <div class="value">${summary.totalDebit} TL</div>
        </div>
        <div class="summary-card">
            <h3>Toplam Alacak</h3>
            <div class="value">${summary.totalCredit} TL</div>
        </div>
        <div class="summary-card">
            <h3>Bakiye</h3>
            <div class="value">${summary.balance} TL</div>
        </div>
    </div>

    <div class="section">
        <h2>İşlem Türü Analizi</h2>
        <table>
            <thead>
                <tr>
                    <th>Belge Türü</th>
                    <th>Adet</th>
                    <th>Toplam Borç (TL)</th>
                    <th>Toplam Alacak (TL)</th>
                    <th>Net Tutar (TL)</th>
                </tr>
            </thead>
            <tbody>
                ${docTypeAnalysis.map((item) => `
                    <tr>
                        <td>${item.docType}</td>
                        <td>${item.count}</td>
                        <td class="amount">${item.totalDebit}</td>
                        <td class="amount">${item.totalCredit}</td>
                        <td class="amount">${item.netAmount}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="section">
        <h2>Aylık Özet</h2>
        <table>
            <thead>
                <tr>
                    <th>Ay</th>
                    <th>İşlem Sayısı</th>
                    <th>Toplam Borç (TL)</th>
                    <th>Toplam Alacak (TL)</th>
                    <th>Net Tutar (TL)</th>
                </tr>
            </thead>
            <tbody>
                ${monthlySummary.map((item) => `
                    <tr>
                        <td>${item.month}</td>
                        <td>${item.count}</td>
                        <td class="amount">${item.totalDebit}</td>
                        <td class="amount">${item.totalCredit}</td>
                        <td class="amount">${item.netAmount}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="section">
        <h2>Son İşlemler (İlk 50)</h2>
        <table>
            <thead>
                <tr>
                    <th>Tarih</th>
                    <th>Belge Türü</th>
                    <th>Fiş No</th>
                    <th>Açıklama</th>
                    <th>Borç (TL)</th>
                    <th>Alacak (TL)</th>
                </tr>
            </thead>
            <tbody>
                ${transactions.slice(0, 50).map((t) => `
                    <tr>
                        <td>${new Date(t.txnDate).toLocaleDateString('tr-TR')}</td>
                        <td>${t.docType || '-'}</td>
                        <td>${t.voucherNo || '-'}</td>
                        <td>${t.description || '-'}</td>
                        <td class="amount">${t.debit}</td>
                        <td class="amount">${t.credit}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
</body>
</html>
  `;
}
exports.default = router;
