"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fmtTL = exports.centsToTL = exports.toCents = void 0;
const toCents = (n) => n == null || Number.isNaN(n) ? null : Math.round(n * 100);
exports.toCents = toCents;
const centsToTL = (c) => c == null ? null : (c / 100);
exports.centsToTL = centsToTL;
const fmtTL = (c) => c == null ? '0.00' : (c / 100).toFixed(2);
exports.fmtTL = fmtTL;
