/**
 * RFC 4180 CSV with protection against spreadsheet formula injection: cells starting with
 * = + - @ (or tab/CR) are prefixed with an apostrophe. A UTF-8 BOM makes Excel read Khmer text
 * correctly.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
