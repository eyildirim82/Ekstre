"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDate = parseDate;
exports.formatDate = formatDate;
function parseDate(s) {
    const [d, m, y] = s.split('/').map(Number);
    return new Date(y, m - 1, d);
}
function formatDate(d) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
}
