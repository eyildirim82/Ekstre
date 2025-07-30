// src/utils/number.ts
export function parseTL(input?: string | number): number {
  if (input == null) return 0;
  if (typeof input === 'number') return input;

  // Temizle
  const raw = String(input).trim().replace(/\s/g, '');
  if (!raw) return 0;

  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');

  if (hasComma && hasDot) {
    // Avrupa formatı varsay: . = binlik, , = ondalık
    const norm = raw.replace(/\./g, '').replace(',', '.');
    const n = Number(norm);
    return isNaN(n) ? 0 : n;
  }

  if (hasComma && !hasDot) {
    // Sadece virgül varsa ondalık kabul et
    const n = Number(raw.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  // Hiç virgül yok; sadece nokta veya düz sayı:
  const dotCount = (raw.match(/\./g) || []).length;
  if (dotCount > 1) {
    // Birden fazla nokta → sonuncusu ondalık, diğerleri binlik kabul et
    const parts = raw.split('.');
    const last = parts.pop();
    const norm = parts.join('') + (last ? '.' + last : '');
    const n = Number(norm);
    return isNaN(n) ? 0 : n;
  }

  // Tek nokta veya hiçbiri → doğrudan sayı
  const n = Number(raw);
  return isNaN(n) ? 0 : n;
}
