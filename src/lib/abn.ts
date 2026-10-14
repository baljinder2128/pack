/** Digits only, e.g. "51 824 753 556" -> "51824753556". */
export function cleanAbn(s: string | null | undefined): string {
  return String(s ?? '').replace(/\D/g, '');
}

/** Checks the ABN check digits (ATO weighting rule), so typos are caught before a lookup. */
export function isValidAbn(s: string): boolean {
  const d = cleanAbn(s);
  if (d.length !== 11) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = d.split('').reduce((t, c, i) => t + (Number(c) - (i === 0 ? 1 : 0)) * weights[i], 0);
  return sum % 89 === 0;
}

/** "51824753556" -> "51 824 753 556". */
export function formatAbn(s: string | null | undefined): string {
  const d = cleanAbn(s);
  return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : String(s ?? '');
}
