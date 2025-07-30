export const toCents = (n?: number | null) =>
  n == null || Number.isNaN(n) ? null : Math.round(n * 100);

export const centsToTL = (c?: number | null) =>
  c == null ? null : (c / 100);

export const fmtTL = (c?: number | null) =>
  c == null ? '0.00' : (c / 100).toFixed(2); 