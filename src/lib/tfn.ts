// Tax file number helpers. No imports so it can be unit tested with plain Node.

export function cleanTfn(s: string | null | undefined): string {
  return String(s ?? '').replace(/\D/g, '');
}

/** ATO check: 8 or 9 digits whose weighted sum divides by 11. */
export function isValidTfn(s: string): boolean {
  const d = cleanTfn(s);
  if (d.length !== 8 && d.length !== 9) return false;
  const weights = d.length === 9 ? [1, 4, 3, 7, 5, 8, 6, 9, 10] : [10, 7, 8, 4, 6, 3, 5, 1];
  return [...d].reduce((t, c, i) => t + Number(c) * weights[i], 0) % 11 === 0;
}

/** 123456782 as "123 456 782". */
export function formatTfn(s: string): string {
  return cleanTfn(s).replace(/(\d{3})(?=\d)/g, '$1 ');
}
