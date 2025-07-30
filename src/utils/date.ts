export function parseDate(s: string): Date {
  const [d, m, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d);
}
export function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}
